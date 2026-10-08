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
//          less than ~10 s, PLUS the one real haiku chat turn. Target ≤2 min,
//          over N parallel lanes + one serial lane (FAST LANES, 2026-10-04).
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
//   node scripts/ci.mjs --heavy --shard <i>/<n> [--dry-run]
//                                        ONE slice of the heavy tier (SHARDS —
//                                        the Actions matrix): a PARTIAL run,
//                                        never the tier's verdict; --dry-run
//                                        lists the slice (no lock, no build);
//                                        with --only / --affected: exit 2
//   node scripts/ci.mjs --check-heavy    exit 1 if a red heavy blocks a push
//   node scripts/ci.mjs --status         last heavy result per sha
//   node scripts/ci.mjs --census         the tier census self-test
//   node scripts/ci.mjs --reap           kill scratch-dir orphans (what every suite run does after itself),
//                                        printing every victim (pid, ppid, command, root, rule + its
//                                        evidence: owner, age, what named the root) — under the same
//                                        machine-wide sweep lock as every tier (exit 3 = could not take it);
//                                        --reap --dry-run prints the verdict per candidate (victims, the
//                                        spared and why, the processes naming no root) and signals nothing
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
// Mirrored in .github/workflows/ci.yml (fast as one job; heavy as a matrix of
// --shard slices plus one aggregate `heavy` status — see SHARDS).
// Gate for this file: scripts/test-ci-gate.mjs.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gitEnvFrom } from './git-env.mjs';
import { procStat, procBootMs, procBornMs, machineBootId, readRunRecord, runOwnerState, stampScratchRun } from './scratch-run.mjs';
import { sweepScratchDirs } from './scratch-sweep.mjs';
import { WORK_ROOT } from './scratch.mjs';

const HERE = fileURLToPath(import.meta.url);
const repo = path.resolve(path.dirname(HERE), '..');
// This file is imported by scripts/test-architecture.mjs (the census) and is
// launched from a git hook, so EVERY git it runs gets the sanitized
// environment — a hook exports GIT_DIR/GIT_INDEX_FILE and the heavy tier runs
// `git worktree add` (scripts/git-env.mjs has the full essay).
const GIT_ENV = gitEnvFrom(process.env);

// ─────────────────────────────────────────────────────────────────────────
// THE TIER TABLE. `tier` is 'fast' or 'heavy'; EVERY row states WHY it is in
// its tier, with the measured wall time that says so, because a tier without a
// reason is where suites go to be forgotten. A HEAVY row names its category —
// chrome / server / cli / binary / slow / adopted; a FAST row names its KIND
// (THE TIER RULE, next). Both tiers are ordered by MEASURED cost, cheap first,
// so a pure-logic regression fails in seconds.
//
// THE TIER RULE (B-f4cb, 2026-09-27). The fast tier was built as the ≤ 2 min
// pre-push battery (B-4c5a) and grew, one reasonable exception at a time, to
// 184 suites / ~1050 s on this box and > 15 min on the Actions runner: the
// in-hook run outlived the ssh session of `git push` (nothing transferred,
// twice in one week) and the mirror's fast job was cancelled at its timeout.
// A gate people wait 17 minutes for is a gate people route around, so the
// fast tier is now defined by a RULE instead of by a running total. A suite is
// FAST only if BOTH hold:
//   (1) its row's `why` begins with its KIND, one of
//         PURE        the module(s) called directly; nothing but the tree read;
//         in-process  the real modules driven inside the suite's own node
//                     process — scratch files, fake servers on free ports,
//                     stubs, patched copies; a child process only for git
//                     (reading the tree, a throwaway repository), the shell's
//                     own utilities as fixture builders (sh, sleep, grep,
//                     strings, python3), or the repo's OWN node scripts
//                     against stubs (a wrapper under a fake CLI, a data/bin CLI
//                     against a stub server, the agentd bundle);
//         LAW <money|credential|kill|architecture>
//                     the single wiring pin of a law that must block a push,
//                     named — the only kind that may carry an `allow` for what
//                     (2) otherwise forbids, and each allowance says why;
//         EXCEPTION   an owner decision, named (there is ONE: test-chat-e2e,
//                     the one real turn, owner 2026-09-07);
//   (2) it does NOT boot a scratch server, drive a browser, add a checkout or
//       run a real external program (an agent CLI, an X/display server, xpra,
//       dtach, agent-browser, strace/lsof, ssh) unless its row `allow`s it,
//       AND it measured < 10 s here (FAST_MAX_MS — the median of the last
//       three fast runs, written in the `why` after the kind: `PURE · 40 ms`).
// Everything else is HEAVY — and nothing is lost by that: the heavy tier runs
// DETACHED after every push, IMPACT-SCOPED to the suites whose inputs the push
// touched (a suite that boots the product is selected by every product
// change; the boot smokes are `always`), in FULL at least once per 24 h; a red
// heavy verdict blocks the NEXT push; and the Actions mirror runs the full
// heavy tier on every push. A suite that MIXES a PURE half with a boot half
// moves whole; if the PURE half guards a money / credential / kill /
// architecture law it is extracted into its own fast suite
// (`test-<name>-model.mjs`) — never by default.
// Measured when the rule landed: 184 fast suites / 1051 s → 162 / see the
// kb-file-structure ci.mjs essay (23 moved: every one ≥ 10 s or booting; one
// credential law's PURE half extracted, test-channels-accounts-model).
// FAST_DISQUALIFIERS is the grep-derived half of (2): test-ci-gate §2 runs it
// over every fast row (and `--census` prints it) — a hit its row does not
// `allow` is red, and so is an `allow` nothing in the source needs.
// ─────────────────────────────────────────────────────────────────────────
export const FAST_MAX_MS = 10000;
export const FAST_KINDS = /^(PURE|in-process|LAW (?:money|credential|kill|architecture)|EXCEPTION)\b/;
const REAL_PROGRAMS = 'claude|codex|opencode|agent-browser|google-chrome(?:-stable)?|chromium(?:-browser)?|Xvfb|Xvnc|Xtigervnc|x11vnc|xpra|dtach|strace|lsof|ssh';
export const FAST_DISQUALIFIERS = Object.freeze([
  // every server.js spawn in a suite hands the server scratch.mjs vncEnv() — test-architecture §57 makes that the premise
  { key: 'server', what: 'boots a scratch server (it uses scratch.mjs vncEnv, the §57 passport of every server.js spawn)', re: /\bvncEnv\b/ },
  { key: 'checkout', what: 'adds a git worktree', re: /['"`]worktree['"`]\s*,\s*['"`]add['"`]/ },
  // ONBOARDED_SOURCE = the §47 passport of every suite that navigates the app in chrome; the spawn form = a browser launched by hand
  { key: 'chrome', what: 'drives a browser (scratch.mjs ONBOARDED_SOURCE, or a launch carrying --headless / --remote-debugging-port)', re: /\bONBOARDED_SOURCE\b|\bspawn(?:Sync)?\((?!\s*process\.execPath\b)\s*[^,()]+,\s*\[[^\]]*['"`]--(?:headless|remote-debugging-port)\b/ },
  // a real program by its literal name as the command, a `command -v` / `which` probe for one (a probe exists to run it), a `cmd:` field naming one, or an X server started through desktop-display
  { key: 'binary', what: `runs a real external program (${REAL_PROGRAMS.replace(/\(\?:[^)]*\)\?/g, '').split('|').join(' / ')})`, re: new RegExp(`\\b(?:spawn|spawnSync|execFile|execFileSync|exec|execSync|fork)\\(\\s*['"\`](?:/usr/(?:local/)?bin/)?(?:${REAL_PROGRAMS})['"\`\\s]|(?:command -v|\\bwhich)\\s+['"]?(?:${REAL_PROGRAMS})\\b|\\bcmd\\s*:\\s*['"\`](?:${REAL_PROGRAMS})['"\`]|\\bstartXServer\\(`) },
]);
/** PURE over one row + its suite source: THE TIER RULE's findings for a FAST row (empty `problems` = it may stay). */
export function fastRuleFindings(row, source) {
  const src = stripComments(source || '');
  const hits = FAST_DISQUALIFIERS.filter((d) => d.re.test(src)).map((d) => d.key);
  const allow = Array.isArray(row.allow) ? row.allow : [];
  const k = FAST_KINDS.exec(row.why || '');
  const kind = k ? k[1].split(' ')[0] : null;
  const t = /·\s*(\d+(?:\.\d+)?)\s*(ms|s)\b/.exec(row.why || '');
  const measuredMs = t ? Math.round(Number(t[1]) * (t[2] === 's' ? 1000 : 1)) : null;
  const problems = [];
  if (!kind) problems.push("its why names no kind (PURE / in-process / LAW <money|credential|kill|architecture> / EXCEPTION)");
  if (allow.length && kind !== 'LAW' && kind !== 'EXCEPTION') problems.push(`an allow on a ${kind || 'kindless'} row (only a LAW or an EXCEPTION may carry one)`);
  for (const key of hits) if (!allow.includes(key)) problems.push(`${key}: ${FAST_DISQUALIFIERS.find((d) => d.key === key).what}`);
  for (const key of allow) if (!hits.includes(key)) problems.push(`allow '${key}' but nothing in the suite needs it (a dead allowance)`);
  if (measuredMs === null) problems.push("its why carries no measured time (`<kind> · <n> ms|s`)");
  else if (measuredMs >= FAST_MAX_MS && kind !== 'EXCEPTION') problems.push(`measured ${measuredMs} ms ≥ ${FAST_MAX_MS} ms`);
  return { hits, allow, kind, measuredMs, problems };
}
export const SUITES = [
  // ── FAST TIER — the pre-push gate, by THE TIER RULE above. MEASURED
  // cheap→expensive so a pure-logic regression fails in seconds.
  { name: 'test-lazy', tier: 'fast', why: 'PURE · 15 ms' },
  { name: 'test-memory-pressure', tier: 'fast', why: 'PURE tables + one stubbed watch run (real ps) · 0.4 s' }, // lane browser-resource-care (B-afeb): the pressure episode, who started each process group, the words, the disk verdict, the daemon TMPDIR
  { name: 'test-mount-health', tier: 'fast', why: 'PURE tables + one fake-SafeFs canary run · 0.6 s' }, // lane fuse-canary-notice (B-b327): the canary episode, who presses a wedged mount, the words, the pause verdict per kind, the fixture-driven gates
  { name: 'test-fork-flag', tier: 'fast', why: 'PURE · 0.1 s' }, // B-8b7b: the server derives --fork-session from the fork fact (one producer, every transport); a fork whose CLI holds its parent's id is killed before its first turn
  { name: 'test-boot-phase', tier: 'fast', why: 'PURE · 0.4 s' }, // B-0ece: the server boot phase (booting → ready, the stuck cap + its boot-stuck event), the boot ladder (1 → 2 → 5 → 10 s then the Reload button, a stall bound per request), the reload rule waits for ready; the wiring; four patched-copy controls
  { name: 'test-timed-sync', tier: 'fast', why: 'in-process · 40 ms' }, // design 011 lane 1 (store-timing): the store-write clock — buckets, the closed names, zero overhead when off, the real stores' names
  { name: 'test-fs-canary', tier: 'fast', why: 'in-process · 6.7 s' }, // design 011 lane 1: a blocked loop never reads as a slow mount (the canary's stat timed in its own SafeFs worker; a main-clock control)
  { name: 'test-migrations', tier: 'fast', why: 'in-process · 1.3 s' },
  { name: 'test-auto-cli-refresh', tier: 'fast', why: 'in-process · 168 ms' },
  { name: 'test-auto-cli-tick-reads', tier: 'fast', why: 'in-process · 5 s (two real engines + fix-reverted copies; the 150 µs-per-fs-call loop leg)' },
  { name: 'test-task-wakeup-card', tier: 'fast', why: 'PURE · 25 ms' }, // background-task lifecycle closure incl. the real record order (tool_result BEFORE the completion notification); also joined the gate late (same class)
  { name: 'test-dial-link-kept', tier: 'fast', why: 'in-process · 4.6 s measured (verify-r3 B-rst: a REAL http server + the real gate, four real TCP clients that answer with an RST — after a refusal, an unknown name\'s refusal, a probe\'s 200, inside admitDial\'s probe window — nothing uncaught; a no-guard control copy lets 4 ECONNRESETs through, +1.4 s; verify-r1 C2: a dialed device that refuses our host key keeps its link — a fake daemon over the real Mux, the real DeviceManager + deviceForDial, a no-keep control copy; verify-r2 B9-r2a: the real admitDial over an answering fake daemon — a header-less newcomer refused, the 700 ms hello-in-flight window joined, a silent current replaced after the 1.5 s probe, a closed-world control under r1\'s rule; verify-r2 the dial endpoint: the real gateDialUpgrade over fake sockets — one answer for an unknown name and a wrong token, the answer before the record, 2 000 knocks ⇒ ≤ 62 journal lines with the row still recording, two devices behind one address, the right token admitted, the duplicate note written once; four patched-copy controls, +60 ms)' },
  { name: 'test-device-upgrade-watch', tier: 'fast', why: 'in-process · 75 ms (lane device-upgrade-stuck: the stuck-upgrade door — one For-you item per machine and version over the real UserTodoManager + HostManager.list, self-resolve, 2 patched-copy controls)' },
  { name: 'test-agentd-upgrade-loop', tier: 'fast', why: 'in-process · 550 ms (verify-r1 C1: the per-device upgrade ledger over a fake never-converging daemon on the real Mux, four rebuilt instances)' },
  { name: 'test-pool-auto', tier: 'fast', why: 'in-process · 146 ms' },
  { name: 'test-pool-placement-ui', tier: 'fast', why: 'in-process · 120 ms' }, // THE POOL'S PLACEMENT, SEEN (2026-09-28, DOM-free): the Members… dialog's Manual-priority rows (places, a member's state in words, only-what-applies menus, the #1 row's never-greyed "Move every conversation here now"), the Placement switch's seed (the pool's verdict moves nothing) and clear, the chip's placement note — en/zh/ja from the real dictionaries
  { name: 'test-settings-view', tier: 'fast', why: 'in-process · 300 ms' }, // THE SETTINGS VIEW, DECIDED (B-df40 part 2, DOM-free): rowRelevant's truth table over every `when` tag (unknown ⇒ shown), the four rules (search · modified · relevance · advanced fold) on a fixture, the shipped schema (Codex / Desktop apps / Lark hidden by their facts, every row reachable by search), words en/zh/ja, wiring pins, 6 patched-copy controls
  { name: 'test-claude-hot-switch', tier: 'heavy', why: 'a REAL claude binary in a loopback-only netns (sudo) — re-measures capsOf(claude).hotSwitch on the installed CLI · ~40 s' }, // lane-hot-switch: the switching verdict is a measurement (test-architecture §67)
  { name: 'test-hot-switch-incident', tier: 'fast', why: 'in-process · 250 ms' }, // lane-hot-switch (2026-09-30): a stalled bridge's backlog is not taken as live (the real parse + engine + pool over real symlinks, patched-copy controls per mechanism)
  { name: 'test-record-lateness', tier: 'fast', why: 'PURE · 300 ms' }, // lane reset-path verify r7: THE LATE-RECORD RULE\'S SHAPE TABLE — arrival × delay × magnitude × follow (288 cells) judged by the real module against a hand-written truth; the dead-bridge shapes never declare, a true skew declares at 60 s and is never un-declared by its own records; r7 F1 (one out-of-band record poisoned the run for good) + T2's attacks pinned; seven patched-copy controls (one per rule) + the engine's hold/replay wiring
  { name: 'test-fd-limit', tier: 'fast', why: 'in-process · 5 s (§B measures node raising its own soft limit under prlimit — two ~50 ms children; §G\'s pre-fix control dies in a child)' }, // lane-dead-bridge (2026-09-30 12:03:17): the unit's LimitNOFILE states the limit node really runs at, the fd gauge (80 %, once an hour, it FALLS — a latched copy caught), WHO ran out (this server / the FUSE mount's daemon / the machine), the debounced writes never throw (the pre-fix copy dies of the same EISDIR)
  { name: 'test-bridge-liveness', tier: 'fast', why: 'in-process · 1.9 s (lane fast-budget: was 12 s — the re-arm leg slept 10.5 s on real timers; it fires the watch\'s own captured intervals now)' }, // lane-dead-bridge: the orphan verdict (an attach CLIENT a dead server left — never a master: the rows measured on production + a copy without the tty guard caught), silence judged against the CLI's own witnesses, the catch-up + its card, the watch over a fake /proc, the wiring (the one healer, the crash-path teardown)
  { name: 'test-fable-cap-pool-storm', tier: 'fast', why: 'in-process · 846 ms' }, // the 2026-09-13 storm: placement must follow the REQUEST model (a safety-classifier fallback is announced once and then silent), a model-cap rejection must mark the model's cap and not the plan lane (claude has no `seven_day_fable` type), and a healthy current member is never "no member can serve it" — real engine + real pool + real symlinks + the real stdout consumer, each fix with a patched-copy pre-fix control
  { name: 'test-desktop-apps', tier: 'fast', why: 'in-process · 344 ms' }, // DESKTOP APPS (docs/design-desktop-apps §6): the PURE model — registry validation, the resolveBackend ladder over the full presence matrix with §3's fallback text verbatim, the state machine, cap/runaway/idle/adoption verdicts, the ONE constants home. No process, ~0.1s
  { name: 'test-stream-relays', tier: 'fast', why: 'in-process · 90 ms: rv-desktop-apps F-B4: a picture-stream kind = its relay + view modules + ONE line in each registry; a fake third kind reaches the real bridge (live ws upgrade) and the client view factory; the pre-lane hand list control refuses it' },
  { name: 'test-rfb-greeting', tier: 'fast', why: 'in-process · 300 ms' }, // design 014 D1 (lane desktop-vnc-native): the vnc-native rung's PURE pieces — rfbGreeting over 3.3 / 3.7 / 3.8 / Apple 3.889 greetings, type lists (1, 2, 30, unknown, the server's order), refusals, every truncation; the viewer-type + version tables pinned to the BUNDLED noVNC; desktopRunPlan (the line run whole and shown as itself — darwin positional $1, win32 one PowerShell literal in -EncodedCommand; multi_line / hidden_chars / too_long / empty / not_desktop_machine by name); the TightVNC plan's frozen flag table (loopback only), pinned URL + SHA-256, no password, the UAC starter; presets; patched-copy controls for each rule. No process
  { name: 'test-runaway-guard', tier: 'fast', why: 'in-process · 45 ms' }, // THE RESOURCE VERDICT (2026-09-25, the Chrome desktop-app incident + the owner's ruling): memory judged by the sample's own footprint metric (PSS, or anon+shm for ONE process), a per-process sum (summed RSS / anon-sum) never judged, the CPU rule + reaped ticks unchanged, the report level (r2: re-arm band + hourly floor + undelivered ⇒ re-sent; the oscillation fixture ⇒ one notice), the notice words, the per-provider numbers; negative controls (an rssBytes comparison trips on the incident fixture; no hysteresis ⇒ 1010101010; an undelivered notice latched) in scratch copies (<1 s, pure)
  { name: 'test-terminal-ui-scale', tier: 'fast', why: 'PURE · 33 ms' }, // 2.369.118 (userW inc-mu92zsgw-6c9y): every xterm container is counter-zoomed against the body DPI zoom and every font-size writer scales by uiScale() — the wiring pins; the chrome leg is test-terminal-zoom-select (heavy)
  { name: 'test-browser-passkey', tier: 'fast', why: 'in-process · 290 ms: PURE verdict + words + the hook over a fake navigator.credentials + the watch over a fake CDP socket + patched-copy controls' }, // LANE BROWSER-PASSKEY (owner inc-muuvthv9-g69w): a page waiting for a passkey is a named fact with a way out
  { name: 'test-browser-prompts', tier: 'fast', why: 'in-process · 1 s: PURE record + words tables (en/zh/ja) + a patched-copy control + the watch over a fake CDP socket (file chooser, HTTP sign-in, For-you, hold) + the credential census' }, // LANE BROWSER-UI-PROMPTS (B-ebfc): a file chooser and an HTTP sign-in the screencast cannot paint are named, answerable facts
  { name: 'test-ws-keepalive', tier: 'fast', why: 'in-process · 8 s (⑥: two real stall storms)' }, // LANE STREAM-PING (browser-windows BL-r5-2: a half-open live-view viewer stayed counted until the kernel's TCP timeout): THE ONE ws keepalive rule (src/ws-keepalive.js) — the PURE step table, armKeepalive on a fake socket + a never-drops mutant control, the *-stream.js census + a planted control, and the REAL browser bridge over a fake upstream: a viewer that never pongs is dropped within 2 × keepaliveMs with ONE named close line, the count falls, the other viewer keeps its picture; verify r1 ⑤⑥: OUR OWN STALL IS NO VERDICT (2.369.16) — the stall table, the loop-gap gauge + its wiring, and the real bridge through a sync-burst storm keeps all 3 live viewers (control: the pre-fix rule drops all 3)
  { name: 'test-claude-retention', tier: 'fast', why: 'in-process · 267 ms' }, // 2.369.118 → 2.369.123: claude.transcriptRetentionDays (default 36500) → cleanupPeriodDays through the SHARED CLI-config applier (ensureCliConfig) + the shipped helper driven by VIBESPACE_CLI_CONFIG (apply / --status / --uninstall; r7: through a symlinked settings.json, and a `..` plan never reaches the applier) + the three env sites pinned; scratch HOME only. Lane hooks-create (2026-10-01) §6–§9: the 'dir-exists' create rule (dir missing ⇒ refused + said, dir present ⇒ created 0600, CAS + symlink + the create-gap race, a mkdir patched copy + the pre-lane rule as controls), ensureAgentHooks on a scratch HOME with ~/.claude absent / present, the late-hooks notes + ONE For-you line + the stale drop + the Apply route, wiring pins, the owner's HOME hashed before/after
  { name: 'test-jobs-browser', tier: 'fast', why: 'in-process · 1.6 s (lane fast-budget: was 30 s — four waits on the jobs engine\'s 5 s sweep; the wait asks the sweep now) — PURE tables + the real routes + keeper over the fake agent-browser 0.38.1 and the window model (test-browser-windows ④\'s harness)' }, // lane jobs-browser (B-dbc1): a jbt_ job browses as its OWNER conversation — the PURE principal table, the route census (every /api/agent/browser/* route judged for a job), admission through the real mayAttach, the keeper's job lease (own window, released at finalize, the boot sweep), 3 mutant-copy controls
  { name: 'test-server-root', tier: 'fast', why: 'in-process · 60 ms' }, // lane hook-root-guard (B-c77a): src/server-root.js rootVerdict — a server's root is judged before any owner-file write (worktree / tmp / override / FORCE only under a scratch HOME); 32-row table + 3 mutant-copy controls + the writer census
  { name: 'test-helper-ask', tier: 'fast', why: 'in-process · 883 ms (verify-r6 ⑳ K1 the whole request, K4 the server\'s own record, K5 hidden characters + second press — controls per fix)' }, // LANE S1 (B-6e95, both naive-user studies' T9: two helpers sat 4–18 min on "running Fetch page" behind a "waiting for you" chip nothing could answer): the PURE model src/helper-ask.js (which record is a helper's ask — agent_id, the HELPER's tool_use_id, no parent_tool_use_id; its Agent call through task_started; the chip / card / inbox words; the stopped helper's chip + the CLI's canned rejection; which live session answers a helper view's frame), then the MEASURED 2.1.281 stream (scripts/fixtures/helper-ask-2.1.281, ids remapped) through the REAL normalizers + live gate — ONE card per ask on the right helper's Agent card, the same request on the helper's own tool card, Always allow settling both, the stop withdrawing the other; restart (rebuild both orders, a late helper view seeded, session-store honouring a withdrawn request); the ORCH half (one For-you item at 60 s, origin agent, resolved on answer/withdraw/restart; a helper view's answer reaching the PARENT's stdin as the exact frame the CLI took); wiring pins; two patched-copy controls (the pre-lane normalizer drops the ask; the gate without its route leaves the helper's own card button-less); verify r2: ⑦ a future CLI's parent_tool_use_id on the ask reaches the parent (REAL consumer), ⑧ a stale View Log answer routes only to a session that KNOWS the request, ⑨ a withdrawal after our own answer reads withdrawn, ⑩ For you keeps a shared item while a twin waits + files the ask past the 20-item cap in the sync that makes room, ⑤ the ONE-answer-path census — each with a patched-copy control; verify r3: ⑪ THE ASK TABLE (7 × 13, every cell against the laws, the PURE walk 36 × 2000, five table mutants), ⑫ the consumer census (no ask-state literal outside the table), ⑬ THE WALK ON THE REAL ENGINE (2 000 seeded steps, ~130 real rebuilds, stdin per ask, the table as oracle), ⑭ the restart matrix (six states × server restart / Terminate + Resume), ⑮ a re-ask after a withdrawal, ⑯ the 60 s clock across a restart (+ control; r4: the order-insensitive key + control), ⑰ the takeover seam (r4: the helpers' pending browser approvals swept by the browser THEIR commands land on, over the REAL announcer + a main-cards-only control); verify r4: ⑬ counts EVERY effect per step against the cell (For-you adds/dones, card ops, the pending-asks op, the meta write) with two ENGINE mutants the r3 oracle cannot see, ⑭ the CLI's own 300 s deadline as `denied`, ⑱ the unknown word (a foreign resolution never locks; a new request subtype / nested field is a drift card). ~3 s, no network
  { name: 'test-reattach-stagger', tier: 'fast', why: 'in-process · 135 ms' }, // B-63f1 ② (lane S1 verify r2): the ops of the 0–500 ms epoch-reset stagger are HELD for the rebuild and drained after the slab they post-date (src/lib/chat-view.js _armViewReset / _holdResetOp / _drainResetQueue) — the real ChatView prototype over a fake ws + fake timers: the window's ops not rendered into the list the slab replaces, watermark untouched until applied, seq ≤ opSeq skipped, a create the slab holds dedups by id, a lagged inside the window re-attaches from the OLD position and the newer snapshot supersedes (one rebuild, whole view), a held resume while pending queues its replay, foreign-epoch ops dropped, dispose ends the rebuild, the cap poisons (and the poison survives the rebuild's own heal: a heal re-attach with no seq), a throwing rebuild poisons; the jitter seam; wiring pins; two patched-copy controls (the hold removed ⇒ the measured loss; the overflow re-poison removed ⇒ a lost op under a clean watermark). ~0.5 s
  { name: 'test-agent-tool-rules', tier: 'fast', why: 'in-process · 210 ms (verify-r6 ⑭ K2 plain words name every extra command, K3 updatesText, K4 answerFromRecord — controls per fix)' }, // LANE L (the naive-user study 2, 2026-09-25: 7–15 'Permission: Bash' cards per browser task, Always Allow never sticking): the PURE rule table src/agent-tool-rules.js (every rule a 2.1.281 PREFIX rule; vibespace-job run/start/access held; the AGENT_TOOLS census — every vibespace-* tool allowed or held, with a why; every job verb decided), the matcher mirror of the CLI's prefix semantics, widenSuggestions (the CLI's two-word suggestion → the tool's rule), the plain words + the close --all scope, the adapter carrying the rules in the ONE --settings flag on every spawn (row off ⇒ none; a user's inline allow/deny kept; a --settings FILE untouched), the control_response naming `updatedPermissions` never `permission_updates` (stripped by the CLI — every Always Allow had been a plain Allow), the claude row, the permission-mode words, zh+ja, and a binary oracle (EVIDENCE SKIP without the CLI). ~0.3 s
  { name: 'test-xpra-client', tier: 'fast', why: 'in-process · 6.3 s' }, // P8-2 x2 (docs/design-desktop-apps §7): the PURE xpra words (hello caps, every packet form vs xpra-html5 v21 on 6.5.3, the browser-key → keysym rule incl. the U<hex> IME path, the pane FIT under size hints, the wheel-as-buttons accumulator, the clipboard delivery rule), the DOM-free session over a FAKE worker (fit-before-map, every non-popup window placed inside, §2b the bounded BELT undoing the app's own resize/move with its within-one-increment control, draws painted IN ORDER under an out-of-order decoder and every one acked, the clipboard both ways with dedupe, resize ⇒ display-configure + refit, view-only drops input, a disconnect names its reason, no-hello closes), the view under a fake DOM (the plain-http chip vs the API branch, the shell's paste box on plain http / a refusal and the not-connected refusal, Ctrl+V left to the browser, composition → typed text, pointer from the pane's rect, the ladder), and the grep census (one worker site, one .desktop-bar, a theme-var pane, the worker asset spelled once). ~2 s, no chrome
  { name: 'test-desktop-seamless', tier: 'fast', why: 'in-process · 562 ms' }, // ROUND 3 LANE B (docs/design-desktop-apps-seamless §3.3, D3): the PURE seamless verdict over its FULL 192-row matrix against the design's formula (why = wanted first, then the pause; per-app toggle precedence; the global off; lease / chain / phone / disconnected holding even a forced on) with a pause-less patched-copy control, the reveal arithmetic (250 ms hover, Alt, the 1.5 s linger, leave = fold) as PURE transitions, moveResizeAction / windowStateAction / the frame key+choice+menu, the REAL WindowManager seams over a fake DOM (beginDragFromPointer = the title bar's own drag from the press point, beginResizeFromPointer = the handles' own resize with the minimum, a CANCEL restoring either, a tab guest dragging its host) and the wiring / CSS / menu / i18n pins. ~0.3 s, no browser
  { name: 'test-desktop-app-scale', tier: 'fast', why: 'in-process · 627 ms' }, // DESKTOP LANE D (b) (docs/design-desktop-apps-seamless §3.4 note, the owner's 2026-09-25 report): THE PER-APP DEFAULT SCALE + THE CLICKABLE CHIP — the widened explicit set (1/1.5/2/2.5/3, each spelled EXACTLY by scaleKnobs — lane D (a)'s ceil rule and a browser row's dpi rule; the Settings enum unchanged), the launch request's `scaleChoice` carried or refused by name, scalePick's precedence table (a window's choice > the app default (origin app) > an explicit Settings value > auto) with a no-app-default patched copy failing exactly its app rows, the client's PURE model (one key per app = the frame key; auto REMOVES; the launch field; the card menu; Make n× the default) with a stores-auto copy as the control, the words ("1.5× · App default", the chip a control only when the window can relaunch, zh + ja), the ROUTE refusing a bad value before a paired machine is asked (a check-less copy lets it through) and the hub handing it over INSIDE the op body, ONE user-state loader for both per-app maps — and (lane D verify) that loader over a fake socket: a reconnect re-reads, a save is an edit of the server's current map (a stale page never wipes another client's key), a refusal rolls back; three patched-copy controls. ~1 s, no browser
  { name: 'test-app-card', tier: 'fast', why: 'in-process · 20 ms (PURE: the install card\'s view, its words in en / zh / ja, the jargon census, the digest; the real For-you store on a tmp dir)' }, // design 009
  { name: 'test-apps-interface', tier: 'fast', why: 'in-process · 172 ms' }, // DESIGN 009 LANE 3 (apps-interface, 2026-10-03): the apps interface without jargon — the window bar's About line under ⋯ (backend + memory chips never shown, a mutant copy that shows the memory chip is caught), the scale chip only when chosen and in words, ONE counting starting line ("Starting… 8 s"), the launch dialog apps-first with the setup lines in a footer (a copy with the intro back on top is caught), two-line card names (the pre-lane nowrap rule is caught), localized catalog names, dead ends handed to an agent with the words carried, one name — Apps — incl. a top-level ⚙ row, no space between {machine} and a CJK neighbour in zh/ja (a planted one is caught), Layer 1's status line / base-change line / interrupted banner (PURE tables), THE WORD CENSUS (no deb/apt/AppImage/root/sha256/sudo in what the lane wrote, en/zh/ja, planted controls), and a real /bin/pwd spawn proving an app with no cwd starts in HOME
  { name: 'test-apps-engine', tier: 'fast', why: 'in-process · 1.1 s (an express router on 127.0.0.1:0, the real For-you store on a scratch dir, the apps stub, the CLI spawned as node)' }, // APPS — THE HUB'S ORCHESTRATION (docs/design-app-persistence.zh.md §3.1, Layer 0): src/server/apps-engine.js + src/routes/apps.js + src/server/apps-wiring.js over scripts/fixtures/apps-stub.cjs (real captured apt plans, no apt) — normRequest's closed kinds (an agent proposes apt / remove / a source; a .deb, Refresh, replay are the user's), a PROPOSAL planned first + ONE For-you item (origin apps, action app-install, words as structure) and nothing run, Install (the digest shown) → recorded → the item resolved by apps → the proposer told on its NEXT turn through the stash (`wait` reads each move and takes the stashed copy back), Not now = the item dismissed, plan_changed keeps it open, a refused plan never filed, THE ROUTE CENSUS (every user route refuses vsst_ / jbt_ 403; the agent face needs a session token; another conversation's proposal 403), the NDJSON install, the boot replay's rungs + ONE notice + restoring… rows, the stub seam honoured only by a throwaway server, i18n of every sentence this lane added
  { name: 'test-app-system', tier: 'fast', why: 'in-process · 70 ms (+ sh -n and refused runs of the app-system root scripts as this user — never root, never the helper)' }, // THE APP SYSTEM (docs/design-app-persistence.zh.md §3.2, Layer 1): PURE src/app-system.js tables, the helper's security rules as a census + patched-copy controls, the machine half over a stub runner
  { name: 'test-app-manifest', tier: 'fast', why: 'in-process · 70 ms (+ sh -n and refused runs of the root script as this user, never root)' }, // APPS THAT SURVIVE A REBUILT MACHINE (docs/design-app-persistence.zh.md §3.1, Layer 0): PURE src/app-manifest.js over REAL apt / dpkg / .desktop output (scripts/fixtures/apt, captured on this box + a throwaway Debian 12 container by scripts/capture-app-fixtures.sh) — the index schema, parseSim / parseUris / parsePlan with every named refusal (needs_snap, conflict, removes, not_found, bad_name, no_apt, disk with its numbers, shared, no_sudo), parseDesktopFile (field codes, Terminal, NoDisplay, quoting) through validateAppRow, the dpkg set byte-identical to the root script's `q` + the base sha, the repo's stanza / file names, cacheVerdict, replayRungs, driftVerdict, the ONE root script (dash + sh parse, argv positions, every argument refused before root as this user), parseRunLog over a real install + an offline replay; nine patched-copy controls
  { name: 'test-office-open', tier: 'fast', why: 'in-process · 141 ms (verify-r6 I1 §13: the install runs the plan shown or nothing, the real access layer over a stub device + control (i1))' }, // OPEN WITH LIBREOFFICE (docs/design-desktop-apps §7.9, the owner's ruling 2026-09-27 ②): the PURE open-with verdict over every office extension and every refusal code in its judging order (relative-path · not-office-file · machine-mismatch · host-unreachable · not-office-app · host_needs_daemon · app-absent + the install remedy), the argv shape (the module switch, --nologo, the session's OWN -env:UserInstallation, THE PATH LAST as one item — a display string never reaches it), the catalog rows valid under the model's validator, officeRowFor over the facts matrix, the closed install set + packageInstallPlan (xpra's plan byte-identical), the launch request's `file`, the explorer/door/editor/keeper/route wiring pins, a patched-copy CONTROL per rule
  { name: 'test-usage-eta', tier: 'fast', why: 'PURE · 23 ms' }, // the compact per-donut reset countdown (src/lib/usage-eta.js): the band table at every boundary with an INJECTED clock, the B-8b12 refusal of an empty window, and the PURE census
  { name: 'test-browser-pin', tier: 'fast', why: 'in-process · 2.3 s' }, // AGENT BROWSER P1 first half (design-agent-browser-v2 §3.3–§3.5, §5.1, §8 steps 1–2): the PURE registry/lease/verdict decisions and the five-rung pin ladder with its two-site vocabulary (SPAWN_ORIGINS + the client mirror), then the REAL keeper over a FAKE `agent-browser` on PATH (a daemon that is a real `sleep`): attach/detach leases, one browser per profile, the ceiling naming its holders, boot reconciliation dropping an orphaned lease BEFORE anything is kept alive, adoption across a keeper "death" by pid+starttime (a recycled/unproven pid is never signalled), the runaway stop + park, the migration's legacy record, the routes on an in-process express app and the shipped CLI (`use --print` never prints a CDP url; `close --all` refused on a shared profile). ~5 s, no ports claimed by name, no real browser, scratch dirs only
  { name: 'test-browser-handles', tier: 'fast', why: 'in-process · 1.8 s' }, // AGENT BROWSER P1 second half (design-agent-browser-v2 §3.7 + §3.8 layer ①, §3.2.5 adopt): the ATTACHMENT SET + HANDLES — the PURE aliases/child handles/path-vs-handle/set view/fingerprint/`resolveHandle` outcomes (profile_required listing every handle with the default marked, the sub-agent clause an ASIDE, not_attached, ambiguous, profile_path_refused with the `new --adopt` remedy) + the one-time `profile_changed` bookkeeping + the audit line (verb only, never a fill's content), then the REAL keeper over a fake `agent-browser` (aliases, resolveFor = blindness check THEN handle, children minted/resolved/reaped by prefix, the audit file, adoptScratch moving a scratch dir under ~/.agent-browser/), then the routes + the shipped CLI + a REAL browser-env: two attachments ⇒ a bare `--` command refused, `--profile`/VIBESPACE_BROWSER run under that profile's daemon, a USER pin re-points the per-session config WITHOUT a restart (the direct `agent-browser` command resolves to the DEFAULT's dir and to no other) and the CLI's next command is refused ONCE with was → now, the agent's own pin never is. ~5 s, port 0, scratch dirs only
  { name: 'test-browser-rejudge', tier: 'fast', why: 'in-process · 2.1 s' }, // LANE BROWSER-UNSTABLE-REJUDGE (the owner's instance, 2026-10-06: oomd killed the GNOME session, both profiles parked `failing` through daemons frozen on the dead compositor, 15 h until a human Stop): the re-judge table, the fresh-daemon rung, status words for a parked profile, the notice filed once — the real keeper over the fake agent-browser + 3 patched-copy controls
  { name: 'test-browser-recipes', tier: 'fast', why: 'in-process · 0.5 s' }, // LANE BROWSER-RECIPES (2026-10-02, userR's pod: an agent told only what it lacked launched chromium by hand and died without a DISPLAY): the manual's §0 first (four recipes, the exact user sentence), the NAIVE-READER leg (first 60 lines: `new "` before every page verb), PURE src/browser-recipes.js (the no-display table + words), the status census + the first verb's refusal over the REAL CLI against a stub server (a fake browser CLI that must never run), the tools intro under 9 600 B with the clause once + the display fact, wiring pins; CONTROLS (scratch copies): a manual without §0, a CLI without the pointer
  { name: 'test-browser-display', tier: 'fast', why: 'in-process · 1.7 s' }, // LANE HEADLESS-FALLBACK (2026-09-28 — the dev box at the GDM login screen: every agent browser launch failed "Failed to connect to Wayland display" because ~/.agent-browser/config.json asks headed + --ozone-platform=wayland): HEADED IS A PREFERENCE, THE DISPLAY IS A FACT — the PURE rule src/browser-display.js (the display verdict over env × sockets incl. stale / abstract / TCP, the launch plan wanted × display in both args shapes, applyPlan, the fact + recovered, the words; two patched-copy controls), the SHARED probe over REAL unix sockets (a killed server's socket file is not a display), and the REAL keeper + routes + shipped vibespace-browser over a fake 0.38.1 that fails a headed Wayland-pinned launch with the measured words and restarts a daemon whose later call differs in view: rung N / rung D / a named profile / a paired machine's browser-serve start launch headless with the pin dropped, the user file byte-identical, the fact on the record / digest / panel row / Settings route, the agent told once, every later call on the same planned file (no restart), the display back ⇒ headed again + said; the ADDENDUM's hidden-window rung (an Xvfb on the launch PATH + a stale DISPLAY + XDG_SESSION_TYPE=wayland ⇒ headed, x11 pinned, the display cleared, UA Chrome/154 through the keeper; browser.noDisplayMode = headless ⇒ headless) + two PURE controls; CONTROLS: the pre-fix launch (launch_failed reproduced) and /resolve naming the base file (the agent's verb restarts it into the failure)
  { name: 'test-browser-verbs', tier: 'fast', why: 'in-process · 8.9 s' }, // BROWSER TAKEOVER C2 (design-browser-takeover §3 T1 / §4 T2 / §10): the PURE router src/browser-verbs.js (12 OURS words; the collision set COMPUTED from the checked-in --help census == {profiles}; page / refused-by-name with a remedy; identity/launch flags; --enable/--init-script beside open; batch judged per line; the same rules after `--`; resolveRealBinary skips the shim dirs and the shim by content) + the SHIM data/bin/agent-browser (exit 2, one line naming the vibespace-browser command; a forwarding copy is caught) + the CLI over a fake server (`click` ≡ `-- click`, local refusals with ZERO server calls, `use --print` not_offered, `new-child` prints only VIBESPACE_BROWSER, binary_absent behind a shim); r1: every flag-ordered `get … cdp-url` spelling, and the ENV TWINS of refused flags never reaching a fake real binary on any /resolve kind (a pre-fix patched copy is the control); r2: only the NOUN decides (`get attr @e cdp-url` passes, a boolean flag's `true`/`false` skipped so `get --json true cdp-url` is refused), the --help GLOBAL-option census over VALUE_FLAGS, the SOCKET ROOT legs (the answer's socketDir/runtimeDir win over a decoy SOCKET_DIR/XDG, rung H keeps only `<base>/vs-ab-<uid>`), patched r1 copies as controls. ~3 s, port 0, scratch dirs only r3: VALUE_FLAGS/BOOL_FLAGS EQUAL the measured global-flag fixture (scripts/browser-flag-census.mjs; `--idle-timeout` was the gap), the `get` noun allow-list, every-reading judgement of an unknown flag, the config rule (sanctionedConfig: a project file only narrows, no raw-debugging switch) + the answer's `config` set last + the CLI's composed file, rung H's lstat; patched r2 copies as controls. r4: a navigation to the web only (every spelling of file:/chrome:/about:version/… refused, web controls), `state load` of a crafted file, the stdin batch in the binary's JSON form (the fake reads ONLY JSON), the ACCOUNT's passwd home (a --require preload injects it; a disagreeing $HOME refused, once with the real entry), the older-server config, the version gate, the census CLI; patched r3 copies as controls.
  { name: 'test-cdp-census', tier: 'fast', why: 'in-process · 80 ms' }, // THE CDP CENSUS vs THE VENDOR'S OWN LISTS (lane-cdp-154, 2026-09-28 — Chrome 154 reached the box and the only census gate was heavy): every censused Chrome (src/cdp-census.js CENSUS_CHROMES = 153.0.8010.47 + 154.0.8037.57) has its names-only fixture and no fixture is an orphan; on EACH the table names exactly that Chrome's methods (compare(fixture, {chrome}): 0 unclassified / stale / misdated); the rows' chrome / until marks ARE the consecutive fixtures' diff (scripts/cdp-protocol-fetch.mjs diffListings: +4 −7); the four 154 rows' classes + words through the real judge (Browser.addMockCamera / setGlobalPrivacyControl method_refused on every lease, Ads.getAdScripts / Browser.getGlobalPrivacyControl read), the seven removed Shared Storage rows still judged (version-independent judge); a method no row names refused BY NAME while the user drives on an older / newer Chrome alike, the words naming every censused Chrome; the fixture shape (names only) and the diff's `unrecorded` honesty; CONTROLS via mutant-copy: a new row removed (154 uncovered + the camera call forwarded on a free lease), an until mark dropped (stale), a surviving row mis-marked (misdated), a chrome mark dropped (stale on 153).
  { name: 'test-takeover-keyboard', tier: 'heavy', why: 'slow — 28.6 s measured at lane dialog-keys (10.2 s at the .197 integration): 69 DOM-mini scenarios × 34 patched-copy controls (verify r1), each ≈ 0.75 s of real timers' }, // lane takeover-keyboard (userW inc-mum339id-1zsb: the chat beside the live view, Take over, presses on the composer — the typing went to the PAGE): the REAL keyboard-yield.js + keyboard-owner.js + PURE browser-takeover.js under a DOM-mini with the browser's event order (capture → target → bubble; pointerdown → mousedown → default focus → blur/focusout → focus/focusin; a cancelled pointerdown keeps its focus away) and the view's three document capture listeners as browser-live-window.js wires them — 13 scenarios: userW's press yields (the takeover continues, the line says so), a SCRIPT's focus reclaimed (lane J r2's password guard), the picture / the bar take the keys back, xterm's screen → its helper textarea, a synthetic / elsewhere / stale press, a touch tap held 400 ms, two views (per claim), a handback while yielded, the words following the user; four patched-copy controls each failing exactly its scenarios; wiring pins (registrations, acts, the composer's line, zh/ja words)
  { name: 'test-browser-takeover', tier: 'fast', why: 'in-process · 4.9 s (verify-r6 B1 confirm-actions: structured fields, first write wins, answerGate + shown digest, keyed slots; B2 handback wake count echoed — controls C1–C4)' }, // AGENT BROWSER P3 (design-agent-browser-v2 §4.3/§4.3.1): the PURE takeover/handback/idle/announce verdicts + the CDP-shaped input records, the REAL keeper's input side over the fake agent-browser (browser_paused on resolve, idle lapse on the keeper's own tick with an injected clock, detach, the confirmation registry answered through the CLI's own confirm/deny), the announcer's three moments against a fake ladder (one billed site under 'browser-handback', a refusal stashed + noticed), the REAL bridge over a fake upstream (mode records, holder-only forwarding, held, viewer-left), the routes in-process and the shipped CLI's refusal; lane J: the picture-vs-page table (4 shapes × 2 windows × 2 zooms ≤ 1 px, the pre-fix formula as control), the bridge's viewport record (first frame / picture / tab / takeover, replay, the private cdp_url pair, a failed read said once), the CDP reader over a fake endpoint, the trace's frame size + wiring pin. ~6s, no real chromium
  { name: 'test-browser-providers', tier: 'fast', why: 'in-process · 2.1 s' }, // AGENT BROWSER P4 first half (design-agent-browser-v2 §7.1–§7.3, §7.2.1, §3.6 row 3): the PURE provider rows with their capability cells and the exact typed refusal each control produces (provider_unavailable naming the §7.2.1 refusal, provider_needs_local_key on host != null, provider_local_only, provider_lacks_capability per cell), the local-oracles discipline over the egress proof record (a `blocks` claim's cell IS false; a measured record without its four runs FAILS), the cdp env pair + url re-pointing, the cloakserve plan's typed refusals + docker argv, the egress allowlist verdict table; the SHARED browser-serve runner over the fake agent-browser; a REAL agentd daemon answering `browser-serve` with its capability asserted and an old daemon never asked; the ORCH access layer forwarding a paired machine's CDP port over a fake tcpForward (bytes round-trip), the keeper's remote chromium / remote cdp / local cdp records (never pid-signalled, stop closes the forward), the routes (providers, create with host/cdpPort, refusals by name) and the allowlisting egress proxy over real loopback sockets. ~8s, port 0, scratch dirs, no real browser, no vendor call
  { name: 'test-browser-backend', tier: 'fast', why: 'in-process · 2.5 s' }, // AGENT BROWSER P4 second half (design-agent-browser-v2 §7.4 / §7.5 / §7.6, D17 / D32–D34, round 8): the PURE switch model in src/browser-switch.js — the version ladder over a matrix (target ≥ / < / unrecorded, registry-vs-`Last Version` disagreement ⇒ the HIGHER), the carried seed, the fingerprint sentence, SEATS AS THREE STATES (known-fresh / known-stale / unknown; an unknown total never satisfies the ceiling — controls that treat it as 0 and as ∞ are red; a stale verdict degrades past SEAT_TIER_STALE_MS), the ceiling wording forked on key source (the user's own names holders; the cluster default lists no profile and offers the one click out), the launch-failure classifier's SHAPE (backend_seat_taken), the site hint carrying WHO claimed it with `tier` legal only while `backend === null`, `blocked` a CLAIM the server never manufactures, the gate's ORDER (keyScope refused before any key is resolved) — then the REAL keeper over a fake `agent-browser` playing cloak: the gate's three named refusals (backend_unavailable / backend_no_key + action / backend_seat_taken) and a real in-place switch (stop → same dir + carried seed → one tab re-opened per lease at its lastUrl → re-pinned → targetId rewritten → the lease OBJECT never destroyed; attach/resolve answer browser_restarting mid-way), a proposal when another session holds a lease, the routes + the shipped CLI's `backend`/`blocked`. ③b (the rebuilt switch dialog): ROW_STATES / rowState's order / switchChoices / backendFact / installFacts, the view's live + states, the digest's backends, the START-FAILURE ROLLBACK on launch_failed and on a stale-view backend_no_key (restored / from / to through fail()), the blocked route's `next`. ~4 s, port 0, scratch dirs only, no real browser, no vendor call
  { name: 'test-browser-env', tier: 'fast', why: 'in-process · 0.3 s' }, // lane browser-propose step 1 (userW's fleet pod 2026-09-30: a fresh Google sign-in refused — the agent's browser announced itself as automated): THE AUTOMATION FLAG BY DEFAULT — PURE automationFlagVerdict / withAutomationFlag over every args shape (the user's own AutomationControlled value wins, a --disable-blink-features switch of theirs is never overridden, off adds nothing), generatedConfigParts composes it BEFORE the keeper mark (the mark rides last, its rule unchanged); the REAL browser-env (rung D's spawn config: default on, `browser.automationFlag: false` off, theirs kept + said once, the child config inherits) and the REAL keeper over a fake agent-browser (a named chromium launch stamped + flagged, a CloakBrowser launch untouched, a record launched before the change keeps its file); two patched-copy controls. The measurement (navigator.webdriver true → false, headed AND headless, agent-browser 0.38.1) is scripts/measure-automation-flag.mjs. Scratch dirs only, no real browser
  { name: 'test-remote-profile-start', tier: 'fast', why: 'in-process · 1.5 s' }, // LANE REMOTE-PROFILE-START (design 014 lane 3b, part 1): a paired machine's profile — the owner starts it from cold (the restart route), browses it himself over the hub forward, deletes it WITH its folder there (the machine's `remove` op, capability browser-remove), and a machine with no browser to run is said by name with the one command for ITS platform; fake win32 / darwin / linux daemons over the real op table, client gate, keeper and routes; a patched-copy control per fix
  { name: 'test-browser-new-profile', tier: 'fast', why: 'in-process · 0.6 s' }, // LANE BROWSER-ADMIN chunk 1 (the owner: "不能手动创建profile"): THE New profile… dialog's PURE model (every provider a row — never hidden — in its state for the chosen machine; CloakBrowser not installed offers Install…; a machine a provider cannot run on greyed WITH its reason; the ONE body; refusals by code in en/zh/ja), the REAL keeper ("Who can use it" judged before the mint, born with its list, ONE write), the REAL routes over in-process express (a picked live session resolved by THE one resolver; the adopt route takes the dialog's fields), wiring pins (panel New profile…, the picker's adopt rows), three patched-copy controls
  { name: 'test-browser-builds', tier: 'fast', why: 'in-process · 5.0 s (lane fast-budget: was 13 s — the fake daemon\'s pid was this suite\'s own, so `stop` sat out its 8 s grace)' }, // LANE BROWSER-ADMIN 2a (the owner: "不能pin指定版本"): WHICH CHROME BUILD a profile runs — PURE src/browser-builds.js (the machine's listing of ~/.agent-browser/browsers/chrome-<v>/chrome, the choice shapes, THE verdict's order: well-formed · the user's · chromium · listed · runnable · the version ladder), the REAL keeper over the shared fake binary (the executable on EVERY launching call of the session, the default on none, a vanished build refused BY NAME with ONE For-you item, Change build… restarting a running browser and TELLING every conversation on it first, an older major refused), the browser-serve `builds` op + the start's view file a paired machine keeps, the client capability gate (`browser-builds`: zero requests to an older agent), the client words in en/zh/ja, wiring pins, three patched-copy controls; scratch HOME, port 0, no real binary
  { name: 'test-browser-build-download', tier: 'fast', why: 'in-process · 5.3 s' }, // LANE CHROME-BUILDS-DOWNLOAD (design 004, B-80c1): "Download another build…" — the REAL keeper on a scratch HOME against a loopback fake Chrome for Testing (the `chromeBuildsResolve` seam; the egress verdict on the name): the lists, the whole path, integrity, the zip's shape before `unzip -q` (a spy unzip), the egress, the ONE slot, a restart mid-download, removal; three patched-copy controls
  { name: 'test-browser-switch', tier: 'fast', why: 'in-process · 0.1 s' }, // lane browser-propose (the rest of the PURE switch model is test-browser-backend's): step 3's PROPOSAL — proposalInstall, THE PLAN TABLE (remote / install-unavailable / other-machine / already-cloak / the in-place switch the ladder admits, its one confirmation / a NEWER directory ⇒ a new profile / not-switchable / ephemeral), the frozen record and its digest (moving with every frozen field, never with the live state), claimVerdict (the same card / an untold rejection / open again), EVERY transition (agent_forbidden, proposal_changed, approve again after a failure, told once), allowlistWith (only the host), the For-you item's words = the card's line for line; step 2's SIGN-IN REFUSAL HINT — SIGNIN_REFUSAL_ROWS (dated, sourced, Google's /signin/rejected + deniedsigninrejected + the refusal title in en/zh/ja; Microsoft's failed sign-in deliberately absent), signinRefusalOf / navHint over the navigate result's final url + title (exact host, look-alikes refused, bounded at 4 KiB), the 403/429 rung unchanged, the shipped CLI's navFacts (text + --json forms, measured on 0.38.1) and the audit route's wiring; a patched-copy control (any host)
  { name: 'test-browser-propose', tier: 'fast', why: 'in-process · 1.4 s' }, // lane browser-propose step 3 (the owner 2026-09-30: the agent PROPOSES the switch, the user approves with one click; D31 stands): the REAL keeper over a fake agent-browser, the REAL routes on port 0, the REAL proposal runner with a FAKE install runner, the REAL handback tell over a fake ladder, a REAL For-you store + a REAL normalizer per conversation, the shipped CLI — ONE card + ONE item per claim (a second claim = the same card), the owner-only doors (an agent bearer 403, a wrong digest 409, no /api/agent twin), Approve = exactly the frozen fields (the install with its progress on the card, ONLY the host added, a new CloakBrowser profile pinned + attached + the page reopened, or the in-place switch; the agent told with noWake — stashed or steered, never a wake), a newer directory never downgraded, Reject told once at the next navigation, a failed install + Approve again, nothing to offer on another machine, a rebuild placing the card by id; the CLI's proposal line, the sign-in hint end to end, the rejection note once; six patched-copy controls. Scratch dirs only, no real browser
  { name: 'test-browser-site-reset', tier: 'heavy', why: 'slow — 12.5 s measured at verify r4 (8.5 s at r1 under the fast law; r2–r4 added ~50 rows: the shipped CLI spawned ~70 times, the measured loop replayed ×8 / ×32, a 300 ms quiet rule, the stop retries): the REAL keeper over a fake agent-browser + a fake CDP endpoint, the real routes / watch / proposal runner / shipped CLI — moved out of the fast tier by THE TIER RULE (≥ 10 s); a pre-push pin of this lane\'s PURE parts would need a split suite' }, // LANE SITE-RESET (2026-09-30, userW's pod: a stale login looped a bank's sign-in page, every verb timed out): the REAL keeper over a fake agent-browser whose browsers are a fake CDP endpoint (tabs, a cookie jar, storage calls shaped as measured), the REAL dialog watch, routes, proposal runner (+ this lane's site-reset kind) and clearer, the shipped CLI — ① the MEASURED loop replayed ⇒ the verb in flight answered BY THE EVENT, the live view's banner keyed + patched in place; ② a page-waiting verb answers the loop without spawning the browser CLI, `stop` / a bare `tab close` / `screenshot` go DIRECT, [no_picture] by name; ③ `site-reset` in the own browser clears exactly the cookies that reach the host + its origins' storage on a page's session; ④ on a shared profile ONE proposal, owner-only doors, Approve runs exactly the frozen pair (the browser started first), the agent told free; ⑤ Reject told once, proposal_stale; ⑥ SIX patched-copy controls
  { name: 'test-browser-trace', tier: 'fast', why: 'in-process · 190 ms' }, // THE PAGE-SIZE FOLD (lane trace-fits, 2026-10-01 — the owner: every resize / move of the live view was counted as an action, the Actions list was all `view fit` rows): the PURE coalesce verdict (a fit within 10 s of the previous fit of the same browser + scope REPLACES it, another action between ⇒ a new run, another browser ⇒ never) + the merge (first at / id / before frame, last geometry / after frame, n, lastAt), the PURE fold every list draws (consecutive fits = ONE dim row; expand = the toggle) and the counts that exclude fits (traceSummary / scopeDigest / pairSessions), THE FLOOD through the REAL recorder over a fake bridge (157 agent actions + 37 fits in 10 storms ⇒ 10 fit rows, every superseded after frame unlinked at once, the append-only index folded at reload), the size plan dropping page-size frames FIRST + usage / housekeeping reporting fit bytes beside, four patched-copy controls (one per rule), the wiring pins (the three surfaces, the route\'s summary, the F4 bridge debounce pinned, zh / ja, the toggle\'s label). Scratch dirs only, no browser
  { name: 'test-browser-sessions', tier: 'fast', why: 'in-process · 208 ms' }, // BROWSER SESSIONS + THEIR REPLAY + RETENTION BY SIZE (2026-09-27, the owner: "在聊天界面和浏览器查看界面两个地方都能看到 session 的开始和结束，以及每个浏览器 session 的回放" / "按照容量，每个浏览器 profile 最多保留 1GB 记录"): the PURE session arithmetic (pairing, open, a restart end, an action before any start is its own session, the chat cards of ONE conversation with stable ids, the tie in one millisecond), the PURE size plan (the oldest closed sessions' frames first, an open one last and partly, lists never, a two-year-old record under the limit untouched, the 1 GiB default + the 64 MB floor) with two patched-copy controls (a plan that also sweeps by AGE, a recorder whose sweep DROPS the lists) and the no-age-rule census; the REAL recorder over a fake bridge + stub keeper (the markers on the lease seam, idle never an end, the tags, a restart re-opens or ends `restart` at the last action, trace off, the sweep over real files); the normalizers placing the cards BY TIME and the live gate (one card when a rebuild and the live feed both carry it); GET /api/browser/sessions in-process; the replay model; the owner's words in zh + ja. Port 0, scratch dirs only, no browser
  { name: 'test-browser-housekeeping', tier: 'fast', why: 'in-process · 4.8 s' }, // AGENT BROWSER P5 (design-agent-browser-v2 §4.5 / §6.4 / §7.1 / §8 step 3, D7 / D8 / D35): the PURE trace model (the action table — an observation is never traced; a fill's value / a type's text never stored, only their length; the position kinds; the after-frame pick matrix; the retention PLAN naming every removal's rule; the recording gate by name; the sweep SCOPE = exactly the provider rows with ownsDir true, the cloud:* / local-window / cdp / remote records refused `not_ours` as the negative control; the housekeeping verdict that never answers "delete" and names the in-flight grace with its age; forget refused while leased or running; the orphan candidates + path verdict), the REAL recorder over a fake bridge + a stub keeper (before-frame off the ring, after-frame by settle / latest / same, the box probe through the runtime, 0600 files + index, the fill value absent from every byte on disk, tap-end finalizing, the lease seam arming/disarming, the setting gate, the sweep by age and by size, forget = rename beside + ledger BEFORE the record goes, orphans listed / adopted / forgotten, the ONE permanent deletion refusing anything not `.forgotten-`, recording start/stop through the lease's own session + the floor refusal), the routes in-process (session-id OR browser-key match, the frame served nosniff, PATCH's editable fields, host refused by name), and the REAL keeper's seam over the fake agent-browser (attach → attach + browser-ready, updateProfile → profile-updated, detach → detach, the digest hook merged into list()). ~6 s, port 0, scratch dirs only, no real browser, no vendor call
  { name: 'test-live-input', tier: 'fast', why: 'in-process · 9.7 s (six bridge worlds at once)' }, // builder r2: + the chip words as a zh / ja reader sees them, A1 a failed set's late mirror never the agent's, A2 a shared browser's held size re-fits at the handback, B no resize under a held button + the takeover fits at once — each with its patched copy. LANE LIVE-INPUT (the owner 2026-09-27: a paste from outside never reached the agent's page, the Chinese IME never typed, "按另一个窗口的大小" unreadable, a second record start 106 ms after the first, "already holds" per command + the page's query string in the journal): the CHUNKER (≤ 3 UTF-16 units a `char` — MEASURED: Chrome refuses 4+ — the measured control-character rules, a seeded 3 000-text walk over a model of Chromium 151's `char` table, the pre-fix one-record text and a no-tab-rule chunker as patched-copy controls), the viewer verdicts (input_text holder-only, a key text past the cap refused `text_too_long`), THE MAC CHORD TABLE (⌘A/C/X/Z/⇧Z → Ctrl, ⌘ → Control, ⌘←/→ Home/End, ⌥←/→ Ctrl+←/→, ⌥ characters; identity for a non-Mac viewer / a Mac browser; the pre-fix identity as control), the copy chords, urlForLog, THE FIT CHIP (a claim rules the page, the driver still wins, place tags → where + smaller/larger, the words in plain en with a jargon census and every literal in zh + ja; a no-claim copy as control), the RECORDING CHIP words, THE REAL BRIDGE over a fake stream server answering like Chromium 151 (a paste in order between two keys, one receipt; CJK + emoji + line breaks; a MEDIATED 1 920-character paste under INPUT_WINDOW credits; a refused chunk stops the act and says how much landed; the pre-fix record and a window-less bridge as controls; COPY OUT to the holder only AND only on the holder's own forwarded gesture — the verify's DOOR: a copy with no gesture dropped and counted, a chord's delivered once as `gesture: chord`, a press's as `click`, stale after COPY_GESTURE_MS, the door-less bridge as control — the watch following the tab and ending at the handback, the claim making the page follow that window with its place in the fit record), the copy watch over a fake CDP endpoint (the isolated world, the per-arm binding), ONE `record start` at a time (the pre-fix start as control), client + keeper wiring pins (incl. no `gestureAt` on a press)
  { name: 'test-browser-tabs', tier: 'fast', why: 'in-process · 5.2 s' }, // LANE BROWSER-RESUME chunk C (design-agent-browser-v2.zh.md §3.9, the owner's ruling 3 2026-09-30 "没有完善的关闭标签页能力"): ② the REAL keeper + route over a fake 0.38.1 that keeps ONE shared Chrome (every session lists every page, `tab close` closes any — measured): the agent's own tabs + a count, a `tab new` root, a foreign close/switch refused BEFORE any exec (the command log), resolveFor first (browser_paused), unreadable ⇒ closed, the user's ✕ / switch only while he drives (recorded, said at the handback), his own tab never his last, a control without the agent verdict; ③ the REAL bridge: tab-owners after a tabs record (+ replay), tab-act → a typed tab-ack, his switch moves the takeover anchor (control: an agent's switch still tab_switched); ① PURE src/browser-tabs.js — whose tab it is (roots, what a rooted tab opened, a session's active tab only when nobody roots it, the user first; a conversation's own browser = every page its), the agent's `tab` words + ref + view (never another holder's title or url) + verdict (own tabs only, unreadable ⇒ closed), the user's verdict over every cell (his tabs always never his last; the agent's only while he drives, never its last, never mediated; another conversation's never), the row model draws no control the verdict refuses, the handback sentence; 3 patched-copy controls; the zh + ja census of every PURE word
  { name: 'test-browser-resume-ui', tier: 'heavy', why: 'headless chrome + a worktree server + a fake claude + a fake agent-browser that keeps tabs over a fake stream server + the shipped vibespace-browser (~75 s; SKIPs without chrome / dtach)' }, // LANE BROWSER-RESUME chunk B (design §3.9, the owner's ruling 2 "给我一个 resume 按钮"): the agent opens three pages through the shipped CLI; the user's Stop ⇒ the live view keeps its last frame, says what is KEPT and turns Reconnect into RESUME in place (the play glyph + its word, whole); a REAL click reopens the three pages IN ORDER (the first into the launch tab) and switches back to the second BY ITS TARGET ID, never a tab close, the view reconnects by itself; after the Resume "Hand back and continue…" is offered — a REAL Take over, a REAL click: the note box takes the keys (none reached the page), Hand back ⇒ the takeover ends, ONE card in the chat, the stash holds "a browser handback", NO billed turn (no spend-ledger row, the journal never says announced), the agent's next command (the shipped CLI) prints [browser_resumed] naming the current tab, once; zh + ja: Resume and the hand-back button in the device's language, whole in a 360 px window (Resume never folds); the agent's own detach retires the record and a freshly loaded view still offers Resume off THE fact · CHUNK C (the owner's ruling 3) ⑥ THE TAB ROW (~75 s total): a chip per tab, "The agent’s", nothing drawn while the agent drives (the Take over toggle names what taking over adds); a REAL Take over draws switch + ✕; a REAL click switches the agent's tab by target id and his next click still reaches the page (the anchor moved with HIS switch); a REAL ✕ closes one under the agent's own session; a refused close is said; ✕ on the tab on show moves the agent to a neighbour FIRST; the last tab has no ✕; the handback carries his acts; "Close all…" asks by the browser's name (cancelled ⇒ nothing stopped); zh + ja: the row whole at 360 px, the tab on show never folded
  { name: 'test-browser-share-model', tier: 'heavy', why: 'slow — 48–49 s measured alone at the 2.369.200 integration, in-process (the row said 3.5 s; lane profile-lock-roll verify r2–r9 grew it — the lock / lineage / marker / rebind legs over the real keeper and their patched-copy controls): ≥ FAST_MAX_MS, so HEAVY by THE TIER RULE, moved whole' }, // "WHO CAN USE IT" IS A LIST (2026-09-27): whoMayUse over every stored shape, THE TABLE (36 named cells), the stamp + base, the write's verdicts, the agent's view, the client model's tables, the real keeper + routes (the narrowing / widening / unreadable / verb-time legs, the pick that adds, a fork's copy and a Task-Group default that add nothing, the resolver's refusals, a closed tab re-bound at re-admission), five patched-copy controls, the no-dated-pin census and the panel's <select> census with the 2.369.194 row as its control. OWNER RULING A (2026-09-26, "A吧" — two naive-user studies failed the same task): a NAMED browser profile is usable by ALL of the owner's conversations. PURE: a new record with no owner is "all", admission reads ONE field (`owner`, never the tab-isolation `sharing`), join-vs-launch (a live record joined, a launch in flight waited on), the one-driver verdict (11 rows) + browser_busy's words (it NAMES the other conversation — the ruling's exception to B-325a), the cap counted once per holding conversation, the `use` patch, the words census (no command line in not_owner / browser_busy / the pre-ruling holder's profile_locked / the pinned refusal). Then the REAL keeper + routes over a fake 0.38.1 (per-session daemons, a held profile lock): path A (`new work` in one chat, `use work` in another ⇒ joined, one launch), path B (a USER pin on a rung-D chat while another runs the profile ⇒ the same browser; CONTROL the pre-ruling route in a patched copy ⇒ the exit-21 SingletonLock), a pin that cannot open is LOUD (CONTROL a copy that falls back to a temporary browser), one driver at a time + the user's takeover from another chat's view (CONTROL a keeper copy without the check), the cap + machine ceiling (a join never trips it; a start at the same ceiling does), the row switch (a narrowing takes it from every other chat, the user's own pick adds it back), Rename, Delete… with two pins, the strip's who-drives, the pre-ruling chat's own browser holding the directory (named, never ended), the picker's labels; B-f7ab ③ THE LATE KEY (a keyless live session's first resolve mints through src/server/browser-key.js — bound to THAT conversation, a second call mints nothing, the conversation's old key comes back, held_elsewhere / fork_pending (both record shapes) / remote / conversation_unknown / the switches / session-gone refused by name; CONTROLS a copy that mints twice, a copy without the fork rule; wiring pins; ③f the start-time WITNESS restored (a default set later never reaches it, the spawn ↔ late parity table; CONTROLS the ladder read at the mint, the cap read live) and — since the .196 list integration — a restored witness widens nobody's "Who can use it" (CONTROL a restorePin that adds the conversation)). ~6 s, port 0, scratch dirs only, no real browser
  { name: 'test-browser-human', tier: 'heavy', why: 'slow — 12.6 s measured at the .197 integration (the row said 6.1 s — the coordinator\'s report: 11–13 s in the fast tier): the real keeper + routes + live-view bridge over a fake 0.38.1 (② 5.8 s, ②b 4.9 s)' }, // BROWSE YOURSELF (B-6ae8, the owner 2026-09-28): PURE src/browser-human.js (the verdict's order, the holder lifecycle, the attach verdict, the end choices, the address rule, the act aggregator — five patched-copy controls) + the REAL keeper: launch / join / rejoin / focus, NO pause of any conversation (the owner, 2), his own `--pin-tab` tab under `vs-hu-…`, the address row's verbs under HIS session only, Close = his tab (the browser stays, idles by the keeper's rule), Quit = today's Stop naming the conversations, the keep (12 h he launched / 10 min he joined), Delete… and a switch while he browses (a proposal), the ceiling, every refusal; the bridge's `?browse=` (fresh ⇒ take, a second window watches, claim = Continue here, no tab anchor on his relay, CONTROL the agent relay still refuses tab_switched); the recorder: his acts ONE entry each (holder user, «N chars» — a byte census finds no typed word), his session's markers make NO chat card (CONTROL a by-profile matcher), the opt-out switch; censuses: the HOLDER census over every `reg.leases` site, no agent route / CLI reaches `/browse` or a `hu-` key, the announcer ignores his events; the words in zh + ja.
  { name: 'test-browser-tier3', tier: 'fast', why: 'in-process · 359 ms' }, // AGENT BROWSER P10 (design-agent-browser-v2 §7.6 tier 3 / §7.1's local-window row / §4.9 columns 1-2 / §6.6, D27 (b) / D31): PURE src/window-desktop.js (the closed refusal set, the D27 (b) consent verdict, the desktop rows = the bus minus ours + this process every one marked, key / click --at refused BY NAME on the class, watch no_live_view, the §4.9 capture matrix per window, the MEASUREMENT RECORD under the local-oracles discipline with negative controls — a rung wired without its ok cell goes red — and hintAction that never answers auto), the registry (the tier DERIVED from the row, a profile record with no tier field, the local-window row wired behind provider_needs_consent, the exact refusal for cdp / allowed-domains / pin-tab / live-view / start / switch / sweep / remote with chromium as the control, a tier-3 PROFILE refused tier3_is_a_window_target, the site-hint rule's both-at-once control, the tier-3 blocked sentence that says "your act" and never "detected"), then the ENGINE over a fake keeper + a fake helper + the routes + the shipped CLI: the switch OFF lists nothing of the class and refuses attach 403 desktop_consent_off; ON lists the bus minus ours; one holder; snapshot / click @ref / type reach the helper with the desktop pid; key and click --at are refused BEFORE any helper call with xdotool "present"; the user's pause over the cookie route ⇒ window_paused; every audit line origin:desktop; the lease persists across a rebuild; the switch OFF drops it at the next verb (by:consent) and at boot. ~3 s, port 0, scratch dirs, no display, no browser
  { name: 'test-window-reach', tier: 'fast', why: 'in-process · 1.1 s' }, // DESKTOP LANE E (docs/design-desktop-apps-seamless §3.6, the owner's D1–D7): the PURE reach + share-mode model src/window-reach.js — the 30-cell principal × scope × caller table (hidden by default, sessions by conversation / webui key, Task Groups by membership NOW), one row per principal, own-row revoke, widen-only over 256 grant sequences, the opener's self-open row, the 72-cell D7 mode table (pixels refuses snapshot / click @ref / type @ref with the owner's sentence; auto probes then follows its resolution) with the measured resolutions (xterm no tree, Chrome's closed 4-frame tree, the calculator), the pixel plan / visibility / point mapping on the measured calculator + Chrome geometry, the request text, the picker, the launch memory, the session key = server.js sessionStatusKey; three patched-copy controls (group rows ignored, a kind-wide revoke, pixels letting the tree through). < 1 s, no process
  { name: 'test-window-binding-model', tier: 'fast', why: 'in-process · 6 s (⑦⑧ wait out the re-send and the drop timers once)' }, // AGENT BROWSER P7 (design-agent-browser-v2 §4.6 / §3.7, D19 / D24) the fast half: the PURE chain model in src/lib/chain-layout.js (a missing layout reads as tabs, the ratio clamps, `split` validated against `tabs` in ONE place with the pre-fix dangling-pair shape as the negative control, the multi-client sync key that changes when only the layout changes with the pre-fix `tabs.join(',')` key as its control, a ratio-only change applied in place, displayed panes wide vs NARROW, D19 (a)'s replaceable pane, the bind pair by side, the one grid-columns spelling), the ownership badge (two sessions in one task group distinguishable, a session in no group badged at all, every owner once with the viewer first), and the wiring pins (every chain mutation normalizes, layout.js keys by chainSyncKey with the pre-fix key gone, captureState persists layout + split, the divider's one kind of pixel, syncHiddenViews' narrow-split hider, the ≤768px stylesheet rule, §6b's four anti-ping-pong guards untouched; split UX chunk 1: dropSide gone, visualTabOrder / swappedPair / splitPartner, the drop-zone pins FLIPPED negative, _afterUserMerge once per user merge drop and never on restore / sync, the button / glyph / undo pins). ~0.2 s, no DOM
  { name: 'test-live-strip', tier: 'fast', why: 'in-process · 52 ms' }, // MULTIVIEW (docs/design-browser-multiview.zh.md §2 A1 + D4, lane P): the PURE strip arithmetic of the Agent browser window (src/lib/live-strip-layout.js) — lane browser-resume C: + THE TAB ROW's fold (tabRowFold: the strip's rule, another conversation's / nobody's tabs first, the tab on show never) — the FOLD at 1400 / 900 / 600 px (the tab you look at never folds, a browser running a command outlasts a quiet one, ties right to left, the design's six zh/en labels), the FIRST-SEEN order (a new browser at the tail, nothing shown moves), ≤16-char labels, the own/cap CHIP (red at the conversation's cap, the machine ceiling a separate flag) + its Stop list (never a driven or released browser; a shared profile says so), the PER-CONVERSATION cap verdict beside the MACHINE ceiling (which refuses first, the remedy naming the chip's own text, the other holders counted never named); two patched-copy controls (the shown tab may fold, left-to-right folding). ~0.2 s, no DOM
  { name: 'test-chain-layout', tier: 'fast', why: 'in-process · 140 ms' }, // SPLIT TABS v2 (docs/design-split-ux.zh.md §8, inc-muhfb5al-jzk6, 2026-09-25) the PURE model of src/lib/chain-layout.js: every tab of a split belongs to a SIDE (ordered `split.left` / `split.right`, union = tabs, each id once, pair[i] on side i, strip = left ++ right — held after each step of a seeded random walk of every verb), the creation rule, an emptied side ending the split, the old-record repair, moveTab / showTab / removeTab / swapSides, chainSyncKey carrying the order + the cut + the pair (never the ratio), and four patched-copy negative controls; v2 verify r1 ⑪: the HELD divider ratio (holdRatio / heldRatio / releaseRatio — a local drag a remote record could not know wins for ≤ 60 s, never in the key or a clone) + two more controls (no expiry, blind to a moved ratio). ~0.3 s, no DOM
  { name: 'test-browser-unresponsive', tier: 'heavy', why: 'slow — 15.2 s measured (8.1 s before lane mirror-green-220: its ⑥ drives a real daemon whose chrome closes through 18 relaunch ticks)' }, // lane browser-unresponsive: the hung-browser verdict + the keeper on its real tick over a never-answering port; mirror-green-220: a closed-again browser in its relaunch loop is never judged
  { name: 'test-browser-stuck', tier: 'heavy', why: 'slow — 40 s measured at lane site-reset verify r4 (18.8 s at the lane, 18.4 s at the .197 integration; site-reset verify r2\'s user-stamp legs sit 16 s on their own): the real routes + the shipped browser CLI over a fake 0.38.1, the dialog watch over a fake CDP page, legs that sit out the CLI\'s own waits' }, // LANE BROWSER-STUCK (2026-09-28, userW's "jarvis-work 卡死" + the owner's ruling "让agent知道这个对话框的存在和交互能力"): a page dialog is a FACT OF THE AGENT'S VERB. ① PURE src/browser-stuck.js (the per-kind auto-answer — alert only —, THE sentence verbatim, the notes, the idle notice, the browser CLI's own lines as measured on 0.38.1, the navigate / stuck verdicts, the UI words × en/zh/ja); ② the dialog watch (src/server/browser-dialogs.js) over a fake CDP browser (attach + Page.enable before any dialog, the event wakes the waiting verb, an alert accepted and told once, the answer stamped by who, a held tab ⇒ unresponsive, 3 timeouts ⇒ unresponsive, whose tab); ③ the REAL routes + the REAL CLI over a fake browser CLI: a verb in flight returns dialog_open within 1 s OF THE EVENT (via: event; the binary's 30 s wait cut), every later verb repeats it unspawned, snapshot / get url put it first, dialog status|dismiss through the watch, the alert note, the user's answer told once, browser_interrupted while the user drives, the unresponsive note; ④ the REAL bridge (the viewer's dialog record + late replay, dialog-answer = the user's, the trace taps); ⑤ the keeper (noAutoDialog in a lease file + a launch file only for a record launched with it, the stuck fact); ⑥ teaching (the manual section, the ONE intro line under 9 600 B); CONTROLS via mutant-copy: auto-answer-every-kind, a CLI without the long-poll (sits out the hang), without the repeat (spawned behind the dialog), a watch without the alert rule. Free ports, scratch dirs, zero vendor calls
  { name: 'test-browser-fact', tier: 'fast', why: 'in-process · 7.0 s' }, // LANE S2 (naive-user study 2, 2026-09-26, T4/T5/T7 — "which browser is this conversation using" had three answers): the PURE fact src/browser-fact.js — the table over every combination (pinned / running / neither / mismatch / stale / gone / cleared / several / remote / shared) ⇒ the ONE words, both names when they differ ("pinned work · running nothing — work could not start"), no raw id on the face, a digest that moves with every printed field and never a clock; liveFollowPlan (a view follows its session's browser; never one the user pointed elsewhere, drives, or a helper's); the delete's refuse-or-warn, the receipt book, the mediator's credit rules; the REAL keeper + the ONE unpin over the real router (leased first, then pinned, then unpin — the env re-pointed off the directory, the agent told, the boot heal of a dangling pin); THE MEDIATED TAKEOVER end to end (the real bridge → a fake 0.38.1 stream server dispatching one Input.* per record → the real mediator, paused → a fake Chrome): the user's input passes on the bridge's credit and is receipted by Chrome's own reply, an uncredited Input.* is still refused, CONTROLS the pre-S2 bridge (Chrome never sees the key, the bridge can only say "written") and a mediator copy without the credit rule (the receipt SAYS not delivered); the surface CENSUS (no surface reads browserProfileId / browserProfileActive / browserLive / browserPinOrigin; a chat-view copy that does is caught); B-f7ab ⑦ the KEYLESS fact ("no browser yet", the payload's keyless branch, the live view's no-key words). ~3 s, free ports, scratch dirs only
  { name: 'test-browser-orphans', tier: 'fast', why: 'in-process · 0.6 s' }, // LANE DAEMON-ORPHAN-END (2026-10-08): a browser daemon + its Xvfb with no browser, no lease and no conversation ended by identity after the grace (verdict table + mutants, the keeper over a fixture process table, the boot sweep once, the serve op + capability gate)
  { name: 'test-profile-blindness', tier: 'fast', why: 'in-process · 305 ms' }, // AGENT BROWSER P1 second half, the FAST half of §3.8 (layers ① + ②): the session-status notice slot is a QUEUE of typed {kind,…} notices (a status override and a browser-profile change BOTH pending survive each other, renderNotice dispatches on kind with the status-override sentence verbatim, unknown kind refused loudly, bounded, an older build's single `pendingNotice` lifted at load), the REAL /api/agent/prompt-context DRAINS (both reach ONE prompt, none the next, the webui:<id> record too), the session-start context lists the current attachment set, and END TO END a USER's mid-task pin through the UI route re-points the running session's config (no restart), queues the typed browser-pin notice into the real store, the next prompt carries it as one <system-reminder>, the keeper refuses the next command once — and the path names no spend reason. The heavy half (layer ③'s chip MUTATION leg) is not here. ~3 s, port 0, scratch dirs only // AGENT BROWSER P0 r5 (design-agent-browser-v2 §3.2.1 + D1): what survives a HEADLESS restart and a KILL, on a real worktree server — the too-old notice reaches the first client to connect after a boot that had none (round 4 latched before delivery; measured zero frames at Ready+6.3 s), and a Terminate → Resume of one conversation keeps ONE browser key through data/browser-env/bindings.json (round 4's rung read only the meta file the kill path unlinks); r6: a FORK of that conversation leaves the parent's binding untouched (the fork's process carries a different key, the choke-point rule held without the store's belt), and the parent's next resume lands on its own key with ONE namespace ever spawned for it (round 5 re-bound the parent to the fork within 800 ms). Fast tier: free port, scratch worktree + scratch HOME, a FAKE agent-browser (0.30.0, `--version` only) and a FAKE claude on CLAUDE_CMD — no real CLI, no browser, no vendor call, ~10 s.
  { name: 'test-spend-paths', tier: 'fast', why: 'LAW money · 2.6 s — the spend ceiling: the grep-derived census of every producer of a turn nobody typed + the four fail-closed sites' }, // THE SPEND CEILING (design-account-hardening §4.4c/P9 + D2/D3/D6/D8): the grep-derived census of every producer that can start a turn nobody typed, the persisted per-identity budget, overage, the EDF reserve floor and the four fail-closed sites. 0.6s, no ports, no fixed /tmp path
  { name: 'test-rate-limit-capture', tier: 'fast', why: 'in-process · 82 ms' },
  { name: 'test-quota-model', tier: 'fast', why: 'in-process · 376 ms' }, // the TYPED limit set (B-9213 three concurrent codex limits) + the ONE usage-cache write path + the empty-window rule (B-8b12) + the writer census and the reader census — the money store's shape gate

  { name: 'test-public-links', tier: 'fast', why: 'PURE · 24 ms' }, // every "link to something here" surface uses the instance's public address (not the browser origin)
  { name: 'test-remote-shell', tier: 'fast', why: 'LAW architecture · 57 ms — the shared remote-shell drift guard; its one `command -v agent-browser` runs a real sh under a scratch PATH holding only the shim and a fake, never the program', allow: ['binary'] },
  { name: 'test-mount-providers', tier: 'fast', why: 'in-process + 4 esbuild client bundles · 2.7 s' }, // lane dc-mount-providers: a storage provider = its row file + one index line (fake acme provider through the real manager; base-vs-tree differential; patched-copy controls)
  { name: 'test-mount-oauth-probe', tier: 'fast', why: 'in-process · 31 ms' }, // dead OAuth token behind a healthy-looking mount: probe eligibility + slow clock + phrasings + Re-authorize button; §4 D2 (integrations 4a): a Drive client switch lands WITH its token (applyDriveToken client), children bounce, Gmail through its PATCH
  { name: 'test-compaction-ux', tier: 'fast', why: 'PURE · 91 ms' }, // prompt_too_long → guidance card + /compact turn label + two-step Stop (normalizer behavioral + wiring pins)
  { name: 'test-job-model', tier: 'fast', why: 'PURE · 34 ms' },
  { name: 'test-jobs-triage', tier: 'fast', why: 'in-process · 366 ms (verify-r6 J1 §10: a job answer names its panel — the stale click refused across an answer, an expiry and a restart + control)' }, // Background Work TRIAGE (design §13): the real engine + real user routes over the neutral fixture — acknowledgement stamps, the archive sweep with an injected clock (who archives / who stays / unacked never), read-through, the cap, a restart, one broadcast per sweep, the CLI's list --archived against a fake API. ~2s, no fixed port/path
  { name: 'test-usage-estimator', tier: 'fast', why: 'in-process · 32 ms' }, // dead-reckoning core; was OUTSIDE the gate (silent-stale class) until the 2.368.13 delta-relative calib change touched it
  { name: 'test-remote-discovery-dirty', tier: 'fast', why: 'in-process · 35 ms' },
  { name: 'test-resume-all-desktops', tier: 'fast', why: 'PURE · 40 ms' }, // pure scan + the WIRING pin (the 2.331.0 dead-fix lesson)
  { name: 'test-ctx-sync', tier: 'fast', why: 'in-process · 37 ms' },
  { name: 'test-workflow-live-view', tier: 'fast', why: 'in-process · 72 ms' }, // 2.369.119 (owner "怎么这个内外实现还不一样"): ONE live view for the Workflow card and the View Workflow window — PURE mergeLiveWorkflow (tree over disk skeleton by agentId, journal retry verdicts win) + normalizer taskInfoById + every live branch of /api/workflow wrapped
  { name: 'test-workflow-disk', tier: 'fast', why: 'in-process · 1.6 s' }, // 2026-09-26 (owner: a workflow window read 运行中 + eleven "(agent)" rows for a run stalled two days): PURE src/workflow-disk.js parseRunDir — labels/phases from the journal's started lines + agent meta.json (CLI ≥ 2.1.267), the liveness verdict from the run's mtimes (no write for 10 min, no live tree, no snapshot ⇒ stalled, never running); the journal arithmetic moved verbatim (pre-move reference); the REAL route over a scratch HOME (stalled / running / live tree / snapshot untouched / resumed / pre-2.1.267) + the REAL remote probe script run by sh; zh/ja words; patched-copy controls (ignore metas, no liveness) go red; lane Q verify: treeAlive (a tree's proof of life has a clock — aliveAt) + liveNoteKind tables, the route under a REAL normalizer (wire order + level set) and a REAL rebuildHistory (2-day / 1-min replays), remote meta-only + no-clock legs, route / normalizer / probe copies as controls (the level set's two layers each proven alone); ~2 s
  { name: 'test-exit-call', tier: 'fast', why: 'in-process · 1 s' }, // lane exit-calls-in-history (the real CLI through bash against an in-process stub hub): a vibespace-exit Bash call read as its machine call (run ok / exit 3 / 124 / refused / 127 / cmd.exe EncodedCommand / push / pull / list / runs / use / url), never-guess shapes, the live pairing, a history rebuild = one machine run, live = one card, 6 patched-copy controls
  { name: 'test-machine-card-fold', tier: 'fast', why: 'in-process · 130 ms' }, // lane machine-card-fold: a PowerShell -EncodedCommand decoded for display (valid / -e / -enc / pwsh / invalid / odd / huge / hidden chars / not-decoded lines), the door + words, the Machines fold (kind, split by machine, failure surfaces, live head), 9 patched-copy controls
  { name: 'test-peer-card-fold', tier: 'fast', why: 'in-process · 64 ms' }, // lane peer-card-fold: a peer card folds to head + preview + Show — the PURE verdict table (zh/ja/en, H1 report, one-liner, empty, 50 KB, group, job), the preview rule, demoted headings, the setting, 3 mutant controls, wiring pins
  { name: 'test-chat-hygiene', tier: 'fast', why: 'in-process · 196 ms' }, // lane S3 (naive-user study 2): text addressed to the ASSISTANT is a note (the Stop nudge, codex's nudge turn, VibeSpace's own injection blocks — never a /goal check, a typed message, a peer or another plugin), the 'note' fold kind + chat.showAssistantNotes; the Stop wording (no restate, tools first, one short line, the byte budget); tool-result bookkeeping as sentences + the visible-line census; the ladder's ONE notice head (real conversation-deliver), isVibespaceNotice live and from a rebuild, the handback title round trip over every cause × target, the sender-name census; the For-you tray named where it is + the "your inbox" census; S3 verify F3 — the impersonation table (a peer is never a notice, whatever its name or first sentence; real ladder + claude / codex / ACP normalizers) and the census that every card / stash writer states its kind; eight patched-copy controls
  { name: 'test-browser-identity-census', tier: 'fast', why: 'in-process · 1.3 s' }, // THE IDENTITY CENSUS (identity verify round 3, 2026-09-28 — the CENSUS round, after round 1 fenced ONE door and round 2 found three more; round 1 stripped ONE agent route and round 2 found four more raw answers): ① the ADMISSION census — every lease / pin / owner-list write site in the keeper's text is inside a KNOWN function and the fence (isRemoteKey → decideAttach / mayAttach) precedes the write, a new site RED by name (controls: a raw `joinRaw` door, an `attach` without its remote fence, a `setPin` writing the owner beside addConversation); ② the CALLERS census — routes / ws-create / trace routes / stream bridge / bindings reach a lease or a list only through the keeper's fenced primitives, every caller known, the raw doors (`reshapeStore` migrations-only, `_reg` read by the recorder alone), the bindings writer's one caller + two refusals (control: an unknown `k.attach(` caller); ③ the AGENT-VIEW census — the SERVER BELT `router.use(AGENT_PREFIX, agentBelt)` precedes every /api/agent/browser/* registration, every route answers through res.json, names its PURE view where it answers a record, has a walk row, every CLI call names a walked route, BELT_EXCEPTIONS is exactly ['drivers'] (controls: a raw route before the belt, /profiles raw, a res.send route); ④ the RUNTIME JSON WALK over the real keeper + routes + mediator (A admitted with a helper, an ephemeral, a mediated grant, a drive claim, two takeovers; B not; R on another machine): every answer for B and R walked — no string equals A's key / webui id / conversation id / pids / bs-session ids / helper key except `$.drivers.<profile>.browserKey` (present, alone); the digest's `browsers` reduced to state facts, others' ephemeral records gone; the shipped CLI's stdout for B; R refused remote_session at use / pin / new / --adopt (controls: the routes WITHOUT the belt + a raw route ⇒ 49 hits RED; the REAL belt over the same raw route ⇒ masked GREEN; the belt keeps the asker's own key; a belt copy with a second exception RED; the belt fails CLOSED as belt_failed); ⑤ THE SWITCH (r3's finding: an agent the list kept out switched a profile's backend DIRECTLY — the rule read the retired `owner.kind === 'session'`): the PURE table (7 rows), the keeper over the wired-cloak world (B ⇒ proposal, R ⇒ proposal, B through its Task Group ⇒ the real switch), control: the pre-fix rule restored
  { name: 'test-browser-panel-model', tier: 'fast', why: 'in-process · 400 ms' }, // DESIGN 015 (lane browser-panel-tidy): the Agent browser panel's PURE row model (src/lib/browser-panel-model.js) — the line / fold / ⋯ menu tables over nine profile shapes, THE ACT CENSUS (every act of the 2.369.204 row once; a patched copy without Replay… goes red), the grid minimums = style.css's template, zh + ja words
  { name: 'test-browser-switcher-model', tier: 'fast', why: 'in-process · 220 ms' }, // THE REBUILT BROWSER-SWITCH DIALOG (2026-09-27, the owner's zh screenshot of the old one: "tier 1", "chromium 151", a disabled Install under a paragraph about egress, buttons stacked one glyph per line): the PURE model src/lib/browser-switcher-model.js over fixture views the REAL src/browser-switch.js builds (scripts/fixtures/browser-switcher-views.mjs) — every ROW_STATES entry has a fixture and its card is the spec's sentences + ONE control verbatim, the closed set equal on both sides, every switch / install / dismiss / view answer worded (the rollback facts before the code), never the server's sentence or a developer word, the hidden rows (cdp / local-window / cloud:*) never a card, the digest's choices / fact / chip words, the click's overlay, zh + ja for every literal (ja 「」, the retired keys gone, the label law), the wiring pins of the dialog + its three entry points + the keeper's rollback; five patched-copy controls 2026-09-28 (the naive-user round): nothing configured ⇒ ONE needs-key sentence (the real store's `no-preset`, `own-missing`), a key that exists and fails ⇒ the second line; the driven card's control IS the handback; both switch cards say who else a switch moves; controls (f) the pre-fix key filter, (g) the pre-fix driven card; the Manage agents row absent on a build without CloakBrowser.
  { name: 'test-unknown-records', tier: 'fast', why: 'in-process · 59 ms' }, // 2.369.119 (owner "未知的 event 不要直接过滤掉"): an unhandled top-level type / system subtype not on the DECLARED known-ignored lists becomes ONE dim card per name per session on the live path (claude + codex); handled/ignored/history never do; the consumer-type census
  { name: 'test-record-shape', tier: 'fast', why: 'LAW architecture · 2.1 s — the known-record schema oracle: reads the installed claude\'s bytes (asks it --version), never a turn' }, // design-unknown-records §3 (owner ruling (b), 2026-09-21): a KNOWN record carrying undeclared fields is a card + a breadcrumb — PURE src/record-shape.js census over the tracked fixtures, synthetic drift/merge/telemetry-once, enum drift with the handler still running, the BINARY ORACLE over the installed claude's zod union (every subtype/type on exactly one list, every declared shape's fields ⊆ known ∪ ignored; SKIP without a binary), the negative control (ignored emptied ⇒ §1 red)
  { name: 'test-task-lifecycle', tier: 'fast', why: 'in-process · 6.5 s' }, // background Agent/Workflow/Bash lifecycle from HISTORY (launch acks + persisted notifications) + inc-mudv05ja-n5rv: the live Workflow card patched in place, never swapped, while the run is live, in the CLI's real agent words (real normalizer → real ChatView/renderers/status bar over a parsing mini DOM, pre-fix negative control)
  { name: 'test-freeze-probe', tier: 'fast', why: 'PURE · 22 ms — the freeze probe\'s self-gap verdict (a hidden / returning tab is not a freeze)' },
  { name: 'test-codex-quota', tier: 'fast', why: 'PURE · 50 ms' }, // codex quota P0+P1: window-by-length normalization (0.149.x single-window), exhaustion markers kept, persistence, estimator inclusion
  { name: 'test-peer-delivery', tier: 'fast', why: 'in-process · 86 ms' }, // peerDelivery registry lane: codex rpc-queue rung (real deliver.create + sidecar) + wiring pins
  { name: 'test-cli-usage-parse', tier: 'fast', why: 'PURE · 54 ms' },
  { name: 'test-account-relogin', tier: 'fast', why: 'in-process · 54 ms' },
  { name: 'test-peer-command-card', tier: 'fast', why: 'in-process · 4.9 s' }, // inc-mu6bfv1t-4drq: a harness-delivered peer message renders at turn START (command_lifecycle uuid → the JSONL record, real consumer + real normalizer, msg_id dedup against the result rung)
  { name: 'test-peer-msg-card', tier: 'fast', why: 'PURE · 55 ms' }, // peer message visible on the LIVE stream (result.origin mining + 3-site dedup) + the codex twin (injectPeerCard, webui_peer marker live/rebuild, marker-blind twin dedup, feedPeerCard no longer false for codex)
  { name: 'test-account-pool', tier: 'fast', why: 'in-process · 55 ms' },
  { name: 'test-pool-link-notify', tier: 'fast', why: 'in-process · 120 ms' }, // A PER-SESSION POOL LINK THAT MOVES SAYS SO (lane badge-stale, 2026-09-30, the owner's title chip named the member the pool had moved the conversation OFF 30+ min earlier): the REAL AccountManager — ensureSessionPoolLink ⇒ onSessionLinks ONCE after the synchronous pass (the link already on the new member; N re-points in one pass ⇒ one; a throwing hook never fails the move), noteDeviceRepoint (per-session row ⇒ links hook, default row ⇒ onChange, a replay ⇒ nothing); CONTROL: the pre-fix accounts.js (scripts/mutant-copy.mjs, the notify removed) moves the link and says nothing; the writer census over the comment-stripped tree (every pool-link re-point in accounts.js notifies or its every caller does; no other src file re-points a pool link) + the server.js wiring pin (onSessionLinks → broadcastActiveSessions)
  { name: 'test-title-meta-guard', tier: 'fast', why: 'in-process · 90 ms' }, // A MERGE THAT CHANGES NOTHING RE-DRAWS NOTHING (lane badge-stale, 2026-09-30): the REAL WindowManager.setTitleMeta under a fake DOM — the identity sync writes every window's meta on every merge (5 s poll + every active-sessions frame), and unguarded it re-drew every tab strip (every tab's billing chip a new node each poll) and re-notified per window; a changed meta ⇒ one apply / strip / notify, the same meta ×10 ⇒ nothing; CONTROL: window.js without the guard (scripts/mutant-copy.mjs) re-draws 10 of 10; wiring: no caller forces a re-draw with an empty patch (desktop-app-window.js calls _renderTabBar), the sync asks the autosave only when its openSpec changed
  { name: 'test-mount-stranded', tier: 'fast', why: 'in-process · 54 ms' }, // stranded writes under a DISCONNECTED mount point: quarantine-never-delete on connect + shadowedBy predicate + TASK.md writer guard + wiring pins
  { name: 'test-mount-starting', tier: 'heavy', why: 'slow — 14.9 s in-process: fake rclone daemons on real timers (a cache scan that ends, the hung window, the not-empty retry) — over the fast tier\'s 10 s rule' }, // 2.369.213: a daemon still rebuilding its cache index is STARTING (blocked path, joined connects, hung = no CPU progress, not-empty → stranded + one retry)
  { name: 'test-pull-refresh', tier: 'fast', why: 'in-process · 1.8 s' }, // B-35e3 pull-mount freshness (2.369.202): the rclone argv of a pull mount and heldRefresher's rules over a fake /proc — idle costs nothing, a GET finds held files, a moved…
  { name: 'test-pool-signed-out', tier: 'fast', why: 'in-process · 59 ms' },
  { name: 'test-owner-batch-2369-32', tier: 'fast', why: 'in-process · 66 ms' }, // owner batch 2.369.32: codex resume model continuity (last turn_context) + wrapper model pin, sidebar primary-only default, codex ⟳ dispatch, auto-resume origin label, 'not started' reset display
  { name: 'test-reset-credit-verdict', tier: 'fast', why: 'in-process · 55 ms' }, // docs/design-reset-credits.zh.md §4/§6: the PURE reset-credit verdict — both vendors' tables (wall × remaining × time-left × credits × cooldown × use-by × replenishes × warm/cold × pool alternative × ladder position), CREDIT_FLOOR, the anthropic knee at exactly W/b, describeUse wording, patched-copy negative controls, and the WIRING PINS (the engine calls the verdict and forks on warmth; both normalizers + the arm card carry the offer)
  { name: 'test-codex-pool', tier: 'fast', why: 'in-process · 5.6 s' }, // codex pooled account cold-switch v1: store/spawn/self-heal + engine gates + wrapper signal relay + list() pool shape for every backend + ONE shared pool menu/roster pins (2.369.18)
  { name: 'test-vendor-whitelist', tier: 'fast', why: 'LAW credential (§ban-safety) · 2.1 s — vendor requests live in exactly two files; its LIVE leg re-measures the shipped oracles under strace whenever strace + the CLI are present', allow: ['binary'] },
  { name: 'test-account-verdicts', tier: 'fast', why: 'in-process · 67 ms' },
  { name: 'test-window-minsize', tier: 'fast', why: 'in-process · 1.5 s' }, // 2.369.158 (docs/design-desktop-apps §7.6, the owner's cropped calculator): a window's OWN minimum — the PURE rule (the .window floor, the drag clamp that keeps the opposite edge, raise-to-min, the window minimum from a content minimum + chrome under the UI scale), the REAL WindowManager.setMinSize + resize drag over a fake DOM (a minimized window never shrunk from a zero reading, the phone layout never raised) with a patched copy of the pre-fix drag as the control, and the wiring pins (desktop-app-window → setMinSize, the phone min 0 !important). <1 s, no browser
  { name: 'test-phone-chip', tier: 'fast', why: 'in-process · 0.2 s' }, // LANE PHONE-CHIP (B-e5ff, the owner's phone read "⣿ 全部 → Beta Ma"): the phone billing pill is whole or it folds (lane G's rule) — PURE billingPillForms (whole words only, zh/ja/en) + pillMode over names × slots × UI scale, the CSS census (no max-width / ellipsis on either phone pill; CONTROL: the pre-fix stylesheet), wiring pins
  { name: 'test-phone-chip-ui', tier: 'heavy', why: 'chrome: the real status bar bundled into a static page with the real CSS, 360/375/390 px × zh/ja/en under DejaVu Sans (~10 s)' }, // the rect census: the pill shows one whole form, never overflows its box, fits a line, title + aria-label carry every word; a rotation re-decides; CONTROL: the pre-fix bar + stylesheet cut the owner's name
  { name: 'test-title-chips', tier: 'fast', why: 'in-process · 86 ms' }, // lane G (2026-09-25, the owner's tab strip "V.." beside "≋ 全部 → UCI Max"): THE TITLE WINS — the PURE chipMode table (full / compact / icon at their exact boundaries, monotonic in the room), memberShortName / chipWords / titleMinText / inboxCountText, three patched-copy controls of the rule (always-full = the pre-fix chip, full-while-six-characters-show, no icon floor), the REAL WindowManager._fitChip over a fake box (same answer from every starting form, overflow, not-laid-out, measured once per words) with a label-only-room patched window.js as the control, and the wiring pins (every re-decision trigger, ONE ResizeObserver unobserved on close, one rAF per burst, the tooltip's full words, the CSS forms, the inbox chip's flex:none + 99+). <1 s, no browser
  { name: 'test-browser-faces', tier: 'fast', why: 'in-process · 126 ms' }, // THE THREE BROWSER FACES RENAMED (docs/design-browser-faces.zh.md direction B, takeover §7 / D10): every face's label at its source (toolbar Web view, the phone '+' sheet's three rows + gates + the session picker, card-menu commands, Session Properties, Settings category + Services group, customize, the Apps dialog's intro / 'Browser app ·' gate / pointers, trace + live-view pointers, rail) with the ids pinned unchanged; the i18n census (every new key in zh AND ja with the tabled words, every retired key gone unless still said, a live-t() control); the mockup-parity control (index.json 12/12 drawn, every shot's own control undrawn, a planted undrawn record refused); the doc's SHIPPED line. ~0.2 s, reads files only
  { name: 'test-docx-viewer-model', tier: 'fast', why: 'in-process · 73 ms' }, // THE WORD VIEWER'S RULES (lane docx-viewer, the owner's APA paper: a grey band narrower than the page, the page's left edge out of reach, no zoom): src/lib/docx-viewer-model.js tabled — fitWidthScale (pane − 2×pad over the widest page; no size ⇒ 1), zoomStep (a between-rungs scale goes to the NEXT rung), wheelScale (Ctrl+wheel, symmetric), pageIndexAt (a third down; the end of the scroll = the last page), viewerVerdict (a binary .doc refused BY NAME before any fetch), sniffVerdict + refusalText (zip / OLE / empty / other), linkVerdict (an ALLOWLIST: web + mail open in a new tab, #bookmark scrolls, javascript:/data:/file:/relative blocked), inheritHeaderFooterRefs (Word's Link to Previous, per type), the zoom pref, the toolbar as STRUCTURE with t injected; the i18n census; wiring pins (file-viewer.js asks viewerVerdict before the fetch, docx-viewer.js the one docx-preview importer and caller of every rule, the options, the shadow root, the altChunk sandbox, document.fonts, the paper CSS on theme vars only); a patched copy per rule goes red
  { name: 'test-toolbar-fold', tier: 'fast', why: 'in-process · 240 ms' }, // LANE toolbar-fold (2026-09-30, the owner: the top-right green cluster "takes too much width on a low-resolution screen and overlaps other chrome" — measured: `.toolbar-right { min-width: 160px }` let its flex-end buttons overflow LEFTWARD over the layout presets, the title and, sidebar open, UNDER the sidebar; 21 of 60 states): lane I's rule gains THE ICON STEP (barLadder — words go first, one button at a time in the fold order, then the fold) and ZONES (barLayout groups, each its own gap) over hand-computed tables; the toolbar's real table over the audit's measured widths (zh / ja / en / en in DejaVu Sans × 4 viewports × UI 1 / 1.25 × sidebar × toolbar scale 0.9–1.25: all 256 fit, hand-checked rows); 3000 seeded toolbars placed by an independent geometry walk (no overlap, inside the bar, ONE ⋯ iff folded, DOM order, minimal + monotone, ≡ barLayout without compact forms); the table census (every Customize element has a row, every folding row a registered command); wiring + CSS pins; mutant-copy controls (no icon step, compaction by position, zone gaps forgotten) + the pre-fix `.toolbar-right` rule planted
  { name: 'test-live-bar-layout', tier: 'fast', why: 'in-process · 830 ms' }, // LANE I (2026-09-25, the owner's zh live-view screenshots — labels stacked one glyph per line, "undefined" in the bar): the PURE chrome-bar fold rule src/lib/live-bar-layout.js over hand-computed tables (priority, right-to-left ties, the ⋯ charged, never-fold overflow, absent items, DOM order, the live view's real table at zh 600/400/330) + 3000 seeded bars (fits / minimal / monotone), the short mode badge (zh + ja), THE CASCADE-TIE CENSUS (no (0,1,0) style.css rule on a file-tool-btn companion class sets a property viewers.css's 24×24 icon rule wins — the root cause), the wiring pins (both views fold through bar-fold.js, URL / status minimums = their CSS, ONE mode toggle, the globe, the window menu's live-view row, zh + ja), mutant-copy controls (fold by position; the ⋯ forgotten) + a planted pre-fix rule; §4b THE WORDED-ICON-BOX CENSUS (the rebuilt switch dialog, 2026-09-27): every WORDED button wearing a ≤ 40 px icon-box class (derived from the sheets) in src/lib + index.html is reached by a width:auto rule of its own classes or of a parent the same file builds and appends it to — classifier / reach / planted-site / parent-law controls. ~0.5 s, no browser §4c THE DEAD-TOKEN CENSUS (2026-09-28, the naive-user verifier: the cap popover had no background — `--bg-secondary` is defined by no theme): no floating surface's background is a dead token, the browser dialogs' own surfaces use none, the product-wide count is a ratchet (51); controls = the pre-fix popover rule, a planted use.
  { name: 'test-desktop-record', tier: 'heavy', why: 'slow — 201 s measured at the 2.369.199 integration with verify r5 (162 s at r4), in-process (moved to the heavy tier at the 2.369.199 integration: THE TIER RULE bounds a fast row at 10 s, and this row alone put the fast sum at 486 s > 8 min; verify r4: + the unsaved-act legs ua/ub/uc on the real 500 ms debounce / 1 s cooldown / a 400 ms peer, the double leg ue, the stale-release leg st2, 4 patched copies more); before r4: 118 s idle (verify r3: + the in-flight / queued re-read legs w/x, the cooldown legs y/z, the stale-base leg st on the real 1.5/3/4.5 s ladder — its two controls shorten the ladder in their copies — and leg orph; before r3: 53 s (verify r1/r2: the deferred-record / reconnect / held-move / re-read legs wait on the real 200–300 ms drains and the 1 s cooldown, the failed re-read leg on its 1.5 s + 3 s retries; 22 patched copies, each re-running only its own legs)' }, // inc-mun7qjmw-iksh (userW, 2026-09-29): A DESKTOP\'S RECORD IS A VIEW, A WRITE MERGES — a drop onto a desktop never opened since the page loaded rebuilt its cached record from the page\'s built windows (the moved one) and the autosave replaced the server\'s record (HR 3 → 1). PURE src/lib/desktop-record.js (mergeDesktopRecord table, the server belt shrinkVerdict, the rollback point\'s desktopChanges); the real DesktopManager + LayoutManager over a fake app: the drop / menu / resume-placement doors keep the unvisited desktop\'s windows and add the moved one, the preview draws 4, the autosave SENDS the target\'s held record (4) and the source\'s, the switch builds all 4, the visited-first control, a close / an unbuildable window leave with evidence, a refused record reconciles; THE RAW-WRITER CENSUS over desktop-manager / layout / session-lifecycle / stage-manager (one `_savedStates.set(`, no `.windows =`, every `_setRecord(` a merge or named); wiring pins (the belt before the write in ws-handler); nine patched-copy controls (a replacing merge, the pre-fix cache rebuild, an autosave blind to changed desktops, a new raw writer, a belt blind to evidence; verify r1: a belt blind to arrivals, the one-slot defer, a remote move applied as a close, a reconnect that re-reads nothing); verify r1 §4 i/j/k: a burst for two desktops deferred one per desktop under the pointer and under `_restoring` (never dropped), a remote move applied as a move (never a close), a reconnect re-reading /api/layouts (closing only what the wire listed); l/m/n (D1/D6): the desktop on show deleted ⇒ the target\'s record sent before the delete, a refused record of the desktop on show re-sent by rearmSave alone, the switch\'s broadcast carrying the closes\' evidence — with a control each (delete-no-send, no-rearm, switch-no-evidence)
  { name: 'test-stage-rules', tier: 'fast', why: 'in-process · 150 ms' }, // inc-muly2izg-cks3 (userW, 2026-09-28): THE VANISH — a window leaving a chain takes its frame\'s visibility (tab-group _matchFrameVisibility), the hero\'s borrow re-shows its whole group, a torn-off tab joins the frame\'s workspace (§9–§10, two patched-copy controls); and the secondary half: the Stage\'s move rule (the owner\'s 2.112.4 directive — never between the Stage and a desktop) SPEAKS — PURE src/lib/stage-rules.js (kind / verdict / words, zh+ja), the real StageManager and DesktopManager over a fake app (a typed refusal, said on a user\'s act, silent for a program; "Move to Desktop ▸" of a Stage window = ONE reason row), the wiring of every door (title-bar drag over a preview, a taskbar drop, the menu, command mode), three patched-copy controls
  { name: 'test-stage-visibility', tier: 'fast', why: 'in-process · 640 ms' }, // inc-munl8jkl-gaih + inc-munbksgs-k3yz (userW, 2026-09-30: a conversation brought onto the Stage from another desktop came up as an EMPTY BOX that ignored clicks — the desktop wrote content-visibility:hidden, the Stage\'s show cleared only visibility + pointer-events): §1 PURE view-visibility windowMarks over all 32 reason sets × 3 window types (the Stage\'s hero = no reason = nothing marked); §2 the real WindowManager / DesktopManager / StageManager / ChatView over fake elements — a plain desktop switch (control), on Fin → Stage → go to a Scra window, leave + re-enter, leave to its home, a Stage-parked chat suspended + unrendered, a group hero (its guest\'s view runs; the hand-back hides the whole frame), a promoted host, a torn-off guest, a drag\'s lent visibility; §3 THE CENSUS — every writer of the two hider flags and of content-visibility / aria-hidden on a window element is the ONE door (WindowManager.setWindowHidden) or the ONE derivation, named by file:line; §4 five patched-copy controls (the Stage\'s pre-fix show + borrow ⇒ the re-borrowed hero blank; the desktop\'s and the tab-group\'s hand-written marks ⇒ the census red by name; the PURE rule without aria-hidden / without the Stage reason)
  { name: 'test-design-canvas', tier: 'fast', why: 'in-process · 160 ms' }, // THE DESIGN CANVAS (lane design-window L2): src/lib/design-canvas-model.js tabled — the view (zoom ladder, zoomAt keeps the anchor, pinch, fit, fit-width focus), framesOf (= the hub's validateManifest + layoutOf, imported), pages / notes / launch, normalizeRead (every read spelling, every failure loud), THE PICK FENCE (closed kinds, bounded fields, routeMessage = the source IS one of the canvas's frames), the frame documents (picker first in a bounded head window, print @page); wiring pins (sandbox allow-scripts only, no allow-same-origin anywhere, one message listener on the signal); a patched copy per rule goes red
  { name: 'test-doc-model', tier: 'fast', why: 'in-process · 0.13 s (PURE: the Doc window\'s fidelity corpus over prosemirror-markdown, the comments message, the edit summary, the conflict table, the hub over stub senders, six patched copies)' }, // lane doc-window
  { name: 'test-doc-wheel', tier: 'fast', why: 'in-process · 0.19 s (the Doc window\'s wheel: 30 fixtures through Tiptap v3 + block patching — untouched lines byte-identical, nothing dropped, reformats printed; PURE patchBlocks; rawReasons + WHY; the licence census printed; three patched copies)' }, // lane doc-editor-wheel
  { name: 'test-doc-comment-pop', tier: 'fast', why: 'in-process · 0.14 s (the Doc window\'s Add-comment popover over the real house popover in a mini-DOM: one at a time, gone on collapse / blur / outside press / Esc; wiring pins; three patched copies)' }, // THE COMMENT BUTTON LIVES AS LONG AS ITS SELECTION (lane doc-comment-dismiss, userW inc-muxrol54-uv2d): src/lib/doc-window-ui.js commentOffer
  { name: 'test-window-types', tier: 'fast', why: 'in-process · 61 ms' }, // window-type registry (Plugin Ph1): node-functional dispatch + loud unknown-action + the exact core type/action sets + no switch/TYPE_ICONS literal left
  { name: 'test-tab-close-confirm', tier: 'fast', why: 'in-process · 150 ms' }, // B-a67c (the owner, 2026-10-02: "当窗口是tabbed或者side by side的时候，注意点击整体的关闭要有个警告提示确认要关闭x个标签页吗，避免想关闭tab但点错"): the PURE closeAsks table (asks iff a person ends a whole group of ≥ 2) + groupCloseList (strip order, the tab names), the REAL requestCloseGroup body over a fake window manager (lone ⇒ at once, Cancel keeps all, the confirm closes exactly the named tabs, guests first, a failed question = Cancel), THE DOOR CENSUS over comment-stripped src/lib (a close-all loop only in the gate; every user-close / window-menu call classified group / tab), patched-copy controls
  { name: 'test-taskbar-group', tier: 'fast', why: 'in-process · 127 ms' }, // A GROUPED TASKBAR BUTTON (lane K, 2026-09-25, owner "这个体验比较差"): the PURE verdicts of src/lib/taskbar-group.js — the click table (behind ⇒ activate, in front ⇒ chooser, a drag's release ⇒ none, every pointer type, with or without an open hover chooser), the hover table (fine pointer only, never touch / drag / another popover, the ~300 ms intent both sides), in-front, keys; patched-copy CONTROLS (the old always-chooser click fails the 8 behind clicks; a hover that forgets touch); wiring pins over the COMMENT-STRIPPED taskbar.js (the single button asks none of it; verify r1: the chooser's cleanup disposes createPopover's outside-click close); §9 the REAL attachPopoverClose run in node over a fake document honouring { signal } (dispose after / before arming, a popover gone by another path self-heals, the LIVE exclusion list; master's function and the r1-minor one = the controls); the five verify-r1 lows pinned (a pen hovers, a rebuild re-anchors the chooser, a row's right-click = that tab's window menu + re-list, restoreTabChain notifies) + THE PRODUCER CENSUS over the class names the two "another popover" guards query (taskbar.js _otherPopoverOpen, app.js's autohide conceal guard), each guard's pre-fix `.taskbar-window-list` = its control; §10 the pen leg's judge (scripts/pen-hover-judge.mjs) over 360 fake-clock interleavings of Chrome's post-layout mouse re-target vs the CDP sample (the patched last-enter slot red on exactly the losing order) + §11 the REAL hoverStep (movement arms once per GROUP visit, an enter never, 'away' ends it) over 378 timed scripts (controls: every enter an arrival; 'away' ignored); zh + ja words. ~0.3 s
  { name: 'test-status-bar-chips', tier: 'fast', why: 'in-process · 59 ms' }, // THE STATUS BAR UPDATES IN PLACE (design-accessibility-tree §3 row 8 (b), §8 lean, chunk a3): the REAL ChatStatusBar driven through a 40-line counting fake DOM — ① the same chip node object survives 20 context%/cache/cost/turn-state ticks (hot chips re-write their markup, cold chips never, zero elements created) ② turn-state / health / held / workflow chips appear at their place and leave with the neighbours' identity intact, the goal chip flips on ONE element ③ attribute parity with the innerHTML era (raw titles, classless cache/cost, the pie markup) ④ NEGATIVE CONTROL: a scratch copy neutered to the whole-bar rebuild fails ① ⑤ wiring pins (render ends in _reconcile, no this._element.innerHTML, the one delegated click listener)
  { name: 'test-billing-chip', tier: 'fast', why: 'in-process · 130 ms' }, // THE BILLING CHIP FOLLOWS THE MEMBER (lane billing-chip, 2026-09-30, the owner's phone kept the member a conversation started on after the pool moved it): ONE PURE re-render key billingAuthKey (pool-priority-model.js) — its table (every printed field moves it: member name + id, pool, pin / priority place, host, estimated, kind, tail, detail; the pool default does not; collision-free), the REAL ChatStatusBar through a counting fake DOM (member A → the same pool on B ⇒ the chip names B on the SAME node, the placement words in its tooltip, a re-sent identity renders nothing), the REAL WindowManager.setAuthBadge over a fake title bar (both renderers hold exactly the PURE key after every step), two scripts/mutant-copy.mjs controls (the pre-fix `${source}:${name}` key ⇒ the chip stays on A; a PURE key without the member ⇒ the table fails), the src/lib census (no file spells its own billing key; the two pre-fix lines caught verbatim), the sidebar card prints no member (auth stays carried-only), the wiring
  { name: 'test-billing-row', tier: 'fast', why: 'in-process · 100 ms' }, // THE DECLARED BILLING ROW (lane dc-client-billing, 2026-10-04): a fake harness row patched into BACKEND_META drives billingRow / uiRow / viewIdFor / legacyIdFor / accountUsageStore and the REAL ChatStatusBar's billing chip (counting fake DOM); a mutant-copy control with the pre-lane `=== 'codex'` word ternary restored names the fake harness wrong; the 9-file surface census of the pre-lane spellings (with its own patched-copy control)
  { name: 'test-ax-paint', tier: 'fast', why: 'in-process · 140 ms' }, // paint-only OUT of the accessibility tree at the source (design-accessibility-tree §3 rows 2+3 lean, chunk a2): icons.js `_s()` aria-hidden + focusable=false over every exported value, the icon-only <button> census (template + DOM-built: an aria-hidden icon is no longer a name ⇒ title/aria-label required; a DOM-built rhs is icon-only when nothing but icons / whitespace strings is left, e.g. `icon + ' '`; classifier negative-controlled on a fixture AND on a scratch copy of src/lib with a planted nameless button), every gutter/diff-prefix/run-arrow/spinner/resize-handle/minimap-strip site marked, the CSS glyph census (every generated ▸/▾/·/LRM glyph in the alt-text form `content: '…' / ""`, no sentence carries it)
  { name: 'test-harness-spawn', tier: 'fast', why: 'in-process · 0.3 s' }, // dc-ws-create proof: a fake harness register()ed in ONE line spawns a stub session through the real ws-create path; its declared spawn rows + caps.pool are what the create reads (one-id-branch mutants red)
  { name: 'test-harness-contract', tier: 'fast', why: 'in-process · 213 ms' }, // S1 harness registry conformance: every registered harness passes the same descriptor/adapter/normalizer/wrapper/store/client-META assertions; unknown ids throw
  { name: 'test-tool-toggles', tier: 'fast', why: 'in-process · 87 ms' }, // per-feature Integration toggles: a disabled agent CLI is neither taught (context/reminder/stop nudge) nor served (403) — was outside the gate and rotted on a literal CLI count for 27 releases (B-0e1b)
  { name: 'test-raw-filename', tier: 'fast', why: 'in-process · 4.6 s' }, // lane raw-filename (userW "从vibespace预览里下载文件，文件名都叫raw"): GET /api/file/raw names the file inline in both RFC 6266 forms — the PURE helper tabled + a 3 000-name seeded sweep (Node's header validation, express's own content-disposition parser as the oracle); the REAL router (local: ASCII / CJK / hostile quote-semicolon-CR-backslash / PDF, Range 206 still named, 404 byte-identical to the pre-fix route, r2 a dotfile served + named with its control) and the REAL RemoteFs over a fake ssh host and a fake dial device (named; r2 a missing file / folder ⇒ 404 unnamed on raw, download, download-zip, a zero-byte file named, no ssh binary ⇒ 502, an abort ⇒ the child ended — CONTROLS the pre-r2 stream: the empty 200, the uncaught ENOENT, the child still blocked); the ATTACHMENT routes (/api/download, /api/download-zip) with ASCII + CJK names on all three transports answered 200 with both forms (r2: the remote raw-name header threw ⇒ never answered); CONTROLS = patched copies without the local / remote naming ⇒ red, the pre-r2 attachment spelling without files.js's remoteStream belt ⇒ never answered (2 s, ERR_INVALID_CHAR), with it ⇒ 502; THE SPELLING CENSUS (every Content-Disposition value is contentDisposition()'s or declared ASCII by construction; the pre-r2 spelling planted ⇒ red); THE CLIENT HOST CENSUS (every src/lib URL to /api/file/raw, /api/download, /api/download-zip carries the machine or is declared local-only; the pre-r2 code-editor ⇩ line ⇒ red); THE CENSUS over every sendFile / pipe(res) / res.download / downloadTo site in src/routes, src/server, src/*.js, server.js — NAMED (verified in the handler's source span) or DECLARED with a reason, no dead row; a stripped naming and a planted nameless route ⇒ red
  { name: 'test-global-search', tier: 'fast', why: 'PURE tables + the index worker over fixture transcripts (claude JSONL, codex rollout, .zst) + resume / live / artifacts / routes + 4 patched-copy controls · 3 s' }, // lane global-search (.221): Search everything — node:sqlite FTS5 in a worker, CJK bigrams
  { name: 'test-global-search-ui', tier: 'heavy', why: 'headless chrome (1280×900, then 390×844 twice) on a worktree server whose REAL backfill builds the index 60 s after boot, a fake claude (the artifact door) + a shell terminal, an esbuild bundle (~75 s; SKIPs without chrome / dtach)' }, // lane global-search-chrome (.221): the Search everything window seen and driven — ⚙ Tools row + singleton, the unbuilt-index line patched in place, zh query grouped + marked (text-node census), keyed scope chips, ↓+Enter landing IN the chat viewport of a dead conversation (read-only views mount ChatSearch), the Doc window, the Ctrl+K last row, Ctrl+Shift+F vs a composer / a terminal, zh + ja at 390 px (rect census)
  { name: 'test-artifacts', tier: 'fast', why: 'PURE rows + the harness hook + an in-process rebuild / live registry · 0.5 s' }, // lane artifacts-model: a conversation's deliverables DERIVED from the write record (kinds, the reducer, the replay, the card patched in place, the doc-window contract)
  { name: 'test-artifacts-list-model', tier: 'fast', why: 'PURE the Artifacts list at scale (design 021): filter / 3 groups × 3 sorts over the 217-row fixture / the band / words / the window\'s column sort + rail; listPlan linear in WORK at 250 → 500 → 1 000 rows (the work meter, in a child) · 0.6 s' }, // lane artifacts-list-scale
  { name: 'test-artifacts-panel', tier: 'fast', why: 'in-process the REAL popover + Artifacts window over a mini element tree (esbuild-stubbed): bounded, keyed identity census, group / sort memory, ⋯ per kind, keyboard, rail + column sort, live relay; 3 patched-copy controls · 1 s' }, // lane artifacts-list-scale
  { name: 'test-artifacts-services', tier: 'fast', why: 'PURE service rows + the registry over the REAL jobs engine (scratch dir, an ephemeral-port job) + the listen path census · 0.4 s' }, // lane artifacts-services: a Background Work job a conversation OWNS that listens on a port = a `service` artifact row (url through the instance URL, stopped greyed 24 h, the lineage rule)
  { name: 'test-artifacts-handover', tier: 'fast', why: 'in-process: a Task / workflow agent\'s sidechain writes ⇒ the parent\'s rows (live + rebuild parity, scratch HOME) + the hand-over over the REAL registry + msg-acl + 4 patched-copy controls · 0.1 s' }, // lane artifacts-handover: a helper\'s deliverable reaches the conversation the user talks to
  { name: 'test-viewer-download', tier: 'fast', why: 'in-process static census + stubbed helper · 0.3 s' }, // lane viewer-download (owner: "这个界面怎么无法下载文件"): every viewer kind the file-types registry routes to wires the ONE Download helper (src/lib/file-download.js; unlisted kind = red), the URL builder for local / ssh / device, the stub-fetch start + dirty toast, the title-bar menu row; patched-copy controls
  { name: 'test-image-cards', tier: 'fast', why: 'in-process · 103 ms' }, // image media cards against the REAL renderer in node: claude Read(image) + codex view_image → one expandable /api/file/raw card (host-qualified), non-image cards unchanged, XSS, codex call_id dedupe + input_image lifting, wiring pins
  { name: 'test-otel-truth', tier: 'fast', why: 'in-process · 84 ms' }, // per-request billing truth: parser + loopback ingest + bake override + wiring pins
  { name: 'test-search-card-title', tier: 'fast', why: 'in-process · 143 ms' }, // search cards carry the query in the TITLE (claude WebSearch/WebFetch, codex web_search, ACP search): pure helper + the REAL renderer (esbuild→node) incl. XSS escaping + wiring pins
  { name: 'test-path-linkify', tier: 'fast', why: 'in-process · 520 ms' }, // where a chat file path ENDS: CJK/fullwidth punctuation terminates it, CJK filenames still link (owner screenshot 2026-09-10); pre-fix negative control + renderer wiring pin; B-2dbc: the REAL renderer (esbuild→node) never wraps text already inside a .chat-link (a /p/<id> page link, a URL in code / tool output) — census + byte identity + a patched-copy control
  { name: 'test-model-echo', tier: 'fast', why: 'in-process · 187 ms' }, // the /model confirmation echo — ONE parser (src/model-echo.js) for the status bar, the command-card label and the lock repin: the backticked echo verbatim (CLI ≥2.1.257; last plain alias (id) 2.1.226) + the old echo as the control + ANSI/display-name forms, the REAL renderer label, wiring pins + a no-inline-regex census (25)
  { name: 'test-backlog-no-truncation', tier: 'fast', why: 'in-process · 443 ms' }, // THE BACKLOG STORE NEVER TRUNCATES (2026-09-22: a group at exactly the old 200-item cap lost every backlog-add silently while the CLI echoed a stranger's id): 2000 items round-trip, the REAL route echoes the STORED item by identity, source pins (no CAPS.backlogItems, no positional echo), the REAL CLI against a pre-2.369.150 server's backlog-only answer (exact-text match, never position; r.item-only control); `--priority` that older server ignores is SAID, never claimed (add + edit, no-check control)
  { name: 'test-backlog-priority', tier: 'fast', why: 'in-process · 435 ms' }, // BACKLOG PRIORITY + OWNERSHIP-AWARE SELECTION (owner 2026-09-22: no cap — priority + ownership pick what every push shows): PURE sortBacklog/selectReminders + oldest-first negative control, store normalize + repo-file round-trip, the REAL route (400 outside high|normal|low, sorted numbering), _backlogNoteLines (5 owned by priority+recency + the unclaimed-HIGH line), the REAL CLI over loopback, wiring pins, the Backlog tab (sort + chip + Priority menu/editor write, pins with cut-copy controls)
  { name: 'test-stop-nudge', tier: 'fast', why: 'LAW money · in-process · 150 ms' }, // A TURN THAT BOOKKEPT ITSELF STOPS FREE (B-a8f0, lane stop-nudge-free): the PURE stop verdict table (every why, the first rule first, no turn start ⇒ the time rule; control = the first rule cut), the stop-check route over a real express app (claude + codex sessions, a free stop never asks the spend authorizer), and the census of every bookkeeping write route stamping s._bookkeptAt
  { name: 'test-backlog-nudge', tier: 'fast', why: 'in-process · 332 ms' }, // THE BACKLOG CLEANUP NUDGE (2026-09-22): a session holding ≥ tasks.backlogNudgeAt (default 20, 0 = off) open items it claimed or parked is asked in ONE ≤500 B paragraph to finish / drop / merge — PURE ownedOpen/backlogNudge/nudgeText, the REAL route (add/edit/claim nudge, done/drop/unclaim/show never, the threshold through serverSetting), _backlogNoteLines, EVERY TURN through the REAL task-context + prompt-context (r2), ONE paragraph for N groups + 2/3 groups × 60 CJK items ≤ 9600 B untrimmed + task-context capped inline (r2), the REAL CLI's `note:` line, the setting row + zh/ja, each leg with a patched-copy control
  { name: 'test-chat-enter-ime', tier: 'fast', why: 'PURE · 90 ms' }, // AN ENTER MEANT FOR THE INPUT METHOD MUST NOT SEND (lane chat-enter-ime, inc-muukd9oq-qyc3): the EnterGuard table over keydown/composition sequences, the recorder\'s S-/c:1/ime words, the enterSends hint, patched-copy controls
  { name: 'test-press-select', tier: 'fast', why: 'in-process · 146 ms' }, // A LONG PRESS ON SELECTABLE TEXT IS A SELECTION, NEVER A MENU (lane mobile-select: a phone long press on chat text opened the message menu over the words the platform was selecting): the PURE press-target × device table, the REAL door (utils.js installLongPressContextMenu) under a dispatch model + fake clock, the touch selection closer, the grep-derived user-select opt-in census + the chrome rule, wiring pins, three patched-copy controls; verify r1: three layout pins (code/table blocks clear the float, the bubble-mode host, the touch-tablet hover buttons)
  { name: 'test-outside-press', tier: 'fast', why: 'in-process · 68 ms' }, // THE ONE OUTSIDE-PRESS CLOSER (lane M, inc-muhms5kt-0ejl: no floating menu closed on a press into an app's picture — the pane cancels pointerdown, so no mousedown): the PURE verdicts (inside / anchor / the picture / nested popover / ignore / root gone; mouse at down, touch+pen only as a TAP) + the REAL utils.js onOutsidePress under a fake document and a browser dispatch model (capture passive arming, the xpra-like pane and the noVNC-like canvas close, the press never cancelled or stopped, persistent / signal / root-gone / attachPopoverClose) + CONTROLS: the pre-lane closer verbatim stays open over the pane, two mutant copies (the helper on mousedown; in the bubble phase behind a stopping pane) stay open. ~0.2 s
  { name: 'test-window-drag', tier: 'fast', why: 'in-process · 2.4 s' }, // A RELEASE OVER A PANE THE PAGE CANNOT HEAR (lane-drag-release, userW's inc-muq7uk0f-e59s / inc-muq7wwfq-rruz): the PURE end-door table (src/lib/drag-end.js), the REAL WindowManager's title-bar drag + handle resize under a fake DOM with pointer capture modelled (a release over a swallowing pane ends the drag ONCE, the highlight gone, the drop applied; every end kind; the occupied-cell drop; the D5 shrink table at uiScale × DPR), patched-copy controls per rule + the pre-capture feed, the CSS shield / touch-action pins
  { name: 'test-user-todos-layout', tier: 'fast', why: 'in-process · 210 ms measured (verify-r4 F4: the exit ask row shows the whole command + a pre-fix control)' }, // the For-you popup keeps rows in their slots while open (inc-mtw02kbq-kj96: a ✓ slid the next row under the pointer); PURE layout + pre-fix control + wiring pin; ⑪ B-328d: THE CENSUS — every two-argument .add( on any receiver declares its producer `origin` (grep-derived, fails an unwired site; r2: aliased/?. evasions as controls) + the store's fail-closed throw + the HELD notice filter; ⑫ (2026-09-27, the For-you window's verify round) the store's caps (500 / 8000) NAMED on the returned record, the snapshot's 300-char preview of a resolved item (the ledger whole), PURE restoreDetails, GET /api/user-todos/:id cookie-only over a fake app, four patched-copy controls (the old 2 000 cap, a silent cut, a whole-broadcast snapshot, a no-restore layout)
  { name: 'test-inbox-window-model', tier: 'fast', why: 'in-process · 71 ms' }, // design-user-inbox-reply §9 (the For-you WINDOW): PURE src/lib/inbox-window-layout.js as tables — nextSelection (the mail-client rule), holdSelection, paneMode (NARROW_PX, touch rows), scopeRows (tab / the session's keys / every filter term), itemView (meta words, chips, the REAL reply verdict, the action row, Copy) — each rule beside a patched copy that breaks it (mutant-copy, outside the tree); wiring pins: the window calls every rule, the popup's order (sortGroups/openLayout/nextLayout), THE model's verbs only, two innerHTML writes (sanitized markdown with raw HTML escaped + an icon), the four doors (popup ⤢, row ⤢, mini inbox ⤢, ⚙ For you…), the viewer modal retired, zh+ja
  { name: 'test-peer-text-census', tier: 'fast', why: 'in-process · 7.1 s measured (lane fast-budget: was 81 s — every planted control re-read and re-scanned ~390 files; the reads are memoised by path and the scans by text now, and the job leg asks the engine\'s sweep instead of waiting its 5 s tick): a grep over the tree + the real channels engine in a scratch dir + one hook spawn' }, // THE PEER-TEXT → AGENT CENSUS (lane peer-census, B-00ef, 2026-09-29): every (file, door) site where text a peer wrote leaves a store toward an agent is a row of a checked-in TABLE with its rule (bounded · folded · frame-inert · re-judged-at-read · declared:<why>) and a wiring pin; the derived renderer fence; the belt src/peer-text.js (bound → fold → the frame rule per line and per piece); attack legs over the real modules (split openers ×16, a dangling opener + the next prefix, 64K/128K linear + 1 MiB bounded, legacy stored frames, prototype keys, mailto/javascript words, our own marker words); mutant-copy controls (a belt without the line rule / the fold, the pre-lane inbox quote reproduced, a planted site caught)
  { name: 'test-inbox-reply', tier: 'fast', why: 'in-process · 225 ms measured (verify-r4 F5: an exit ask refuses a typed reply — §2 / §4c + control §6c)' }, // design-user-inbox-reply D1 (chunk 1): the reply quote block (compose/parse round trip, the 1500 cut, hostile strings verbatim), replyVerdict's five projections, the store's options + resolveByReply + options-first order, the route over the REAL sender + claude adapter (one frame = composeReply, every refusal by name with nothing written, agent tokens 403), the turn fact, wiring pins + a patched-copy control
  { name: 'test-user-todos-expiry', tier: 'fast', why: 'in-process · 192 ms' }, // SPEND NOTICES LIVED FOREVER AS ACTIONS (2.369.152): add() takes a validated expiresAt, a merge keeps the LATER end, expireDue resolves only due OPEN items (one broadcast, a count), the store sweeps at load + on an unref'd 5-min timer, spend-guard stamps hour +60 min / day +24 h / refusal +6 h — every leg beside a patched-copy control (the migration leg lives in test-migrations)
  { name: 'test-record-clear', tier: 'fast', why: 'in-process · 92 ms' }, // "Clear content…" (2026-09-28, the owner's ask — scrub a peer agent's paste of an unrelated mailbox): PURE src/record-clear.js as tables — clearVerdict (owner any · an agent its OWN session's record · a pending fork / a job token / another session refused by name, × the five kinds, the producer items an agent never owns), every kind's cleared record BYTE-IDENTICAL outside its text fields (real store shapes), the sentence a STRUCTURE (the English key stored, zh/ja only in the dictionaries), the group-log fold; verify r2: matchSnippet (why a Find matched), MAX_ITEMS + chunked (a batch over the route's cap goes in parts; the ORCH door and the client count by the one number), the refusal words by code with zh + ja; eight patched-copy controls (an agent clearing another's entry, a forgotten fork, a job token let in, a dropped field, a kept detail, translated words stored, a tail-dropping chunker, a case-sensitive snippet)
  { name: 'test-progress-archive', tier: 'fast', why: 'in-process · 900 ms' }, // 2.369.204: the Activity log's overflow MOVED to data/task-groups-archive/ (before the trim), paged reads within a byte budget, a clear / delete / Backup & migrate reaching the archive — patched-copy controls
  { name: 'test-record-clear-stores', tier: 'fast', why: 'in-process · 620 ms' }, // "Clear content…" over the FIVE REAL stores in a scratch data dir + the owner routes + the agent verbs over a fake express + the REAL vibespace-task / vibespace-ask CLIs against a stub server: every derived copy loses the marker — TASK.md, the injected context (single + multi group), the diff snapshot, the task-context / prompt-context routes, the For-you preview + restoreDetails, the current status + the queued override notice, the jobs registry + archive (ARCHIVE FIRST: a failed write changes nothing) + event ring + held stash + spill file + the job's For-you items, the group log (the replacement record appended, the original line kept, the index, paging, unread, reports, the audit row); refusals by name (not_yours / pending_fork / job_token / agent_forbidden / ambiguous); every journal line carries ids only; verify r1: a `--notify` reminder's held notification loses its words (the pre-fix announced-only copy as the control), a detail-only status entry clears the current record's detail (the reason-only copy as the control); verify r2: a cleared job's covered run log is WITHHELD and says so (`logWithheld`; the REAL `vibespace-job logs` / `poll` print it, a run after the clear is served; the pre-fix rule as the control)
  { name: 'test-record-clear-census', tier: 'fast', why: 'in-process (a grep over the tree) · 4 s (verify r8: §I scans all 432 files, memoised per file; verify r9: + the one-level alias pass)' }, // "Clear content…" THE READER CENSUS (verify r3, 2026-09-28 — the round's rule: a class that keeps returning "one more copy" gets a census; verify r8 §I: THE INTERPOLATION CENSUS — every message that embeds a record's words, the journal included): grep-derived from the tree and judged against ONE table — §A each store's data file is named by its owner module only (+ the two in-place migrations); §B every store-log read is inside channel-store, groups-engine's readFolded / clearMessages, or a channels-engine function whose declared gate (known( / an adapter record) stands before the read, and channels-engine never names the groups adapter; §C every store-touching route (60) classified reads / folded / echo / writes / meta / exception and every reader named in the heavy walk's probe list; §D the five broadcasts built where declared; §E every /api path the shipped CLIs call is a census route; §F the derived copies each door rewrites pinned statement by statement, the five doors called only by their owner + the ONE entry point, twelve declared exceptions each with its reason; §G four patched-copy controls (a route reading the group log by path · read() without the fold · a route reading jobs.json off disk · a new agent route serving the Activity log), each RED on its own leg · §H THE CLIENT (verify r5): every browser storage write classified by key (61) and no IndexedDB / CacheStorage / cookie / window.name / URL write, every window title that reads a record's words belongs to a window whose layout record keeps a generic title (persistence WORDLESS_TITLES), THE BELT (every text field of the five kinds a surface reads is worded through the cleared-aware words or declared — 24 rows), the long-lived client caches (43), each surface's repaint on its store's broadcast (12); four patched-copy controls
  // CHANNELS v2 / the communication panel (docs/design-communication-panel.zh.md).
  // All PURE/SHARED logic — no server, no chrome, no vendor call anywhere: the
  // fake adapter talks to nothing.
  { name: 'test-channel-search', tier: 'fast', why: 'in-process · 900 ms' }, // design 010 (B-c9be): the snippet reader, the merge, the refusal table, the store's newest-first cut, the engine's press / floor / back-off / around / agent --full over the fake vendor's search, patched-copy controls
  { name: 'test-channel-record', tier: 'fast', why: 'in-process · 59 ms' }, // the ONE normalized record: the dedup key, `@_user_N` ordinals, and an external body carrying our own frame markers coming out INERT (§25: + ④e every string of the render tree comes out inert)
  { name: 'test-mail-frame', tier: 'fast', why: 'in-process · 4 s (⑪ spawns its child controls, cut at the budget)' }, // lane channel-rich D2 (the owner: "gmail 这种富文本 html 内容似乎完全没有按照 html 渲染"): PURE src/mail-frame.js — the allowlist re-serializer over a 58-mail HOSTILE CORPUS (script in every syntax, meta refresh, base, form, object/embed/iframe, srcdoc, </iframe> + </style> breakouts, javascript:/data:text in every attribute + entity/tab spellings, SVG onload, MathML mXSS, CSS url()/@import/image-set/expression, target=_top, attribute breakouts, comments/CDATA) — no script, handler, dangerous element, load from the attacker, and a FIXED POINT; a 10 MB body refused by name, 1 000 pictures capped + counted, 20 000 nested divs bounded; remote pictures blocked until Show pictures (https only), the CSP exact + FIRST, ONE nonce'd script, per-sender memory, the parent's message verdict (source + token + clamp + href), lazy frames ≤ LIVE_FRAME_CAP; wiring pins (the ONE srcdoc, sandbox allow-scripts only, step order); three patched-copy controls RED; ⑪ (security verify) 8 quadratic shapes at MAX_HTML_BYTES < 1 500 ms, five old-loop copies OVER the same budget in a child
  { name: 'test-channel-thread', tier: 'fast', why: 'PURE · 2.2 s (a 2 s hang control)' }, // lane channel-threads (2026-09-28, the owner: "你似乎不支持 lark 的内嵌回复 (thread)"): src/channel-thread.js — the §1.3 mapping table over invented real-shape fixtures per vendor (Lark through the REAL normalizer incl. an omt_ topic whose root is absent + reply_in_thread; Slack parent/replies/thread_broadcast/a parent stored before its first reply; Telegram one-level reply_to_message, external_reply, a forum topic as a conversation; Gmail = kind conversation), T1–T8 (chains keyed by the topmost ancestor, the root by identity / named / earliest-without-parent, distinct counts, a thread of one, the vendor count merged as the max with the root line never read — attack 14, the hop bound + a cycle keyed by the smaller id — attack 1, placeOf quote/loaded/external, agentPlaceLine frame-inert, paneMode, threadView paging), the census shape 251/23/9/1 as a seeded corpus + roots recovered for pre-`root` records, bound-before-parse (512-char ids, a linear quote path); four patched-copy controls (root counted as a reply, no cycle guard, no guard at all = a 2 s hang read RED, stats off the root's line)
  { name: 'test-channel-placement', tier: 'fast', why: 'in-process · 0.2 s (the real engine over two scripted vendors, no vendor call; five patched copies)' }, // lane channel-threads, placement round (2026-09-28, the owner: "the boolean is Lark-shaped"): WHERE A REPLY LANDS — chat / quote / thread / thread+chat declared per adapter in its threads cap row (+ rootReply, the vendor's norm); the PURE table per vendor (Lark / Gmail / Agents / the fake shipped, Slack + Telegram as fixture rows), the caps-row census (grep-derived, a planted module found), the registry's send contract, the engine end to end (refused before a proposal exists, stored with the inThread alias, sent, receipted), the words zh/ja/en + wiring pins, controls: PL3 blind to the parent, PL5 / PL4 removed, the declaration unclamped, the unguarded send
  { name: 'test-channel-quote-topic', tier: 'fast', why: 'in-process · 0.5 s (the real engine over a Lark-shaped scripted adapter + the fake accounts, no vendor call; five patched copies)' }, // lane channel-threads, the QUOTE-vs-TOPIC round (owner 2026-09-28, both rulings "是"): a Lark reply without a thread id is a QUOTE, never a thread — ONE PURE classifier (src/channel-thread.js placeKindOf: plain / quote / topic-root / topic-reply / topic-quote) read by the render (strip / chip / tag), the agent's words ("quotes …"), the engine's placement default + its thread read + its walk (not-a-thread, zero vendor calls); the table over the naive pass's real-shape fixtures through the REAL Lark normalizer + the fake-poll rooms (shot 03); zh 话题 never 线程 over every channels surface (a grep-derived key census + a named non-channel list), ja ONE word スレッド, the i18n check; controls: a chain-is-topic classifier, the pre-fix render pair (the shot reproduced) with each layer alone holding, the engine's own parent rule, the walk without its refusal, planted 线程 / トピック
  { name: 'test-channel-threads-naive', tier: 'fast', why: 'in-process · 0.4 s (the real engine over fake / Lark-shaped rows, no vendor call; one patched copy per finding)' }, // lane channel-threads, the NAIVE-USER pass (2026-09-28): each finding a fresh-eyes user proved in a real browser, pinned with its patched-copy control — ① a disabled account's refusal in the device's language (the thread pane / Refresh drew the engine's English "Lark / 飞书 is disabled" on a zh page); ② no dead ↩ "reply to this message" in a thread pane that cannot be answered (the REAL pane over a fake DOM); ③ who reacted in NAMES only — "You" for the owner, a nameless reactor counted, never an id (the REAL fold + the client words); ④ a reaction digest waits as "a reaction notice", never "a channel message", and carries no reply hint (the REAL engine files it, the real summary + injection render it); ⑤ a placement refusal tells the agent the FLAGS for what is offered (the shipped CLI against a stub answering the PURE verdict); ⑥ the pane composer line wraps, never cut (the rule over the REAL pane; measured in test-channel-threads-ui (h))
  { name: 'test-channel-reactions', tier: 'fast', why: 'PURE · 7 s (the meter pins the V8 optimizers off — lane mirror-green; the parser census COUNTS the work of every scaling parser at n and 2n — scripts/work-meter.mjs, never the clock; a 2 s hang control)' }, // lane channel-threads: src/channel-reactions.js + the record's reaction/side schema — validateReactions refusals by name (64 KiB key, alphabet, prose glyph, a vendor URL as a custom image, 65 keys, 21 reactors, byTruncated recomputed), validateSide bound-before-parse (attack 2) + truncation + the 8 KiB line + sideKey, the fold F1–F6 with attacks 3/4/5 (replay once, a delete on nothing floors at 0, 150 reactors − one outside the kept 20 = 149 / byTruncated 129, mine via our newer delta), first-appearance order, the vocabulary (emojiOf case rule, u… unicode keys, the Lark table == the vendor page's 182 names in scripts/fixtures/lark-emoji-types.json), identity (forAgent / agentReactionsLine / reactionDigestLine never name a reactor — attack 12); ⑥ THE PARSER CENSUS (verify r1): every export of channel-reactions.js + channel-thread.js has a row — its size cap asserted with an oversize input, and for a scaling parser the linear pin (the parser alone, a small cache-resident input repeated, n / 2n interleaved, median of 9 ≤ 2.5, ≤ 3 attempts) — or a stated reason; a new export with no row is RED; five controls (no F2, order by count, an agent line printing by, a key judge that hangs — killed at 2 s, the pre-fix quadratic compactSide read ×4 by the census's own measurement + its 146 KB snapshot line)
  { name: 'test-channel-facts', tier: 'fast', why: 'PURE + the engine in-process · 1 s' }, // lane message-facts (B-f066, design 007): a message's FACTS — the table ⇔ the schema ⇔ zh/ja words, validateFacts (closed kinds/types, bounds, frames + hidden characters in every string, unknown kind dropped by name, byte-identical without facts, the fx side record), the fold + compaction, the summary at 1/4/60, details, chips, the agent line (V2 the line rule), THE PAPER TEST (Slack/Telegram/Outlook mappers → no new type; the rows they would add printed), Gmail's ten kinds from full-format headers (RFC 2047, groups, a quoted comma, 20 KB To ⇒ cut, Bcc only on own sent mail, Sender = From ⇒ none, a 1 MB Cc bounded), the contract (caps.facts ⊇ emits, factsOf declared ⇔ implemented), the engine's backfill (20 clicks = 1 vendor call, side hit free, refusals by name, foreign id never written, the fold in the window page + the agent copy) and the route's agent refusal
  { name: 'test-channel-blocks', tier: 'fast', why: 'in-process · 4 s' }, // THE RENDER LAYER (§25, 2026-09-27, the owner: "设计一个不同 connector 的 raw message to HTML 的接口"): the CLOSED block schema (refusals by name, bounds, inertFrames over every string, an unsafe href demoted to text); safeHref + the linkify table (bare/www/mailto/e-mail, `[text](url)`, `<url>`, trailing punctuation incl. CJK, every hostile scheme, a phishing label shows the target); the generic rung; the MAIL rung over invented fixtures in the real shapes (EN wrapped "On … wrote:", zh 写道, Outlook header block, Original Message, forwarded, `>`-only, ticket banner, `-- ` + mobile signatures, no quote); cleanSubject; the REAL Lark + Gmail toRecord → blocks (an image is the picture, no "[image]"; `text` unchanged) + the stored-record rung; the registry's render/titleForm/blocksOf/sendGrant; the REAL engine in-process (a stored record served WITH a tree, a subject title cleaned, sendForm/sendGrant, the preview; zero vendor calls); THE RENDERER over a minimal DOM (validated links, chips, the fold rule + memory, pictures in place, zero innerHTML); wiring pins; eight patched-copy controls; ⑭ (channel-polish) the avatar rule — initials, a stable hue, the palette's 108 pairs ≥ 4.5 : 1 computed from style.css's theme blocks with a control, pins; verify round 2: the inline regex compiled once per rung call (21 K paragraphs × 256 names), cleanSubject bounded, controls (o) (p); verify round 3: the frame regex linear on a whitespace run (1.7 s per record before: ingest + every page read + every client) with control (q) + the same matches on every shape, a label-less link's href counts, a site-shaped label held to its host; ⑮ THE UPWARD PAGE'S VERDICT (src/lib/channel-paging.js: a scroll event pages only on the person's input, a wheel / a pull at the top asks directly, refusals by name, atTail; pins; the clamp control)
  { name: 'test-channel-feed', tier: 'fast', why: 'PURE · 0.3 s' }, // lane lark-search-poll (B-5aab, 2026-09-28, the owner: "从 lark pull 消息可以通过搜索空格+时间范围来搜索最近所有新消息吧"): src/channel-feed.js — the change feed's window (overlap ≥ 30 s, the 1-h clamp ⇒ a single-chat catch-up, a lagged-index simulation finds every message), the page verdict (an ignored time range parks after ONE page, the declared unit — never guessed from the magnitude), the fold (owed marks, U6 both marks, births of single chats, group hints), owedSatisfied / birthFacts, the snippet census (module + registry + the engine's feedPage), the measurement (promote ≥ 200 ≤ 2 %, demote > 2 % over ≥ 20), the sliding minute; four patched-copy controls
  { name: 'test-channel-authors', tier: 'fast', why: 'PURE · 420 ms' }, // lane lark-threads PART B (2026-10-01): src/channel-authors.js — the owner\'s own name for an author wins, else the vendor\'s way (nickname, then (department) / (job title) per channels.larkNameField), the vendor name never rewritten, external by tenant, every string bounded; three patched-copy controls
  { name: 'test-peer-parsers', tier: 'fast', why: 'in-process · 8.2 s (a timed census: 40 parsers × their adversarial shapes at 64 / 128 KB — the floor first: a shape under 15 ms per call at 128 KB is judged trivially fast, the rest by the min-of-5 ratio; 35 s before, red on THE TIER RULE)' }, // THE PEER-BYTE PARSER CENSUS (security verify r2, 2026-09-28): every exported function of src/mail-frame.js, src/channel-blocks.js, src/channel-record.js, src/channels/gmail.js and src/channels/lark.js is a ROW (a size cap proven by an input over it + linearity t(2n) ≤ 2.5 × t(n) on its own adversarial shapes) or EXCLUDED with a reason — a new export goes red until placed; CONTROLS = round 1's per-quote newline scan in the mail sanitizer, round 2's regex-chain stripHtml and lazy parseAddress restored in patched copies, all ×4 under the same judge. Born of the two parsers round 1's hand-written census missed: Gmail's stripHtml (64 KB of `<` = 1.2 s at ingest, no cap) and parseAddress (a 64 KB From = 1.4 s)
  { name: 'test-channel-caps', tier: 'fast', why: 'PURE · 30 ms' }, // laneState (DEMOTED > LIVE > CLAIM) + scanState (freshness > platform > client > grant > 'ui') + the convCaps TTL + offers/identityWarning/freshnessClaim, each with its own control
  { name: 'test-channel-send-row', tier: 'fast', why: 'in-process · 6 s' }, // lane gmail-reply-known: a refused send-row lookup is named + retried (open, auto re-ask, back-off, owner Retry, 1 flight, propose) + 3 patched-copy controls
  { name: 'test-channel-store', tier: 'heavy', why: 'slow — 12.9 s measured at the .197 integration (the row said 515 ms): lane channel-threads\' side-log controls re-read the pre-r1 / pre-r2 stores at 1–4 MiB (≈ 10 s of the total)' }, // §5.1's leg: TWO CONCURRENT PASSES each advancing their own cursor, with the read-modify-write shape as the negative control
  { name: 'test-channels-index-scale', tier: 'heavy', why: 'slow — ~50 s in-process, ~1.7 GB: builds a 50 274- then a 100 548-row channels index and counts the work of window opens and index writes (V8 precise coverage runs unoptimized)' }, // B-f32b (lane channel-index-copy): a window open is linear in its conversation, not in the index, outside the account census (the owner question) — known() never copies the index, the kept unread total, a broadcast by key; the incremental index write (cached chunks) bounded and byte-identical to the whole-file serialization; the sweep finds a row changed outside update(); VIBESPACE_CHANNELS_INDEX_VERIFY's own control; controls: the base's known(), a whole-map re-sum, a bare-id broadcast, the whole-file write
  { name: 'test-channels-census-pace', tier: 'fast', why: 'in-process · 5.2 s (50 274 rows built in memory; the clock and the pace timer injected; lane channel-drain-scale: + the views paced inside a pass — 10 300 rows, 300 refreshes, a patched-engine control)' }, // B-f32b r2 (lane channel-index-copy, the coordinator's ruling): an account's clock census (hot / warm / cold / due) walked at most once per 5 s with ONE trailing walk + broadcast after the last change — a 21 s burst of opens / mark-reads / overrides walks ≤ ceil(21/5)+1, the user-moved numbers (listed, unread, unlisted, paused, overridden, the first read, the unread total) exact on every broadcast, the trailing census = the full walk; controls: pace 0, a timer that never fires
  { name: 'test-channel-census', tier: 'heavy', why: 'slow — ~34 s in-process: the scheduler card\'s census index held to the walk after every step of a seeded 2 000-step walk over 10 000 rows (5 accounts, real passes; the reference walk alone is ~13 s) + the work meter + 3 closed-world controls' }, // lane scheduler-census-index (B-7978): THE SCHEDULER CARD WALKED 90 000 ROWS EVERY PASS — PURE src/channel-census.js (rowClock / censusStep / expired / untilCmp) + the engine's census index; a census reads the touched + crossed rows, never every row
  { name: 'test-channels-engine', tier: 'heavy', why: 'slow — 15.5 s measured at the .197 integration (master 6.2 s; the composed lanes\' engine legs — threads, reactions, the Lark feed, rich messages, the clear): the ingest engine over the REAL store' }, // the ingest engine over the REAL store: a transient append failure costs a RE-READ never a skip, a failing adapter's health survives a healthy neighbour's pass, markRead never broadcasts a no-op, and a route may not mint an index row — each with a patched-copy PRE-FIX control; P1a ⑤ the BURST DAY: newest-first paging to the anchor over the real loop, 340+320 records whole with zero duplicates, the anchor advances only after a complete walk and never on a budget-cut one; ⑩ (hotfix, the owner's toast "mode 'filtered' needs a filterId") a FILTERED save at the account + pattern grains with its filter inline — the minted f-<kind>-<id> threaded before the validator, every refusal on those routes worded by its closed code (zh), the pre-fix validate-first copy as the control · ⑬ mirror-193: a whole-list access/watchers write whose `base` stamp the grain moved past is refused 409 grain-changed, nothing written; GET …/adapters/:id/view stamps like the store; a wake is not an edit; control: the engine without the verdict writes the mirror's [reader, 工作] — ⑯ (inc-muk9jj0j-rel3) a RE-AUTHORIZATION re-judges every conversation of the account: two threads judged read-only before the consent, a disabled account no pass touches ⇒ after the consent both writable on READ (stale-on-read), in the ONE whole digest and on DISK (the write-time re-judge), zero vendor calls, a same-scope refresh moves nothing, an adapter with no pure rule marked stale; control: the engine copy that skips the invalidation keeps both read-only (the owner's incident) · ⑰ ("Clear content…" verify r1) the generic messages reader serves only a KNOWN conversation — an agent group's log is 404, the un-gated copy serves its original line by path
  { name: 'test-channel-drain', tier: 'fast', why: 'in-process · 9.9 s (the median of three at the .197 integration; lane lark-search-poll: rule 21 rides half the mixed seeds + a third of the paced ones, its table and 5 mutants; lane channel-drain-scale: + ⑦ the work meter\'s three child judges overlapped with the walk, a purity pin every 29th step and three controls — +2 s on a loaded box, base 11.6 s → 13.3 s there)' }, // THE DRAIN IS PURE (lane R2 verify r9, the second structural closure): src/channel-drain.js's step function over a snapshot — a seeded random walk (48 seeds × 3000 steps, four profiles incl. PACED) asserting its 18 rules at EVERY step against an independent oracle (admission + the owner's reserve, stop/drop in one step, judgement at sight, the rider rule, FIFO humans-first, the interleave, the budget per call + the cut, the ok at its fetch, the share per fetch, discovery once and never ahead of a human, the timer's turn, the bound, one queued pass, lane R5's per-second pace — a `wait`, never a refusal or a skip, with the 1/10/60 s windows of every send inside the exact tolerance) + exactly-once / honest-ok / liveness; the owner's 873-row Gmail first read (≤ 80 units in any second, ≤ 2 440 in any minute) with the pace-off burst as control; the 70-cell table and the r2–r8 repros in the model's own terms; fairness; a patched copy per rule turning its own leg red; the census (imports nothing, codes the routes + CLI know, an engine with no scheduling of its own)
  { name: 'test-channel-budget', tier: 'fast', why: 'in-process · 0.8 s (lane gmail-quota-share: the PURE budgetStep table + a seeded 5 000-step walk, two real engines over one fake vendor bucket for a simulated hour, the restart, Gmail discovery metered before/after, 5 patched-copy controls)' }, // THE VENDOR BUDGET IS LEARNED (src/channel-budget.js): a refusal burst halves the account ceiling, a quiet minute creeps it back, persisted beside the account
  { name: 'test-channel-send-files', tier: 'fast', why: 'in-process adapters over stub HTTP + patched src copies · 1 s' }, // lane channel-send-files: Lark / Slack pictures + files — request shapes judged by tables from the vendors\' docs, the receipt per part, 4 controls
  { name: 'test-account-policy-door', tier: 'fast', why: 'in-process engine + the real routes · 1.5 s' }, // lane account-policy-door: the account's sending policy door — the PURE row model (zh/ja), the route's base/409, account review ⇒ send refused, direct ⇒ offered in place, inheritance, the agent's words, a patched-copy control
  { name: 'test-channel-attach-send', tier: 'fast', why: 'in-process engines + the CLI as a child against a local stub · 3.0 s' }, // design 005 §2.B (B-fd1f): an agent's attachments — bounds, names, sniff, the digest binding, the re-hash at send, retention, the owner route, Gmail multipart, --attach
  { name: 'test-channel-avatars', tier: 'fast', why: 'in-process · 110 ms' }, // lane channel-avatars (B-5fe1): people's real pictures — memo, order, caps, route census
  { name: 'test-channels-list-polish', tier: 'fast', why: 'in-process · 60 ms' }, // lane channels-list-polish: the peer is not the account (resolved identity), list row model, name ladder, picture keys, badge on top
  { name: 'test-brand-marks', tier: 'fast', why: 'in-process · 30 ms' }, // lane brand-marks: the vendor marks' SVG contract + the colour-analysis gaps on the path data
  { name: 'test-channels-images', tier: 'fast', why: 'in-process · 534 ms' }, // R3 (2026-09-26, the owner: "lark图像不能预览吗？", design §23): a picture the vendor sent is SHOWN — the record (a Lark image / a picture or video inside a rich text, wrapped or not ⇒ an `image/*` / `video/*` attachment with the text's own placeholder token, no invented name; channel-record keeps `placeholder` only when declared, neutered + bounded); the PURE fetch verdict's ORDER (cache first · remembered · ours only · fetchable · enabled · joined · back-off · budget · fetch), the memory TTLs, the thumbnail's next step (retry after the wait twice, then the NAMED chip; a non-raster file = the download chip), the text line a drawn picture leaves; the REAL engine + store through the ROUTE: nothing fetched at ingest, five concurrent first requests = ONE vendor call + ONE charge, 429 vendor-budget + Retry-After + no-store past the minute while a cached picture still draws, a forbidden picture remembered until the person's Retry, a rate limit is the ACCOUNT's (the next picture waits with no call), a disabled account fetches nothing, the LRU ledger coalesced (0 writes for 10 hits, on disk after the flush), a picture older than the newest 5000 records found by its message; controls: no join (5 calls), no memory, the per-hit ledger write, no retry limit, no cache-first, the 5000-record-only lookup (404)
  { name: 'test-channel-rows', tier: 'fast', why: 'in-process · 3 s' }, // design 008 (B-3cf8, userW's first Channels open: GET /api/channels sent every conversation, 77.5 MB): the first read's candidate test ⊇ statusTag row for row at every window edge (+ a control), its attention list = focusRows over the whole list, the keyed row store's never-loaded rule, the full-list readers' census
  { name: 'test-channels-focus', tier: 'fast', why: 'in-process · 211 ms' }, // R3 (2026-09-26, the owner: "开头不要把所有消息都放进来 … 只放重要消息/conversation … 并展示一个小tag表示状态", design §23): the PURE attention list (src/lib/channel-focus.js) over a fixture index — every "matters" rule (awaiting · unknown · assigned at ANY grain · read in 24 h · new since the read · held · replied in 24 h), the ONE-tag priority table, the EXCLUSIVE 24 h edge, the 7-day held window (a stash is not held), groups always / archived never, the header counts, the filter + "{n} more in All"; the spec's fixture through the REAL engine (50 rows, 5 assigned, 3 read via readFor, 1 awaiting ⇒ exactly those 9, "9 need attention" / "All 50", the reads gone a day later); the server's facts (the agent read STAMPED who/when/upTo in the index + ONE partial broadcast, never for a hidden read, once a minute per tail, 5 principals, persisted; the wake names its target and a refused one is held; the owner's own message from `isSelf` records, a sent proposal, the one-shot derivation; untouched rows `touch: null`); the words in en/zh/ja with the name its own part; controls: an inclusive edge, read above assigned, a keep-every-row list, a stamp before the reach check; the R3 × R4 seam (2.369.191): a DIGEST watcher's open window is not "held" — PURE heldPending over touch.pendingFor + the row's R4 watchers (a table + the real engine: a pending digest hit untagged, 61 min later held), controls: the pre-seam total, a statusTag without the watchers
  { name: 'test-channel-names', tier: 'fast', why: 'in-process · 1.0 s' }, // B-c127 EVERY HUMAN-VISIBLE CHANNEL REFERENCE SAYS THE CONVERSATION'S NAME AND OPENS IT (the owner 2026-10-02: "oc_e53d…: 1 message"; THE NAME LADDER ① name → ② description → ③ the id only when nothing is known): §1 the grep-derived census (every title-or-id fallback in src/ judged by name; the removed shapes stay gone; the wake + receipt deliveries carry their `channel` ref; every For-you filing about one conversation carries open-channel and the jump opens it); §2 the PURE src/channel-ref.js over the real block writers; §3 the REAL engine (a titled room, an untitled single chat → its other party, an untitled group → its authors, an unknown room → null; the approval pointer, the Outbox title, the receipt card; the touches store); §4 patched-copy controls restoring each pre-fix line
  { name: 'test-channel-api', tier: 'fast', why: 'in-process + loopback stub vendor + the CLI · 3.1 s' }, // B-2198 the Channels RAW API pass-through: the fence rows + mutant controls, the ORCH, the engine tier rows, the CLI
  { name: 'test-channel-api-cards', tier: 'fast', why: 'in-process · 40 ms — B-2198 part 2: ONE raw-API proposal = ONE card in the chat, the Outbox and For you (PURE model tables), the decision answering all three, the next-turn receipt, the 24 h expiry + withdrawal by name (ORCH over fakes), patched-copy controls' },
  { name: 'test-channel-api-chrome', tier: 'heavy', why: 'chrome + a worktree server — B-2198 part 3: the raw API seen in a browser — the API access dialog, ONE card per proposal in the chat / Outbox / For you, Approve / Reject / always-allow, zh/en/ja, 390 px, a no-digest control (409); zero vendor calls (stub preloaded)' },
  { name: 'test-channel-touch', tier: 'fast', why: 'in-process · 430 ms' }, // FROM THE CHAT TO THE CONVERSATION (§26, B-099e — the owner: "那就按照这个做吧", plan A, passive): the PURE src/channel-touch.js tables (the touch record + its key, the ring's merge window + cap, the renderer's gate, the naming evidence, bindToCall — sequential / parallel batch / unfinished / next non-tool message / the tail fallback / skew — the fold (one row per conversation, drafted first, three + "+N more"), the words, the turn's chip, the reverse link's strongest op + age, a search's bounded touches); the ORCH witness over a fake session map (frame-inert titles, a new touch broadcast at once with turnAt and a merged one COALESCED — 200 reads in 2 s = 2 broadcasts, 1 meta write —, the debounced meta write + the shutdown flush, list / forConversation); the REAL routes/channels.js reads (agent bearer 403); nine patched-copy controls (named rule, batch rule, tail rule, drafted-first, fold, merge window, turn filter, inertFrames, the broadcast coalescing); wiring pins (every agent verb records — test-architecture §63 is the census —, the holder on three card shapes, the ChatView hook, the keyed escHtml'd chip, ONE channel-window call, no innerHTML in the view, three boot-restore paths, the manual's one sentence, zh + ja)
  { name: 'test-stash-strip', tier: 'fast', why: 'in-process · 3.2 s (r7: three 800-fill sweeps; r8: the exactly-once walk)' }, // WHAT WAITS FOR AN AGENT (2026-09-27, the owner: "我在界面里完全看不到'有消息在 queue'这件事情"): the PURE src/stash-summary.js tables (kindOf by source + path, a peer named like VibeSpace is still a peer, summarize, the words singular / plural / cost); the REAL ladder + the REAL jobs stash + the REAL src/server/stash-handover.js: a write fires ONE debounced re-publish, the fact counts both stores, HAND OVER = ONE injection with every item + ONE ledger row under stash-handover + the stashes emptied of exactly what went (a notice arriving meanwhile keeps waiting), a spend refusal BY NAME leaves both stashes as they were, the next injection's drain clears the fact; the route (agent bearer 403, 409 nothing_waiting, 404); the REAL strip + card hint over a fake DOM (in place, the digest gate); verify r1 + r2 (one hand-over in flight, the claim — an `ho` stamp ON DISK in both stores —, every path pair as an interleaving with a parked post incl. a SIGTERM / SIGKILL restart over the same data dir, the codex ok:false frame through the real consumer restored as its original entries, `billed` × harness × turn × wrapper against the ledger, the overflow words); eleven patched copies; verify r5 ②f (the REAL hook routes: a drain fits the inline cap or waits — a resume's full context + a handed-back frame; the memory's junk gate, torn file, spent-first bound, record-less echo) + three more patched copies; wiring pins + zh / ja; verify r7 ②h (the producer CENSUS + a control that adds an uncounted one; fit-or-wait for every consumer — the restart's first prompt, three groups, the manager intro, the intro beside a 3 000-char preamble; the codex SessionStart door; the hook's event header + the real script; the order vs r5; the boot) + five patched copies; verify r8 ②i (an unrenderable notice record is a queue POSITION: the admitted notices ride the same prompt, the record is dropped by name; control: the queue that skips it) + ②j (THE EXACTLY-ONCE WALK: two seeds × four harness/mode rigs × 500 random steps — stash entries / job notifications / notices / group edits / job events / restarts, both routes by both callers — every item whole in exactly one answer, dead calls touch nothing, a trimmed answer consumes nothing; control: consume-first notices ⇒ violations)
  { name: 'test-channel-adapter-contract', tier: 'fast', why: 'in-process · 77 ms' }, // every registered adapter through all three receive modes + both scan sources, plus the grep census that no call site outside src/channels/ branches on `kind`
  { name: 'test-channel-manifest', tier: 'fast', why: 'in-process · 1 s' }, // lane dc-channels-manifest: a vendor = its folder + ONE list line (the acme fixture joins by one line in a list copy; register() refuses a malformed vendor)
  { name: 'test-secret-box', tier: 'fast', why: 'in-process · 96 ms' }, // src/secret-box.js: byte parity with mounts' former _enc/_dec (both directions), key minted on ENOENT ONLY (every other errno TYPED), 0600, never overwrites — with the bare-catch copy as the standing negative control
  { name: 'test-integration-registry', tier: 'fast', why: 'in-process · 2.2 s' }, // design §14: the PURE table + the store (publicView never leaks plaintext, last-4 at the 12 boundary, omit-vs-'' , user > cluster > none, inject-then-remove ⇒ none WITH a reason, the delegating row's prefer/multi) + the env-NAME census over `git ls-files` and the no-timer-calls-test( census, each with a synthetic offender
  { name: 'test-cluster-presets', tier: 'fast', why: 'in-process · 2 s' }, // lane cluster-presets (B-53fe): PURE src/preset-layers.js (the parsers = the env rules, the per-key merge cluster < release override, the value-free diff, the line's words) + the presets-directory reader over a scratch dir in the kubelet's ..data shape (a swap seen once with ONE journal line, a malformed / too-large file keeps the previous presets, the env fallback, the directory rules); 3 patched-copy controls
  { name: 'test-integrations-store', tier: 'fast', why: 'in-process + loopback http · 1 s' }, // lane cluster-presets: the REAL store + wiring + routes on the presets directory — a ..data swap re-broadcasts every card's recomputed view, runs the listeners once, pushes cluster-presets-updated; preset-gone by name; a malformed file keeps the previous presets; control = the env-only store
  { name: 'test-mounts-oauth', tier: 'fast', why: 'in-process · 1 s' }, // lane cluster-presets: MountManager.drivePresets from the presets directory (Drive _driveClient, gmail-sync _client, a live rotation, a withdrawn client), the env + legacy pair as the fallback; control = the env-only reader
  { name: 'test-fleet-image-seed', tier: 'fast', why: 'in-process · 0.5 s (git over a throwaway origin + clone, a stub npm)' }, // lane cluster-presets P6 ("ff pull failed — realigning" on every fleet deploy): the tracked files a build rewrites, DERIVED from package.json's build scripts ∩ git ls-files + npm's lockfile == src/server/auto-update.js BUILD_REWRITTEN_TRACKED == the Dockerfile seed step's resets (+ its clean-porcelain assertion, in order) == scripts/update.sh's resets before the pull AND after the build; every untracked build output gitignored; the REAL module over a throwaway repo with an npm-10-shaped stub — the pre-fix copy leaves M package-lock.json and the next pull aborts (control), the fix ends clean twice in a row, heals the dirty pod, names an unlisted rewrite in one line, skips a failed install
  { name: 'test-oauth-field-parity', tier: 'fast', why: 'in-process · 616 ms' }, // design-integrations-per-account §4/§8.1 #12 (D1–D8): the storage + channel account dialogs are ONE component (src/lib/mounts-dialog.js) — its exports, no second renderer on either side, every SHARED spelling asserted on BOTH sides, every re-authorize = reauthDialog, switching the client = re-authorize on both sides (D2), each side's Edit button order (the channel's = the r4 mockup's), Remove… in Edit, D8's sentence, the design's §4 i18n key list parsed from the design doc (drawn as built + zh + ja), each rule with a patched in-memory control (0.1s)
  { name: 'test-channels-lark-shape', tier: 'fast', why: 'in-process · 591 ms (verify-r6 O1 ⑧: a reply anchor elsewhere refused before any request + control)' }, // design §6.3/§12.1/§13 (P1): the Lark READ adapter over RECORDED fixtures — auth.state's four-valued ladder (the resolver's answer is an INPUT), the FIXED-mode consent flow on a FREE port, PAGING TO THE ANCHOR across pages (both continuation spellings), every msg_type to plain text, `@_user_N` ordinals, typed failures, the refresh + invalid_grant, the credential-exchange Test runner; P4 ⑧ (84): send = ONE documented request with `uuid` = the idempotency key (hashed past 50), a reply hits the reply endpoint, convCaps NARROWS to [] with `send-scope-not-granted` until BOTH dotted send scopes are held, a transport failure after the request left is `detail.lost` while a 403 is a plain refusal, reconcile = found-in-chat / the SAME uuid re-issued inside the hour / landed:false only on a COMPLETE scan past it / unknown otherwise; zero vendor calls
  { name: 'test-channels-gmail-shape', tier: 'fast', why: 'in-process · 855 ms (verify-r6 O2 ⑧: recipients fixed at propose, a late stranger\'s message ignored + control)' }, // design §6.3/§12.2/§14.2 (P1): the Gmail READ adapter over RECORDED fixtures — the DELEGATING row resolved through the REAL integration store on a TWO-PRESET env (org1 + channels, no 'default') and connected END TO END through the REAL engine on the EPHEMERAL loopback, threads as conversations under the include query, history.list incremental (nothing changed = one request; 404 = reseed; a dead thread = skip), the MIME tree to plain text, the shape-only Test; P4 ⑧ (90): the TWO-PHASE send (one anchor read → drafts.create → `onHandle` BETWEEN the phases → drafts.send; the MIME chains In-Reply-To/References on the anchor's Message-ID), a phase-2 transport failure is LOST with the handle while a phase-1 one is a refusal, reconcile = draft still exists ⇒ never sent + discarded / draft gone + our SENT message in the thread ⇒ landed / no evidence ⇒ unknown, the handle-less drafts.list fallback; zero vendor calls
  { name: 'test-channels-slack-shape', tier: 'fast', why: 'in-process · 203 ms (design 012 S1: the paste sign-in, every Slack message shape, the per-method buckets, files only on files.slack.com + 6 controls)' }, // design 012 (B-ff09): the Slack adapter over RECORDED answers (scripts/fixtures/slack/recorded.json) — no live call
  { name: 'test-channels-slack-send', tier: 'fast', why: 'in-process · 369 ms (design 012 S1: connect by paste through the engine, the token on no disk, prepareSend decided once, review only, purge on remove + controls)' }, // design 012 (B-ff09): sending as the person only through the Outbox — the REAL engine over the fake Slack
  { name: 'test-slack-landing-nologin', tier: 'fast', why: 'in-process · 270 ms (the real Auth gate + channels router: a cookie-free Slack landing under password and Clerk, the exact exemption, refusals by name, the 30/min door limit, the owner\'s finish line + 2 controls)' }, // 2.369.214 (userW): the consent landing needs no VibeSpace login — another browser profile lands; the record still needs the owner\'s tab
  { name: 'test-channels-push', tier: 'fast', why: 'in-process · 2.3 s' }, // design §6.4 / fence 11 / decisions 18+20 (P1b): the REAL engine + REAL store + a REAL lane over a fake push SERVER (ws on a free port) — the ack after durability (+ a replayed event id, + a crash injected between persist and index), heartbeat silence ⇒ push-dead ⇒ fast cadence, stop() terminal for an arm in flight, THE EXIT: a declared-but-not-exclusive lane demotes itself with its numbers, the demotion changes what it carries (kick, poll, no sample, never self-heals), a re-declaration zeroes and retries once; shared/unknown never carry; the route; the Lark lane over a stub SDK; the Gmail pull lane over a fake fetch. Zero vendor calls
  { name: 'test-channel-filter', tier: 'fast', why: 'in-process · 108 ms' }, // design §7.1-§7.5 (P2): every rule kind's truth table, any/every with `why` as a CONTRACT, the estimator's honesty (a match-all rule ⇒ totalPerDay === matchedPerDay; a corpus shorter than the window ⇒ truncated; the reader's cap ⇒ sampled), the assignment's two authority caps + the read-time clamp, the round-robin, the pacing verdict, and the §7.5 block (≤6 records, "(N older elided)", byte budget, a vendor body carrying our frame markers or heading coming out INERT) · ⑪ mirror-193: grainStamp (order-free, a rename/wake never moves it, every edit kind does, a clamped view stamps by authorityStored) + grainBaseVerdict's table; ⑫ (channel-polish) the Notify dialog's PURE preview sentence (notifySentence) in en / zh / ja over five watchers, mentionOnlyName, the dictionaries, pins (no receipt control, the three questions); verify round 2: the answers ⇄ the watcher one to one over the 126-watcher space, the third-answer control; verify round 3: what a person DOES to a record — a re-pointed row carries no receiptWake / stored window (samePrincipal), every leading @ stripped by the wire and the dialog alike (`@@x` no longer widens to `x`), a cut at the bound leaves no trailing space, a cap-0 digest's preview reads digestCap + says why it will not save, the refusal names the dialog's field, the filter's name and a missing rule pinned, the any-principal control
  { name: 'test-channels-lane-parity', tier: 'fast', why: 'in-process · 1.4 s' }, // design §6.1 / fence 12 (P2): ONE day of traffic through push (content) / poll / scan against the REAL engine + REAL store + REAL spend guard ⇒ the same record set, the same wake count, the same charge; the push lane with `channels.pushCoalesceSeconds` = 0 wakes MORE (the window is what buys the batch back); a record pushed once and polled once is one record and no second wake
  { name: 'test-window-reveal-desktop', tier: 'fast', why: 'in-process · 31 ms' }, // userW inc-muv3qfo7-96tm (the Outbox button did nothing — its window was on another desktop): PURE revealDesktop (another desktop ⇒ switch; active ⇒ none; Locate ⇒ none; the Stage; a switch that did not land ⇒ one toast) + the REAL revealWindow body over a stub manager (switch FIRST, then the focus lands on a shown window; minimized ⇒ switch + restore) + CONTROL (the switch removed ⇒ a hidden window focused ⇒ red)
  { name: 'test-channel-outbox', tier: 'fast', why: 'in-process · 1.6 s (verify-r6 §6 O1–O5: the reply anchor, recipients at propose, the wrapping envelope, the 700 ms arming + shown digest, hidden characters — controls per fix)' }, // design §9.1/§9.4 (P3): the PURE state machine (every allowed + every forbidden transition, with its actor), guards that only TIGHTEN (a direct policy + a link ⇒ review), fail-closed on an unknown policy / an unparseable guard, off-hours OFF without a zone, the TTL; then the REAL engine + fake adapter: propose → pointer filed → approve (edited) → sent → pointer retracted → receipt via noWake, reject, expiry, `unknown` never auto-retried, the audit attempt/outcome pair; P4 §9.4 (107): THE IDEMPOTENCY MATRIX (the key IS the proposal id on the send and on every reconcile, the wire text + attempt instant stamped BEFORE the request, a two-phase handle persisted the moment it exists) + THE RECONCILE MATRIX (lost ⇒ unknown never failed; landed ⇒ sent + receipt + the item retracted; not-landed ⇒ failed; no evidence ⇒ still unknown with the asks counted and nothing re-sent; a typed refusal ⇒ failed; `idempotency:'none'` cannot be asked; the boot sweep turns a `sending` corpse into unknown by actor `boot`)
  { name: 'test-channel-watch-spec', tier: 'fast', why: 'PURE · 1 s' }, // LANE AGENT-WATCH-PARITY (the owner, 2026-10-07: are the notification settings callable by an agent too?): src/channel-watch-spec.js — the agent's watch flags / --spec row = the Notify dialog's grammar, judged by channel-filter's own validators (every flag ⇒ the row, every refusal by name, --spec round trip, regex = regexVerdict, THE KIND CENSUS: a new rule kind without a CLI flag is red); CONTROL: --regex without the judge
  { name: 'test-channel-agent-watch', tier: 'fast', why: 'in-process · 1 s' }, // LANE CHANNEL-AGENT-WATCH (the owner, 2026-10-01: an agent registers its own watch / how does it know what to request / an account grant must count for a chat notification / next turn or wake now): PURE delivery + origin + THE ELIGIBILITY RULE (access over the grain and its ancestors), the directory switches, the owner's symptom reproduced on the real engine, the agent's watch / unwatch / wake request + the owner's Approve, next-turn hits to the free stash vs a legacy wake, `list --all` titles only; CONTROLS (scratch copies): a filter judging by its own grain only, an engine dispatch without the next-turn branch
  { name: 'test-channel-acl', tier: 'fast', why: 'in-process · 66 ms (verify-r6 Q1: an access request decided once — Deny + Approve in flight)' }, // design §8 (P3): hidden by default, MAX over grants, widen-only (a group grant is never narrowed by a member row), request → exactly one grant + the group default byte-identical, the uniform not-found, origin on every grant; THE NEGATIVE CONTROL: a user grant beside an assignment grant survives un-assign byte-for-byte (through the real engine)
  { name: 'test-channel-groups', tier: 'fast', why: 'in-process · 837 ms' }, // AGENT GROUPS (design §22, owner D1/D2 + §22.5): the PURE model (shape, pairKey symmetry, every membership transition incl. archive-on-pair-drop, the notify enum, THE wakeVerdict table mode × @mention × invite × --quiet × mute, reportFor since-join + context first + byte budget + the read --before pointer), groups.json through channel-store's ONE door (the read-modify-write negative control), the engine over the REAL store + REAL ladder with a recording authorizer (reach refused by name, an invite wakes N, next-turn wakes nobody and reports ONCE, mention wakes only the named, always's refusal journaled + still logged + reported, send <agent> = ONE symmetric pair), the turn gate through the REAL prompt-context route (a machine turn gets no report), the one-writer census with a planted writer
  { name: 'test-dispatch-model', tier: 'fast', why: 'in-process · 1.4 s' }, // lane worker-dispatch: the PURE dispatch verdict over 1 728 combinations vs an independent oracle, the record, the ONE compaction observer, the REAL groups engine + ladder + typing sender + claude stdout consumer driving a stub CLI (/compact first, the brief after its end; mid-turn / terminal / canceled / past-the-wait / spend-refused / concurrent / paced / no-lane legs), four mutant-copy controls, pins
  { name: 'test-channels-groups-ui', tier: 'fast', why: 'in-process · 80 ms' }, // THE IM-FIRST PANEL, fast half (design §22, chunk g3): the PURE list/composer/autocomplete/picker/fold arithmetic (src/lib/channel-groups-view.js) + THE WAKE PREVIEW's parity with the engine's wakeVerdict over notify³ × five texts (a mute-blind preview as the control); the owner's own external send DIRECT (no policy, no guard; an agent's `direct` ignored; no send-as-user ⇒ refused by name; audit propose→attempt→outcome), the digest's lastText, the groups engine's owner read mark (derived unread, a no-op mark broadcasts nothing) + live roster over the REAL stores; the XSS census over the five client files with a planted `innerHTML` of a group name as its control, the composer split decided only by composerMode, no adapter-id branch, the fold PATCHed to user state, the i18n census's new data paths; wiring pins
  { name: 'test-everyone-principal', tier: 'fast', why: 'in-process · 0.3 s measured (the real channels engine over a scripted adapter, small)' }, // ALL AGENTS (lane everyone-principal, 2026-10-02 — the owner: "所有配置权限的地方都加入'所有'这个选项"): THE CENSUS (grep-derived, printed) — every principalPicker call in src/lib offers the All row (`everyone:`) or is EXEMPT with a reason, every reach / ACL model spells everyone (the raw-API tier module inherits it when it lands), controls: a picker without the row, a new unlisted picker, a planted model, channel-acl without the kind; the PURE tables per model (MAX, widen-only, removing All restores the specific rows; exit reach's everyone + a profile's all ARE the row, an everyone ROW refused there, the rows picked beside it kept); THE MONEY RULE over the real engine — an All watcher wakes every running conversation under ITS OWN cap (3 × cap 2 ⇒ 2 each, a later conversation fresh, a named agent beside All never billed twice), controls: one shared ledger ⇒ 2 in all, no cap ⇒ every hit bills everybody; the request answered "already allowed" with no card; the dialogs' wiring; i18n
  { name: 'test-principal-picker', tier: 'fast', why: 'PURE · 70 ms' }, // THE PRINCIPAL PICKER (channel-polish, 2026-09-27, the owner: "session 特别多的话 … dropdown 交互会很不友好"): the PURE model's tables — the accent/case fold, the filter (every token: name / folder / Task Group / backend substring or an id prefix; CJK by substring) and its rank, the sections (Task Groups, sessions under their Task Group by title, Other), recent pinning + the recent list, the keyboard walk, a folder's tail, the identity, the ONE initials; the CENSUS — the four former sites call the picker and no <select> filled from a principal roster is left in src/lib (a planted select + the pre-picker reach editor as controls); patched-copy controls (no NFKD, no section sort, OR'ed tokens); verify round 3: `enterTarget` (the highlighted row by key, else the first row only while the person's own redraw armed it) + control (d) the unarmed fallback
  { name: 'test-dial-facts', tier: 'fast', why: 'PURE + a git ls-files read + the pairing words module and the address picker (a mini DOM) in node · 448 ms measured (verify-r6: L1 a claim is never the default + THE LAUNDERING WALK + controls (r) (r2), P1 a requested push kept or refused + control (w), P2 not_paired, P3 the tick never upgrades a press, G4 both route verdicts acted on; verify-r5: G1 the picker checks Custom… empty on a loopback-only server + control (s), C1 a device\'s stated address is `claimed` unless VibeSpace offered it + control (r), C2 a refusal\'s statements never land + control (t), C3 an old daemon\'s fallback worded, A1 the route\'s name verdict + control (u), A3 case twins + control (v), A2 the name the device gets; verify-r4: F1 the device-stated address + control (n), F3 the bind + (o), F6 the name rule + (p), F7 the platform header, F8 the Generate sentence, THE RECEIVER-FACT CENSUS over 17 regions + its DEFAULTS table + control (q); naive-user: N-loop / N-sheet default choice + controls (j) (k), N-refused words in zh + control (l); verify-r3 THE DIAL-TOKEN DOOR CENSUS: R1–R6 over every tracked token-handling file, two exemptions with reasons, the door\'s verbs, the wiring, six planted-site controls; verify-r3 B-grad: the graduation\'s ssh invocation + control (i); B-inst: seven wiring pins over the command, install.sh, install.ps1, agentd.js, the route\'s command field; verify-r2 the dial endpoint adds the refusal-budget tables incl. 50 000 rotating knocks)' }, // lane-pairing ①③⑤ (B-7007, the owner's MacBook 2026-09-27): PURE src/dial-facts.js — the address list over fixture interfaces (origin first, relay dedup, 100.64/10 tailscale, loopback / link-local / internal never, IPv6 bracketed), the custom-address verdict (18 inputs), the daemon's failure classifier over every node code + the UPGRADE_REFUSED shapes + up/upMs, the header reader (closed codes, ≤ 80 bytes), the dial-status reducer, the log line, --dial-check's exit codes, THE row state over six states + the mint guard; controls: every 401 as refused-unknown, no mint guard, loopback candidates
  { name: 'test-sock-path', tier: 'fast', why: 'in-process · 250 ms' }, // lane-pairing ④: SHARED src/sock-path.js — the rung ladder (darwin 104 / linux 108, runtime-dir / tmpdir / tmp / too-long, UTF-8 bytes), the ownership verdict (a patched lstat: symlink / another uid / 0777 ⇒ socket_dir_hijacked) + a real 0700 mkdir, the witness reader (a live socket wins, a plain file is ignored) and client.js's `_sock` = that reader, THE CENSUS of every socket path the tree builds (grep-derived; a planted producer caught); control: a bound fixed at 108
  { name: 'test-exit-reach', tier: 'fast', why: 'in-process · 338 ms measured (verify-r6 G3 every part of the X1 belt alone + the route 409 + the client words, Z1 invisible characters refused + control (z1), W1 a changed ask says changed, W2 a reopened ask that is over closes; verify-r5 X1: one item per exit ask, an agent\'s re-file filed beside it, the Allow belt + controls (x1a) (x1b), X2 bidi direction controls refused + control (x2), X4 an agent cannot resolve its own ask + control (x4), control (j) strips the belt; verify-r4 F2: `use` refuses a conversation on another machine + control; naive-user N-ja: the zh / ja "nobody" carries a negation + control; verify-r2 ask-a: a conversation gone while its ask waits — the stale Allow, the kill hook, the call\'s abort signal, the object-identity belt, the route\'s hang-up; a no-liveness control copy; ask-b: the item leaving open by any door settles the ask — the ✓, dismiss, Mark all seen, the agent\'s own resolve, the store\'s expiry, our own answer once; a no-subscription control copy; the open connection: a Task Group change re-judges a waiting ask via rejudgeAll + a no-ask-loop control copy)' }, // lane-pairing ⑥: PURE src/exit-reach.js — every stored shape, THE 84-cell grant × access × caller table, agentView, the stamp / base, the PATCH verdict, ask + answer with a fake clock, the run record, resolveMachine, THE WORDS CENSUS with poisoned names; the REAL ExitProxyManager over fakes (+ the real UserTodoManager): ask ⇒ one For-you item, ask_pending, Allow / Deny / 60 s expiry, a revoke during the wait (stillGranted) and during the run, a Task Group left, the unreadable store, the fork, the use forward closed with its last user, the audit + cards; the REAL exit-routes over express (jbt_ 401, bearer on the answer 403, allow-exit 410, PATCH base 409, a live pick resolved); seven patched-copy controls
  { name: 'test-exit-runs-dialog', tier: 'fast', why: 'in-process · 1.5 s measured — esbuild bundles of the real Commands list painter and chat card block over a fake element tree (lane exit-see-whole, 2026-10-03)' },
  { name: 'test-approval-census', tier: 'fast', why: 'in-process · 930 ms measured (verify-r6 (lane-pairing) THE APPROVAL CENSUS — "what you approve is what runs": §1 THE CAPTURE RULE over every client dialog that gates an action (87 awaits of showConfirmDialog / showInputDialog over the tracked src/lib files): no live read (the explorer\'s folder / machine, the sidebar\'s machine list, the system panel\'s machine) after the await, exemptions with reasons + control (e1) the pre-fix explorer Delete; §1b every showConfirmDialog call passes one options object + control (d1) the blank Stop confirm; S1 the force-kill pin + control (s1); §1c an Allow counts only once it sat still ARM_MS (PURE press-arm tables, the popup + window pins, control (v1)); §1d THE ONE HIDDEN-CHARACTER DOOR: src/hidden-chars.js asked by every approval surface, no raw hidden character in any product file + controls (z2a) (z2b); §2 AGENT HTML NEVER RESTYLES AN APPROVAL: every DOMPurify use / markdown parse in src/ through src/lib/safe-html.js (census over 416 files), its config + class/input/link hooks + fail-closed door run in node, the 2595-class CSS census + controls (h1)–(h6)); §3 THE APPROVAL ROWS: every answer call / route / permission frame / producer action type (71 grep hits) claimed by one of 16 rows, each row\'s (a) same record (b) re-check (c) no other writer (d) format pinned or declared with its reason, its gate by its words; §3b THE MERGE CELL + THE RE-CHECK CELL over the real store / ExitProxyManager + controls (α) text-keyed merge for one producer, (β) the route without its re-check' }, // verify-r6: the class gate for the authority class three rounds found one instance at a time
  { name: 'test-exit-rejudge', tier: 'fast', why: 'in-process · 7.4 s measured (verify-r3 THE AUTHORITY-CHANGE CENSUS: the grep-derived census of every writer that can withdraw a conversation\'s reach to a machine — hosts.js record writers, task-groups.js membership writers, every activeSessions.delete, every live-session reach-fact write, the manager\'s own writers, the un-pair routes — with a planted-writer control per rule; one runtime leg per event on the REAL ExitProxyManager + HostManager + TaskGroupManager + UserTodoManager with a live forward over a loopback echo and a waiting ask (bytes stop, the ask settles by name, the row lists nothing, the pair refused; a re-pair and another holder\'s end withdraw nothing; the ask\'s expiry; another client\'s answer; a hub restart); a judges-nobody control copy)' },
  { name: 'test-exit-proxy', tier: 'fast', why: 'in-process · 5.1 s measured (verify-r3 A-r3a: the REAL HostManager — a narrowing import, an import without the machine, a removal each cut the open connection; a control copy whose import does not re-judge, +1.7 s; re-tiered by lane-pairing: a fake device + loopback echo, no server — it was never heavy; the 2 s is the bare-connection wait of verify-r1 A3; verify-r2 A3-r2 adds the per-connection judge legs: a Task Group left, a dead conversation, onSessionEnd cutting an open connection + stopping an unheld forward, the constant-time compare, the two session-end wiring pins, a pair-only control copy; verify-r2 the open connection: rejudgeAll cuts a group-left conversation\'s OPEN connection, the other holder untouched, the forward stopped with its last holder, the Task Group onChange wiring pin, a judges-nobody control copy — +0.9 s of 150 ms byte round trips)' }, // ExitProxyManager (task #164; lane-pairing ⑥): who may borrow the network (listFor over the `use` list), resolution over EVERY machine with the grant judged after (a refusal names the grant, never "no such machine"), and the SOCKS forward's byte pipe + lifecycle
  { name: 'test-msg-cli-groups', tier: 'fast', why: 'in-process · 1.5 s' }, // AGENT GROUPS CLI (design §22.5, chunk g2): data/bin/vibespace-msg against a STUB server — every verb's request (group create/invite/leave/kick/rename/archive/notify/list, read --before/--limit, send --wake), THE WAKE ECHO ("woke N agents = N billed turns", said at 0 too), typed refusals with code + candidates + remedy (exit 1; 2 outside a session; 3 server gone), the JOB fence refused locally with no request (control: a session token reaches the stub); then the ROUTES over the REAL engine + store + ladder: an ambiguous member / group name refused WITH the candidates and nothing written (control: a unique name creates + wakes via peer-message), a jbt_ token lists/reads/posts but never creates (control: the owner's own token makes the pair); the manual's Groups section, the docs index line, and the ONE ≤ 300 B groups pointer in the Reporting-back teaching with a patched-copy negative control
  { name: 'test-channels-agent-cli', tier: 'fast', why: 'in-process · 1.5 s' }, // design §11 (P3): data/bin/vibespace-channels driven against a STUB server — list/read/reply/status/request; `reply` only proposes; a hidden conversation and a nonexistent one print the SAME uniform error; `send-not-available` says so and creates nothing
  { name: 'test-channels-identity', tier: 'fast', why: 'in-process · 84 ms' }, // design §9.5 (P3): the sent body carries NO honesty line and none of draftedBy/approvedBy (they stay in this instance's audit log); `identityMarking` drives the card's warning structure + the receipt's three fields (`unknown` as loud as `marked`); `reply` on a sendAs:[] conversation returns send-not-available and creates NO proposal; r4: an approval after convCaps expired re-resolves and refuses with the adapter's reason instead of sending; P4 ⑤ (48): REAL `sentAs` receipts — the receipt carries the identity the VENDOR answered with, the audit outcome line follows it, the adapter row records the observed sender_type (§21 item 3); ⑥ the sender honesty switch OFF by default (the body byte for byte), ON appends exactly one line naming the drafting agent said before and after, a USER draft never gets one, the per-adapter override beats the instance setting
  { name: 'test-channels-egress', tier: 'fast', why: 'in-process · 81 ms' }, // design §3.1 fence 1 (P1a): the EGRESS CENSUS — every host literal in a server-side file that constructs a request is a claim: a channel adapter's must be in its own EGRESS (both directions), any other (file, host) must be allowlisted WITH a reason (seeded at birth with gmail-sync + mounts), dead entries fail; the source list is ls-files through the sanitized env, SKIP with the tool's own words when the tree has no source list
  { name: 'test-channels-accounts-model', tier: 'fast', why: 'LAW credential · 26 ms — a linked account\'s sign-in is replaced only by a consent naming the SAME person: the PURE identity judge (src/channel-identity.js) + the pins that the engine\'s token door and rebind ask it and refuse on its answer (extracted from test-channels-accounts, B-f4cb)' },
  { name: 'test-oauth-loopback', tier: 'fast', why: 'in-process · 522 ms' }, // design §12.4: the DUAL-MODE consent flow — ephemeral (Gmail) and fixed (Lark) binds, the two gmail-sync `state` checks verbatim on the handler AND on paste-back, a PRE-BOUND fixed port ⇒ a NAMED port-busy refusal + paste-back (never an opaque EADDRINUSE), the port released on completion/cancel/timeout; every port under test is a FREE one
  { name: 'test-pricing-tiers', tier: 'fast', why: 'in-process · 613 ms' }, // reference prices per MODEL VERSION (Fable 5.1 cache hits $0.25 vs Fable 5 $1; Sonnet 5 $2/$10; Opus 5.5 $4/$20 hit $0.20 vs a measured result's own list cost; Mythos 5 / 5.1 on Fable's two tiers, never `_default`), longest-key match, old pricing.json gains keys without clobbering edits, the installed binary's catalog tiers as an oracle
  { name: 'test-pricing-openai', tier: 'fast', why: 'in-process · 61 ms' }, // every gpt-* price row judged against the DATED official OpenAI table (scripts/fixtures/openai-pricing.json) + the >272K whole-request rule, the dated gpt-5.6-sol cut, the closed row shape, the once-per-id unpriced-codex warning; planted-wrong-price control (2.369.203)
  { name: 'test-attach-rebuild', tier: 'fast', why: 'PURE · 179 ms' }, // first-attach history rebuild is time-sliced + gated (live records replay in order), heartbeat is stall-aware, kills are acknowledged + re-sent until acked
  { name: 'test-parked-ask', tier: 'fast', why: 'in-process · 650 ms' }, // A TURN PARKED ON A PERMISSION ASK IS NOT A DELIVERY STALL (lane parked-ask-stall, 2.369.229): the PURE stall verdict table, the ring's turn state on a restored session, the attach rebuild of a parked ask from the measured .buf shape, the REAL ChatView watchdog over 8 h of ticks + the parked typing line, 3 patched-copy controls
  { name: 'test-parked-ask-inbox', tier: 'fast', why: 'in-process · 101 ms' }, // A MAIN CONVERSATION'S OWN ASK UNANSWERED FOR A MINUTE IS A FOR-YOU ITEM (lane parked-ask-inbox, 2.369.232 — a fleet user's Bash ask sat 22 h on a hidden desktop): the PURE table src/main-ask.js (a row per kind, en/zh/ja = the locale files) + the producer census (every permission kind a normalizer writes has a row; a planted kind ⇒ RED); the REAL engine src/server/main-asks.js over the REAL claude normalizer + live gate (60 s ⇒ ONE item, answered at 30 s ⇒ none, answered / withdrawn / killed ⇒ resolved, a focused window still files), the restart (the rebuilt card at 40 s files at 60 s from the ask's instant; a renamed conversation keeps ONE item), AskUserQuestion + ExitPlanMode + a codex-shaped stub through the permission-op trigger; wiring pins; three patched-copy controls (filed twice, never resolved, a visible-window skip)
  { name: 'test-path-mounts', tier: 'fast', why: 'in-process · 99 ms' }, // /svc/<name>/ reverse proxy: real http+ws round trips + store rules
  { name: 'test-contributions', tier: 'fast', why: 'PURE · 168 ms' }, // commands + menus (when/group/order) + keybindings registry (Plugin Ph1): node-functional dispatch/ordering/filtering/dispatcher, the three migrated core menus ≡ verbatim legacy builders over a state matrix, ws-handler `default:` on the REAL handler (no sessionId in the reply), plugin-scoped removal, wiring pins
  { name: 'test-design-model', tier: 'fast', why: 'in-process · 0.3 s measured (the work-meter legs re-run the walkers under V8 block coverage)' }, // the Design window's PURE model (src/design-model.js, lane design-core): the manifest's keys / bounds / refusals by name, the layout + overlap warnings, one artboard's verdict, inlineAssets, the comment quote, the bundle round trip, the size verdicts; the walkers measured LINEAR by work (scripts/work-meter.mjs); 7 patched-copy controls
  { name: 'test-design-routes', tier: 'fast', why: 'in-process · 2.2 s measured (express on 127.0.0.1:0, the real engine / routes / published-pages / RemoteFs in a scratch dir, fake timers, a fake device link that runs the one remote command with sh, the CLI as a child node process)' }, // the Design window's hub (lane design-core): the registry + design-open openSpec push, the read (verdicts, inlined images, symlinks never followed, the caps), a remote folder = ONE command, THE WATCH on fake timers (refcount per socket, one file-changed per moved mtime, the notify rung), the comment (the exact belted line to THE typing sender, else the stash + the strip's words), publish (the real store, same URL, --page own only), the CLI end to end; 7 patched-copy controls
  { name: 'test-published-pages', tier: 'fast', why: 'in-process · 100 ms' }, // instance-hosted shareable HTML: publish/serve/auth-gate/CSP-sandbox/upsert + wiring pins
  { name: 'test-design-docs', tier: 'fast', why: 'in-process · 0.2 s measured (one git grep over the tracked tree)' }, // the Design window's TEACHING held to the code (lane design-docs-removal): the manual's example design.json validates, every KEYS key / note colour / print mode / bound / refusal code it names is the model's, every CLI verb + flag documented and none extra, the craft rules present, `vibespace-docs design` serves manual + rules through the real route, the tools-intro line under the 9600 B cap; the Claude CLI kit stays gone (a git grep census over the tracked tree, history excepted); planted-variant controls
  { name: 'test-design-window', tier: 'heavy', why: 'headless chrome + a throwaway server (git archive + the working tree, built there) + a stub claude running the shipped vibespace-design on command files + a stub opencode (a minimal ACP v1 agent): the Design window SEEN — opened by the agent\'s new, ONE frame repainted in place on a write right after the open (pan / zoom kept), a real pick → the exact line on the agent\'s stdin, the stash + the resumed strip + prompt-context after a kill, Print\'s sandboxed frame with print() witnessed inside it, Publish… keeping URL + visibility, /p/<id> under the CSP header + Fit + readBundle, zh at 375 px (44 px targets, the sheets), the opencode brief → the manual — and the ONE adversarial round: a hostile artboard (top.document / storage / forged picks / a key flood / window.open / a form POST / target=_top), the belt on peer text, 17 windows ⇒ 16 watches SAID, the 200-image + 24 MB caps by name, no spend (~150 s measured)' }, // lane design-chrome, L4 of docs/design-design-window.md §5 (2026-10-02)
  { name: 'test-doc-window', tier: 'heavy', why: 'server + chrome: a scratch copy of the tree with its own data/, a bundle build (public/doc-editor.js), the stub claude, headless chrome at 1280 and 390 px (~1 min)' }, // lane doc-window
  { name: 'test-usage-walk-parity', tier: 'fast', why: 'in-process · 403 ms' },
  { name: 'test-usage-origin', tier: 'fast', why: 'in-process · 58 ms' }, // who spent this: the ledger's origin dimension ('main' | 'subagent' | 'workflow'), the session×origin pivot behind the Usage window's session table, "By project" attributed to the PARENT repo instead of an agent's throwaway worktree, and the source census that the three columns / the By-origin group / the project tooltip are actually wired
  { name: 'test-proxy-post', tier: 'fast', why: 'in-process · 116 ms' }, // proxied POST body reaches the target (real unblocker; the json-parser-skips-/proxy/ pin)
  { name: 'test-auto-resume', tier: 'fast', why: 'in-process · 691 ms' }, // continue-after-limit-reset (tri-state gate, never-early/twice, restart-survival) + CLI output style at spawn
  { name: 'test-new-member-wake', tier: 'fast', why: 'in-process · 7.0 s' }, // a member that BECOMES usable (login success / human ⟳) re-drives the pool and releases the conversations armed on exhaustion: the 2026-09-08 incident replayed on the real engine + real pool + real symlinks + real auto-resume, each half of the wake proven load-bearing on its own, the polled routes' fingerprint gate measured with the engine floor wound back, and the breaker/cap/quarantine proven still in force
  { name: 'test-codex-subagents', tier: 'fast', why: 'in-process · 5.9 s' }, // B-7473 sub-agent visibility: the PURE row builder (labels/coalescing/XSS marker proof), the renderer + chat-view click-through/fold wiring, and GET /api/subagents over a temp CODEX_HOME with real parent+child rollout heads; ④ (2026-09-24) the v2 sub-agent classification on every rung — local listing, daemon snapshot child, the REAL ssh script under sh — against scripts/fixtures/codex-subagent-v2 + a generated 45-rollout store (every listed rollout classified past the 30 head-fact slots) + the sidebar's per-page kind filter and its remote-spanning tab census, with mutant-copy controls
  { name: 'test-window-anchor-heal', tier: 'fast', why: 'in-process · 105 ms' }, // inc-mu6djxxt-8166: a legacy pre-isolation anchor heals from the isolated panel, the ⟳ route falls to the panel when the guard archived the live reading, a hot-switched session's OTel never vetoes the witness ring
  { name: 'test-usage-probe-log', tier: 'fast', why: 'in-process · 125 ms' }, // the raw /usage probe ring (2.369.109): PURE clip/rotate/read + the panel rung through the REAL setupUsage with a fake claude (written / spawn-failed / no-buckets) + the control rung through the REAL engine (written / timeout / unparsed) + wiring pins
  { name: 'test-quota-source', tier: 'fast', why: 'in-process · 2.2 s' }, // harness S4: per-harness QuotaSignalSource (normalize/signalFromStream/probe/classifyAuthFailure on real shapes) + the caps-routed probe dispatcher (no claude spawn for codex identities) + wiring pins
  { name: 'test-server-globals', tier: 'fast', why: 'PURE · 467 ms' },
  { name: 'test-changelog-style', tier: 'fast', why: 'in-process · 260 ms (the three changelogs linted whole + parity + 20 controls + the real /api/changelog-diff over a fixture canonical)' }, // the user changelog's style gate: CHANGELOG.md / .zh.md / .ja.md lint clean whole (src/changelog-style.js — the rules of docs/changelog-style.md), the translations have the English structure, every version from 2.369.198 on heads a section in docs/changelog-engineering.md, the newest entry is package.json's or the next patch; planted copies RED by the rule they break, patched copies of the module without that rule let the plant through; the Update dialog's route serves each entry in the device's language or says it fell back to English
  { name: 'test-peer-messaging', tier: 'fast', why: 'in-process · 280 ms' },
  { name: 'test-notify-retry', tier: 'fast', why: 'in-process · 4 s' }, // lane notify-retry (2026-10-01): ONE 5-second attempt decided for ever — the primitive's phases / the loop-stall spurious timeout / transient classes over real stubs; the ladder's retry park with a stub registry (parked ⇒ delivered at turn end with ONE wake billed, dead pid ⇒ not-running, backoff bounds, a restart keeps it once, the hold's TTL re-judged, fail closed); the jobs bookkeeping + the words
  { name: 'test-park-step', tier: 'fast', why: 'PURE table + in-process engine · 8 s' }, // lane notify-retry verify r3: the park entry's lifecycle as ONE closed table (src/park-step.js, 9 states × 19 events), every event sequence ≤ 4 from every state under the invariants, the real park driven through every drivable cell and compared, four controls
  { name: 'test-plugin-loader', tier: 'fast', why: 'in-process · 295 ms' }, // Plugin Ph2: manifest validator matrix + a real fixture plugin (iframe assets w/ sandbox CSP, forked server process, proxied routes, agent-tool shim, enable/disable lifecycle) + client wiring pins
  { name: 'test-codex-p2-client', tier: 'fast', why: 'in-process · 354 ms' }, // codex P2 client rows: fork via thread/fork (real wrapper vs stub), onboarding per-backend readiness, switcher codex quota, permission-mode seeds
  { name: 'test-wrapper-files', tier: 'fast', why: 'in-process · 346 ms' },
  { name: 'test-ci-gate', tier: 'fast', why: 'LAW architecture · 5.6 s — the gate\'s own gate — the census, THIS rule, the block rule over real commits, the real hook end to end, the launcher once for real (§10, a stub repository)', allow: ['checkout'] },
  { name: 'test-usage-ledger-perf', tier: 'fast', why: 'in-process · 551 ms' }, // inc-mtox23xw: the estimator's per-pair ledger walk is O(log n + k) + interval-memoized (it blocked the loop 10-59s); parity vs brute force + timing pins
  { name: 'test-usage-index-parity', tier: 'fast', why: 'in-process · 2.3 s' }, // design 011 lane 3, the usage index SHADOW: the REAL worker on a scratch HOME answers the Usage window's aggregate exactly as memory (duplicate rids whose rows differ in account, a torn line, an empty shard, every dimension / filter / pivot, local hour + weekday, a St_Johns DST child, a remote harvest into an old month, a missed push, a repair rewrite); READ-YOUR-WRITES with a tail-only control worker; L0's cursor writer (write on change, dead keys only on proof)
  { name: 'test-usage-index-owner', tier: 'fast', why: 'in-process · 7.4 s' }, // …the owner: kill -9 mid-build / mid-push → parity from the shard marks; a deleted / newer / older / not-a-database usage.db rebuilt; a second opener refused by name; a deadline 503 that keeps the worker; SIGTERM bounded with a wedged worker (control: process.exit() joins it forever); SQLITE_FULL / no node:sqlite / a dead worker off by name; the ci.mjs index-dir sweep
  { name: 'test-plugin-security', tier: 'fast', why: 'in-process · 643 ms' }, // plugin-system security regressions (2.369.43): shim code-injection via manifest free text, capability-path collapsing, agent-tools consent gate, reinstall-under-a-trusted-id, proxied-reply headers, per-child stop mark, upload cleanup
  { name: 'test-local-device', tier: 'fast', why: 'in-process · 671 ms' },
  { name: 'test-pty-duck', tier: 'fast', why: 'in-process · 1.2 s' }, // B-ae4b: every node-pty duck holds a listener SET (daemon / R6 pipe / OpenCode serve terminal) — the liveness stamp AND the consumer through the real setupSessionPty, the one-slot census, the pre-fix control
  { name: 'test-agent-msg', tier: 'fast', why: 'in-process · 730 ms' }, // Channels v1: ACL matrix + delivery ladder + wiring pins
  { name: 'test-plugin-trust', tier: 'fast', why: 'in-process · 775 ms' }, // Plugin Ph4: validator (settings/themes/capabilities/module tier), consent 409 + trusted enable + drift re-prompt, module 403/200 + theme serving, node --permission denial vs granted path, install path/zip/Zip-Slip/update/uninstall-to-trash, shim shipping, client pins
  { name: 'test-builtin-plugins', tier: 'fast', why: 'in-process · 0.6 s' }, // lane dc-plugins (rv-server H3 + rv-client F9): one built-in plugin registry, no id dispatch — the contract refused by name at registration, a fake member registered through THE list (src/plugins/index.js, one line) drives every verb through the real unedited src/plugins.js, the relay surface by declared capability; CONTROL: the pre-fix id dispatch restored in start() ⇒ red
  { name: 'test-codex-history', tier: 'fast', why: 'in-process · 897 ms' }, // codex rollout coverage: custom_tool_call_output routing, sub-agent visibility, live contextWindow, encrypted reasoning, web_search_end cards (rollout-only searches, live twin dedup, 0.14x call pairing)
  { name: 'test-transcript-parity', tier: 'fast', why: 'in-process · 1.8 s' },
  { name: 'test-text-window', tier: 'fast', why: 'in-process · 490 ms' }, // perf lane A: the attach slab is a TEXT window (src/text-window.js) — the pure table (floor / maxRecords / maxBytes / determinism / isTextCard), the three normalizers' tailWindow twin parity, a real conversion's same-slab ids, and the wiring pins at every attach path
  { name: 'test-jsonl-incremental', tier: 'fast', why: 'in-process · 2.5 s' }, // perf lane C: the incremental JSONL tail cache (src/adapters/codex.js readJsonlTail + session-store's span entry) against a VERBATIM copy of the 2.369.160 reader — append reads only the appended bytes, the 34 MiB threshold slide, shrink/replace/rewrite ⇒ full, the unterminated line once, no read on an unchanged file, the async warm, SessionMessages cold = warm (+ the merge memo)
  { name: 'test-op-seq', tier: 'fast', why: 'PURE · 27 ms' }, // perf lane D: the per-session op ring (src/op-seq.js) — monotonic seq, cap + byte eviction, since inside ⇒ the exact frames / older ⇒ lagged with the oldest, reset on a new epoch, the laggedVerdict table, the resume rung, the verbatim replay splice
  { name: 'test-codex-protocol-drift', tier: 'fast', why: 'in-process · 1.0 s (five real-wrapper legs against a node stub app-server; no codex process starts)' }, // THE CODEX PROTOCOL DRIFT GATE (lane-codex-0159, 2026-09-30 — every codex reset credit failed with "Invalid request: missing field `idempotencyKey`"): the wrapper's request()/consumed-name census judged against every MEASURED table under scripts/fixtures/codex-app-server/ (scripts/measure-codex-protocol.mjs: the CLI's own JSON Schema launch-free + each method's answer to `{}` in an empty network namespace), the reset-credit outcomes handled, THE VERSION GATE (an installed codex-cli no table measured FAILS by name), the real wrapper on a table-driven stub (the press's key, the one same-key retry, the keyless mint) + the pre-fix wrapper as the control
  { name: 'test-effort-extras', tier: 'fast', why: 'PURE · 0.2 s' }, // lane effort-ultracode: the claude effort pickers = the CLI's parsed levels + the harness's declared extras (ultracode), appended never replaced; server gate on the parsed xhigh; the real app.js fetch block in a sandbox + a patched-copy control
  { name: 'test-codex-0153', tier: 'fast', why: 'in-process · 2.0 s' }, // codex 0.153.4 remainder (B-21e4): fork ordinal (Referenced-fork prefix cut, sub-agent start ordinal, wrapper forked_from echo) + the rows added below it
  { name: 'test-sysinfo-op', tier: 'fast', why: 'in-process · 1.9 s' },
  { name: 'test-opencode-serve', tier: 'fast', why: 'in-process · 4.1 s' }, // S9 OpenCode serve-mode store: mock serve (client, session→acp-events synthesis, discover cache/negative-cache/hang budget ≤2s, keeper reuse/spawn/crash-park/stop, serve-backed reader, caps verdict) + wiring pins
  { name: 'test-codex-zst', tier: 'fast', why: 'in-process · 5.1 s' }, // harness S3: descriptor store (discover/locate/forkChain/writerSweep/remoteFind) + codex facts off the hot path (worker walk, dir-mtime cache, /proc liveness) + zstd rollouts (readers, walker+scanner lockstep, NC/CO discovery lines)
  { name: 'test-instance-url', tier: 'fast', why: 'in-process · 6.6 s' }, // this instance's own public address: frp mapping layered over agentd.publicUrl (never written), one publisher of the relay proxy
  { name: 'test-chat-frame-guard', tier: 'fast', why: 'in-process · 7.7 s' }, // 38MB-poisoning trio: poison guard + frame-file bypass (real claude AND codex wrappers, loud rejections) + rescue + capability-only gate pins
  { name: 'test-discovery-spawn', tier: 'fast', why: 'in-process · 2.0 s' }, // ZERO spawns per session in the local sweep (userW's 11-17s loop block after every create/kill): the /proc process-tree reads + their no-/proc rungs, the census over 50 locks + 50 live sessions, and master's own session-store as the negative control (101 spawns)
  { name: 'test-roster-live-usage', tier: 'fast', why: 'in-process · 87 ms' }, // 2026-09-18 owner: the Agents roster repaints its usage cells from the 8 s poll (stamped cells + rosterUsageSnapshot + _repaintRosterUsage); the chrome proof is test-roster-reset-eta §1d. 2.369.189 (owner: "不如显示个钱的图标"): THE CREDITS CHIP — money icon + one word in en/zh/ja, the sentence in title + aria-label, patched in place by the poll (same node), none for a member not on credits; two patched-copy controls (state ignored / re-created wholesale)
  { name: 'test-roster-soon-rows', tier: 'fast', why: 'PURE · 59 ms' }, // 2026-09-18 owner: the two-soonest highlight never lands on the POOL row (it mirrors a member's countdown) — real markSoonRows over a fake list + the row-template pins
  { name: 'test-hidden-view-suspend', tier: 'fast', why: 'PURE · 105 ms' }, // inc-mu6bfv1t-4drq: mobile / tab / minimized hiders suspend the ChatView like the desktop one (reason set + WindowManager.syncHiddenViews + wiring pins); perf ⑤b: the reconnectSlot table + the reconnect queue (displayed now, suspended by slot, un-hide = now, dispose/drop dequeue)
  { name: 'test-chat-trim-guard', tier: 'fast', why: 'PURE · 9.0 s' }, // fold-dominated window trim guard (inc-mtajy6wr white-screen) pins
  { name: 'test-chat-e2e', tier: 'fast', why: 'EXCEPTION (owner decision 2026-09-07) · 30.2 s — the ONE real haiku turn through the full chat pipeline — the only proof in the battery that a real turn works (SKIPs without the oat)', allow: ['server', 'binary'] }, // ONE real haiku turn through the full chat pipeline (oat token slot; SKIPs without ~/.config/vibespace/ci-oat)
  // LAST ON PURPOSE (2026-09-09): the standing sweep for test-fixture litter in
  // the developer's REAL ~/.claude/projects. Within the fast tier this really
  // does run after every suite that could write one — the heavy tier is
  // detached, so a heavy-tier leak is caught by the NEXT push's fast tier. It
  // claims no port and creates no fixed /tmp path (scratch()), reads the real
  // home only, and prints the rule it applied.
  { name: 'test-fixture-isolation', tier: 'fast', why: 'in-process · 246 ms' },
  { name: 'test-prompt-budget', tier: 'fast', why: 'in-process · 103 ms' }, // the first prompt context's byte census (scripts/measure-prompt-context.mjs, printed): the tools intro ≤ 4 096 B, 4 notices + a 1 KB stash fit with ≥ 1 KB room, every dropped line in its manual

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
  { name: 'test-browser-live-ui', tier: 'heavy', why: 'headless chrome (a 3200×1100 page) on a worktree server with a fake claude + a fake agent-browser over fake stream upstreams, a real `vibespace-browser open`, and (when the box has a display rung) a real xterm desktop app under an agent lease — ~170 measured + shot states incl. ⑥ the split floor (real divider drags; ~3 min; SKIPs without chrome / dtach, the strip legs without a display rung)' }, // LANE I (2026-09-25, the owner: "你这些UI都检查过吗？"): THE LIVE-VIEW BAR, SEEN — a screenshot + rect census of the agent browser's live view (the owner's ephemeral path) at zh/ja/en × 600/900/1400 × dark/light × free/bound × Watch/Take over, two profiles (strip + backend chip), and the desktop-app strip (no lease / agent lease / your takeover): no overlapping paint rects, no wrapped label (> 1.7 × its font or > 1 line), every button's words fit, nothing outside the bar, no undefined/null/NaN/[object; THE FOLD re-derived by barLayout from the page's own inputs, the ⋯ exactly when folded (never gratuitous — an independent max-content measurement), its menu = the folded items with live counts; the chat WINDOW menu's "Agent browser — live view" (present with a browser, absent without; opens BOUND beside; open-or-focus; one Unsplit on a bound pane); controls = a neutral stylesheet swap stays green, patched copies of public/style.css without the bar rules (live bar + strip) or without nowrap alone (unfolded) go RED. ②b (the rebuilt switch dialog, 2026-09-27): the bar's browser name is a plain label and the agent's blocked banner offers Dismiss alone on this build, a button + "Switch to CloakBrowser…" once a broadcast names another browser, each opening the dialog, Dismiss removing the row for real; control (b) also strips the Take over / Hand back own-class size rules. PNG + JSON per state under /tmp/vibespace-live-ui-shots/run-<pid>-<time>/ (newest three kept)
  { name: 'test-browser-switcher-ui', tier: 'heavy', why: 'server + chrome: a scratch copy of the tree with its own data/, a bundle build, the switch dialog opened in en / zh / ja at 1280 and 360 px under DejaVu Sans over fixture views served through a fetch wrapper (33 s measured here)' }, // THE REBUILT BROWSER-SWITCH DIALOG, SEEN: 19 views (the real W1 view of a real profile, with and without a preselect, and every card state as a fixture the REAL src/browser-switch.js builds) × 3 languages × 2 widths — one text line per button / name / chip, no run wider than its box, no two text boxes intersecting, nothing clipped, no one-glyph column, no developer word, no Latin left in zh / ja beyond the names, ja never “ ”; the acts (Details kept open across a refresh, Dismiss's answer, a switch's overlay and both rollback toasts, the downgrade and download confirms with no request before the confirm, Settings opened on the CloakBrowser row, the Agent browser panel, the driven card with no button); controls: the old icon class swapped in (zh buttons stack), a bundle built with a patched model (the server's sentence reaches the card) turns the developer-word census red, the copies census. PNG + JSON per leg under <tmpdir>/vibespace-brsw-shots/run-<pid>-<time>/ (newest three kept; VIBESPACE_BRSW_SHOTS names another dir) 2026-09-28 (the naive-user round): `driven-listed` (the driver's session listed ⇒ "Hand it back to your agent" POSTs the handback from the dialog, the toast, the dialog kept and re-read, a refusal worded) and `needs-key-no-preset` (nothing configured ⇒ one sentence) in every language and width.
  { name: 'test-browser-replay-ui', tier: 'heavy', why: 'server + chrome: a scratch copy of the tree with its own data/ and HOME, TWO boots of it (a SIGTERM restart between them) with a stub claude under dtach and a fake agent-browser 0.38.1 on the server PATH, chrome-drawn JPEG fixtures, zh / ja / en at 1280 px and a 390 px phone under DejaVu Sans (40 s measured here)' }, // BROWSER SESSIONS, SEEN (2026-09-27, the owner: "在聊天界面和浏览器查看界面两个地方都能看到 session 的开始和结束，以及每个浏览器 session 的回放"): the start / end cards appear LIVE on the real keeper's attach / detach and come back after a real server restart (the rebuild derives them from the markers, seeded sessions included, in time order); the replay window from a card (sessions newest first, the actions, the after-frame with the click drawn within 3 px, → Home End ←, Before, Space one a second stopping at the last), a swept session's named state, Session properties' "Browser sessions (n)" and the panel's Replay…, a stopped browser's live view opening its Sessions list with "第 k 次会话" dividers, the rect census zh / ja / en, the phone (stacked, ≥ 44 px, a tap steps), no sessions / the trace off. PNG under /tmp/vibespace-lanes/browser-dialog/shots/replay/run-<pid>-<time>/ (newest three kept) 2026-09-28 (the naive-user round): the end card names why it ended and a 0-action one offers no Replay; the step words 上一步 / 下一步 / 第 1 / 6 步; ⑦b the oldest session's row scrolled into view on the phone, ⑦c a stopped browser's live view on the phone gives the Sessions list the width (+ in-page controls).
  { name: 'test-browser-profiles-ui', tier: 'heavy', why: 'server + chrome + binary: a scratch copy of the tree with its own data/ and HOME (a fake Chrome builds folder), one live stub-claude session under dtach, a fake agent-browser 0.38.1 (every call\'s launch view logged, /json/version = the last launch\'s build), headless chrome: New profile… → ONE POST → the row in place; Change build… under a holder → the relaunch card in its chat + the new build on every launching call; zh / ja; 390 px; and the REAL agent-browser over a scratch HOME whose browsers/ links the account\'s, a profile pinned to an older measured build answering it in /json/version (~40 s)' }, // LANE BROWSER-ADMIN (the owner: "不能手动创建profile" / "不能pin指定版本")
  { name: 'test-browser-who-ui', tier: 'heavy', why: 'server + chrome: a scratch copy of the tree with its own data/ and HOME, four live stub-claude sessions under dtach, a fake agent-browser 0.38.1 on the server PATH, two tabs under DejaVu Sans in zh / ja / en at 1280, 700 and 360 px (28 s measured here)' }, // "WHO CAN USE IT", SEEN (2026-09-27, the owner's zh report: a native dropdown, no Task Group, one choice): the row reads 我的所有会话 with NO <select> and 更改… is the house text button; a write while the panel's copy is HELD ⇒ the dialog draws the server's list (a fresh GET); "Fish" ⇒ the Task Group first; two groups by ↓ Enter, a session by the mouse, a chip × by the mouse ⇒ the "will lose it" sentence for the seeded lease; Save ⇒ ONE PATCH (session:<webui id> + base), the toast, the lease gone; a SECOND tab at 700 px keeps its unchanged chip AND cell as the same nodes and folds into 还有 2 个; the 409 re-open; the empty list refused in place with no request; remote / shell absent + the sentence; ja + en once; the rect census at 860 px (the row) and 360 px (the dialog: picker rows ≥ 40 px, chips ≥ 36 px, no sideways scroll). PNG per leg under <tmpdir>/vibespace-who-shots/run-<pid>-<time>/ ⑨ (2026-09-28, the naive-user round): both notes ("will lose it" + the empty-list refusal) on a 360 px phone in zh / ja / en — real lines, glyph drawn, sentence in its own span, fully on screen above the footer, no overlap; an in-page control puts the sentence back into the glyph's span and the judge fails it.
  { name: 'test-browser-live-fit', tier: 'heavy', why: 'headless chrome (a desktop client and a phone client) + a worktree server + the REAL agent-browser 0.38.1 headless through the keeper (~1.5 min)' }, // LANE S4 (naive study 2) + verify r1 (a desktop switch stops the vote and the page comes back — CONTROL: the view built without the hider observer keeps voting from the other desktop and the page is never restored; two split hosts on the phone ⇒ only the active one displayed, at the workspace top — CONTROL: the pre-fix rule displays both and pushes the active one to y = 844; the chip census under zh / ja with DejaVu Sans forced): the real rung — a split pane's picture IS the pane (frame = canvas ±2 px, no band in a pixel census; the page at its own size as the control), a resize re-fits; a phone 390×844 client: the live view auto-opens full screen on the first browse, the page renders at the phone's width, the Pricing link is drawn at its own size and a click on it lands, a pinch zooms in watch mode and a click maps through the zoom, the "Agent browser" chip stays inside the visible bar at rest and swiped to both ends (control: the chip unpinned is off-screen); a view whose frames stop after a navigation says "Waiting for a picture…" at 2 s and "No picture…" + Reconnect at 10 s, Reconnect brings the picture; a hash navigation gets a fresh frame from the bridge; two viewers at different sizes ⇒ the largest rules (the other letterboxes, its chip says so), the holder's pane rules while it drives; the agent's own `set viewport` is letterboxed until "Fit the page to the window"; the leg reaps its daemons
  { name: 'test-browser-live', tier: 'heavy', why: 'headless chrome + a worktree server + one REAL chromium (~60-90 s)' }, // AGENT BROWSER P2 (design-agent-browser-v2 §4.2/§4.4/§3.7): the PURE stream rules over the REAL captured 0.32.0 shapes (scripts/fixtures/browser-stream/session-0.32.0.json), the real bridge on a real http server over a fake upstream (cookie auth before the upgrade, fan-out on ONE upstream connection with replay, maxFps = the max across viewers, typed watch-mode refusals, per-viewer frame drop + upstream pause/resume at the VNC numbers, typed teardown), the browser-live window in headless chrome on a worktree server (frames drawn, URL/tabs panes, the switcher strip for two attachments, viewer count, the DPI pointer helper at ui-scale 1/0.8 and 375×667), and one real headless chromium through the real stream server + real bridge (SKIPs with evidence); lane H ③b: the shipped CLI's first `open` in a chat session with no attachment ⇒ within 5 s a split live view born beside the chat (silent), the navigation in data/browser-trace/ephemeral, the tool card's thumbnail, both chips, grey on stop / reconnect on the next verb, CONTROL a worktree keeper copy dropping the ephemeral holder row ⇒ none of it; ④ launches with its streamed config (the week-long exit-21 skip was the suite) and records a real `open`; naive study 2: ① one live view per session (liveViewPlan) + a stopped view's resume rule + the `~child:` target (patched-copy controls), ③b "Open live view" twice ⇒ ONE window and the focus in its chain, a stopped browser's view keeps its last frame with "Browser stopped" — CONTROL the pre-fix client rebuilt in the leg's own worktree ⇒ 3 windows and "Agent is driving"; lane J ⑤ (inc-muhgv0fb-9i4u): the REAL rung end to end — a session's own ephemeral browser (headless, and headed on its own 2560×1440 Xvfb) opened by the real vibespace-browser, the live view in chrome as the owner's client (DPR 2/1 × UI scale 100/125 % × a 1400×800 and a 700×900 window), Take over, a real click on grid cell (10,5) lands within 2 px; CONTROL = the pre-fix belief (the metadata IS the frame) in a patched copy through the same socket (71 px / 132 px or dropped); a new tab + set viewport re-read; the leg reaps its daemons
  { name: 'test-browser-hidden-paint', tier: 'heavy', why: 'the REAL keeper + routes + watch + live-view bridge + CLI on the hidden-window rung, two conversations on one browser, three 30 s idle freezes + a 60 s control (~4 min; SKIPs with evidence without the binary / Xvfb)' }, // lane browser-swiftshader-cpu-r2: the idle freeze proven end to end
  { name: 'test-browser-dialog-chrome', tier: 'heavy', why: 'the REAL keeper launches one headless profile browser + the real agent-browser (~40 s; SKIPs with evidence without the binary)' }, // LANE BROWSER-STUCK: a real beforeunload page through the real keeper + routes + CLI + dialog watch — ① `open` elsewhere returns [dialog_open] with THE sentence first within 1 s of Chrome's own javascriptDialogOpening (userW's signature on /json/list: the pending url over the old title), ② the next verb repeats it, ③ `dialog dismiss` keeps the page AND the typed draft, ④ `dialog accept` completes the navigation, ⑤ an alert is accepted and said once, the same through a conversation's own EPHEMERAL browser (rung D), ⑥ USERW'S SHAPE: the lease's daemon killed mid-hold — the watch answers the dialog a new daemon could neither see nor answer, the page answers again; CONTROL: a keeper copy whose launches hold nothing — 0.38.1 accepts the beforeunload silently (the draft gone) and the watch never mis-reports it
  { name: 'test-browser-passkey-chrome', tier: 'heavy', why: 'the REAL keeper launches one profile browser on the hidden-window rung + the real agent-browser 0.38.1 (~60 s; SKIPs by name without the binary or an Xvfb)' }, // LANE BROWSER-PASSKEY-CHROME (the heavy leg of lane browser-passkey, owner inc-muuvthv9-g69w): a real navigator.credentials.get on a localhost page — `start` heard (the binding works after the hook\'s delete), a verb in flight woken at 3 s + THE SENTENCE [passkey_open], the banner fact, ONE For-you item at 20 s, `passkey cancel` ⇒ AbortError in < 1 s and Chrome\'s own TAB-MODAL dialog gone off the Xvfb\'s pixels, runImmediately (same tab + a new tab), password untouched; CONTROLS: a CDP virtual authenticator ⇒ end ok, never passkey_open; a watch copy that never armed ⇒ unknown
  { name: 'test-browser-site-reset-chrome', tier: 'heavy', why: 'the REAL keeper launches headless browsers + the real agent-browser 0.38.1 through the real routes, watch and shipped CLI (3 min 7 s measured at verify r4, 74 rows — 81 s at the lane: a 25 s control and an orphan-tab leg each sit out the browser CLI\'s own timeout, a snapshot after `stop` waits out the cut verb\'s queue ~21 s, a real Chrome kill + heal, a 1 s self-refreshing dashboard judged over six reloads); SKIPs with evidence without the binary' }, // LANE SITE-RESET: a LOCAL fixture loop gated on a stale cookie (each page answered after 300 ms, moving on before its load — the measured incident shape) — ① `open` ⇒ [navigation_loop] in < 5 s with the cycle and the ways out; ② the next page-waiting verb repeats it at once, the fact carries it; ③ `screenshot` < 5 s, `stop` < 2 s, a snapshot after it answers, `tab close` < 2 s; ④ `site-reset 127.0.0.1` clears the cookie + local storage and the next `open` settles; ⑤ a shared profile: ONE proposal, the user's Approve clears exactly the frozen pair and tells the agent; CONTROL: a watch that judges no loop ⇒ the 25 s timeout
  { name: 'test-browser-display-chrome', tier: 'heavy', why: 'the REAL agent-browser 0.38.1 + the system Google Chrome launched through the real keeper, routes and shipped CLI (~8 s here; ⑤ the hidden-window rung: a private dir holding only an Xvfb symlink on the launch PATH ⇒ a windowed Chrome on the CLI\'s own Xvfb, UA Chrome/154 through the keeper — every other leg on a PATH farm without Xvfb ⇒ headless, UA HeadlessChrome/154; SKIPs with evidence without the binary / chrome; a private Xvfb via -displayfd for ③, SKIPped without one)' }, // LANE HEADLESS-FALLBACK (2026-09-28, the GDM-login-screen incident): under a scratch HOME carrying the owner\'s config shape (headed + --ozone-platform=wayland), no Wayland socket, no DISPLAY — ① a conversation\'s own browser: `open` WORKS, its Chrome runs --headless without the pin (keeper-marked), `get title` reads a loopback page on the SAME daemon + Chrome (the planned file reached the agent\'s command), told once, the user file byte-identical; ② a named profile with browser.headed=yes: HEADED=0 in its launch view, ONE headless Chrome on the profile dir, its CDP commands work; ③ a private Xvfb as DISPLAY under the Wayland pin: the pin becomes x11 and Chrome runs HEADED there; ④ CONTROL: the pre-fix keeper (a patched copy with no display fact) answers `open` launch_failed on the real binary, and the binary asked directly prints the measured "Failed to connect to Wayland display … The platform failed to initialize"
  { name: 'test-browser-mediation-chrome', tier: 'heavy', why: 'one REAL headless chrome behind the mediating proxy + the real agent-browser as two sessions (~50-75 s measured 2026-09-28; SKIPs with evidence without a chrome / the binary)' }, // AGENT BROWSER P6 (design-agent-browser-v2 §6.2 / §6.5 / D6 — the §10 P6 row's EXIT): through a second lease's mediated url a real Chrome shows only that lease's tab, attach/close/activate of the other's tab are target_out_of_scope, a takeover makes navigate/Input.* browser_paused while reads answer, Browser.close is method_refused, revoke closes the lease's own tabs and leaves the other's; then the real agent-browser 0.32 as two sessions — each `tab list` is its own, the typed browser_paused lands inside the CLI's own JSON, `close --all` never reaches Browser.close; r1 ③: the real binary answers `get --json cdp-url` and honours the AGENT_BROWSER_CDP twin when run directly (the controls for test-browser-verbs' router and env legs), and through vibespace-browser the same shell lands on the lease's browser with the twins dropped. r2 ③: the real binary is the ORACLE — every `get … cdp-url` spelling run for real with the router held to it (`get attr #e cdp-url` a read), another SOCKET_DIR is another daemon, through vibespace-browser the answer's root wins and the decoy dirs stay empty; the suite reaps its own daemon namespace dirs. r3: the installed binary's global flags re-measured against the router's tables; every measured flag fuzzed between `get` and `cdp-url` on a live daemon; the config-file twin (a bare command from a hostile directory runs its executable with its raw port, through vibespace-browser nothing of it lands); the suite's runs inherit no AGENT_BROWSER_* of the shell starting them. r4: a real chrome launched by the binary — bare, `open chrome://version` + `open file://…/DevToolsActivePort` and a crafted `state load` print/land on the endpoint (the controls); through vibespace-browser every spelling is refused with no /resolve; the stdin batch (bare plain lines are Invalid JSON, both forms run through the CLI). naive study 2 ④: the REAL keeper + the real 0.38.1 + a real Chrome — two sessions on ONE named profile both run on their own tabs with exactly one Chrome on its directory, the keeper's recorded pid alive after its own `get cdp-url` (the launch view), the stream port answered; CONTROL the pre-fix env (the directory) dies on SingletonLock on the real binary. verify r4 ⑥: the census vs the launched Chrome's OWN /json/protocol (a newer Chrome's extras print and fail), then input / view / page-mutation / read / session / harmless / unknown against a REAL paused lease with the raw endpoint as the oracle (no key landed, the page did not move, mutated with the switch off and not with it on; the unknown method forwarded to Chrome's own -32601 after the handback). lane-cdp-154 ⑥: compared AT the live version (censused ⇒ exact; newer ⇒ extras fail; older — the fleet's chromium 150 — below the census), every row-less method of THIS Chrome refused BY NAME on the paused lease, on 154+ the two new reads answer and Browser.addMockCamera / setGlobalPrivacyControl are method_refused with the agent driving (the camera counted from another tab, the raw endpoint's own mock camera the positive control); `--chrome <binary>` runs it on another Chrome; every line names the Chrome.
  { name: 'test-browser-share', tier: 'heavy', why: 'the ⑧ CloakBrowser rung runs only where VIBESPACE_TEST_CLOAK_PREFIX + VIBESPACE_TEST_CLOAK_CACHE name the measured build (else SKIP with evidence) · the REAL agent-browser 0.38.1 + a real headless Chrome through the real keeper, routes, live-view bridge and shipped vibespace-browser on a scratch instance (its own HOME / XDG / data, port 0, stub sessions) — what only the binary can answer: a second conversation joins the ONE Chrome on the profile directory (a process census), no SingletonLock; ~6 s measured here; SKIPs with evidence without the binary or a chrome' }, // OWNER RULING A (2026-09-26): ① conversation 1 `new work` + browses, the USER pins work for conversation 2 (rung D) ⇒ the SAME Chrome, each its own tab, both strips list work, the live view answered; ② one driver at a time — browser_busy naming "First chat" through the CLI, free when its turn ends; ③ the user takes over from conversation 2's live view (the real bridge) ⇒ 2 browser_paused, 1 browser_busy "the user"; handback frees it; ④ "Who can use it" is a LIST: [Task Group G, First chat] ⇒ conversation 2 opens work through its group, conversation 3 refused not_owner with the list sentence + the CLI's way-out line, the user adds 3, unbinding 2 from G refuses its next command AND closes its tab (Chrome's own page census), `profiles` prints the five `used by:` forms; ⑤ Rename, Delete… with two pins (the warning's count, both pins cleared, the Chrome stopped, the directory set aside); ⑥ the who-list migration's folded pin over a pre-list registry (CONTROL: refused before the fold; after: one real Chrome); ⑦ B-f7ab the LATE KEY — a session stripped of its key after create runs `vibespace-browser open <local url>` from a shell with no browser pairs ⇒ it browses ([browser_key_minted] once), the binding names that conversation, the fact + the live view name the browser
  { name: 'test-browser-human-ui', tier: 'heavy', why: 'the REAL agent-browser 0.38.1 + a real headless Chrome through the real keeper on a scratch server (its own HOME / XDG / data, port 0, vncEnv) and a headless chrome client — the panel button, the window, the address row and the recorded replay only a real page can answer; SKIPs with evidence without the binary or a chrome' }, // lane browser-resume C (b2): TABS on the REAL 0.38.1 through the shipped CLI — the agent lists only its own (his page counted, never named), `tab close` / `tab <his tab>` refused not_your_tab (his tab in Chrome's own list), tab new + close of its own, its current closed ⇒ the real tab_gone + this tool's way out, his window's row marks the agent's tab `other` with no control · BROWSE YOURSELF (B-6ae8): (a) Browse yourself from the panel row ⇒ his window drives (badge, address field), a local fixture URL typed and loaded, a click + typed text read back over CDP as the oracle; (b) a conversation on the same profile keeps working (its tab untouched, no pause card); (c) Close ⇒ his tab is gone from Chrome's own target list, the browser stays; Browse yourself again ⇒ join (the same Chrome pid); (d) his session in the Sessions list with Replay; (e) Quit ⇒ the confirm names the conversation, the browser stops; the end bar at 360 px in en / zh / ja (lane I's fold rule).
  { name: 'test-browser-tier3-chrome', tier: 'heavy', why: 'launches a REAL Google Chrome / Chromium window on its own Xvfb with NO CDP and drives it through AT-SPI (~20-40 s; SKIPs with evidence without a chrome / Xvfb / python3-gi / a session bus)' }, // AGENT BROWSER P10 — the §9 test-browser-tier3 row's heavy half: the browser is listed as a desktop-class row, snapshot comes from the real AT-SPI tree, one click @ref lands on a node that self-reports an action, a chord and a point click refuse by name although xdotool is on PATH, screenshot is x11grab of the window's own pixmap (§4.9 column 1), and the browser's argv carries NO automation flag before and after — the definition of tier 3 as an assertion
  { name: 'test-window-target', tier: 'heavy', why: 'server: boots the desktop-app keeper\'s REAL Xvfb + x11vnc + a GTK app and drives vibespace-window as a child process (~20-40 s; SKIPs with evidence without python3-gi / Xvfb / x11vnc / a session bus)' }, // AGENT BROWSER P9 second half (design-agent-browser-v2 §4.3 / §4.9 / §6.6, the §9 row): the sieve\'s strip (a refused KeyEvent cut out, the update request beside it relayed), the window noun in the shared takeover model, the PURE window-live mode arithmetic, the engine over a fake keeper (the lease PERSISTS across a rebuild, orphans, reconcile grace, takeover/handback/idle/viewer-left, the audit with origin), the ONE announcer taking a window handback, the bridge policy over a fake RFB server, then the REAL leg: an agent CLI drives the fixture through the API, a second session is refused by the lease, a viewer in Watch cannot type into it, the user\'s takeover pauses the agent and lets the same key land, the handback is announced, a restart keeps the lease
  { name: 'test-window-binding', tier: 'heavy', why: 'headless chrome (a desktop page + a 390×844 phone page) on a worktree server with a fake claude + a fake agent-browser over a fake stream upstream (~2-3 min; SKIPs without chrome / dtach)' }, // AGENT BROWSER P7 (design-agent-browser-v2 §4.6 / §3.7, D19 / D24 — the §10 P7 row's EXIT): auto-bind births the live view inside the chat's chain as a split (one visible window, two measured panes, the deterministic syncId, frames drawn, the ownership badge in the session's own colour), the bar's Unbind / Snap beside round trip, the divider under body zoom 1.25 landing within 4 px of the pointer + double-click, a real title-bar drag / minimise / restore / a desktop switch keeping the panes together, closing the browser pane collapsing to tabs WITHOUT moving the chat (rect before == after), the three-tab chain (D19 (a) replaces the non-anchor pane; closing the CHAT host promotes with no dangling id), layouts.json carrying layout + split, a PHONE page restoring the split in its model while displaying one pane and its own save leaving the split on disk and on the desktop, a remote same-tabs layout flip applied (the pre-fix key would not), a ratio-only change applied in place, a shared profile = two owner dots, a second profile = the strip with per-pane dots
  { name: 'test-toolbar-fold-ui', tier: 'heavy', why: 'headless chrome × 2 (this box\'s fonts, then fontconfig limited to DejaVu + Liberation + Noto CJK with DejaVu Sans forced — the runner\'s) on a worktree server with three shell sessions, two esbuild bundles (the real one, the control\'s no-op fold) — 132 census states (191 s measured 2026-09-30; SKIPs without chrome / dtach)' }, // LANE toolbar-fold, SEEN: zh / ja / en × 1024×768 / 1280×720 / 1366×768 / 1920×1080 × UI 1 / 1.25 × sidebar open / closed (+ toolbar scale 0.9 / 1.1 / 1.25) with every button a desktop machine shows: no two toolbar items' rects intersect, nothing passes the toolbar or lies under the sidebar, words whole on one line, a glyph named by its words (aria + tooltip), no sliver of the title, the page's verdict = barLadder(its inputs), the ⋯ iff folded, a glyph / a fold only when the full bar overflows (classes lifted for one synchronous measurement); the ⋯ at a hard-folded page (sidebar at 500 px, the tray widgets moved in) lists exactly the folded items in the bar's order in zh / en and each row does what its button did on a wide page (the file explorer, the web view, a terminal, the presets dialog, the maximize grid through the layout-presets submenu); Customize mode suspends the fold (everything full and shown, the bar wraps) and Done re-folds to the same verdict; the ARRANGED order is the fold's order (the widgets never fold, a hidden Terminal never counts, the ⋯ rows follow); CONTROLS: a neutral stylesheet swap stays green, the PRE-FIX toolbar (a no-op fold bundled + the old `.toolbar-right` rule) goes RED at ja 1024×768 UI 125 % sidebar open (overlaps, buttons under the sidebar); PNG + JSON per state under /tmp/vibespace-toolbar-fold-shots/
  { name: 'test-title-chips-ui', tier: 'heavy', why: 'headless chrome (a 1280×900 desktop page, booted four times: this box\'s face, DejaVu Sans forced, back, the control) on a worktree server with a fake claude and three chat sessions, two esbuild bundles (~34 s; SKIPs without chrome / dtach)' }, // 2.369.179 lane G, THE TITLE WINS on a real page: a pooled session in a 3-tab chain at 640 px with inbox chips — every tab title readable: ≥ 6 characters beside a compact chip (the rule\'s own guarantee), ≥ 5 beside an icon (the floor — the message names the label px and the platform face; a Range over the rendered text; measured 7 under Noto Sans, 6 under DejaVu Sans), every billing chip compact/icon, the hover tooltip and the chip's data-tip lead with "全部 → UCI Max", the click opens the switcher whose pool row names it; a 2-tab chain 1240 → 400 → 1240 px re-decided by the ResizeObserver alone (compact → icon → compact); one window at 1240 px full + the whole title, at 340 px the standalone bar yields; a member switch re-decides with the new short name; NEGATIVE CONTROL: a patched always-full title-chips.js bundled in place (scripts/mutant-copy.mjs) ⇒ every tab title ≤ 3 characters; legs 1–5 run AGAIN under 'DejaVu Sans' forced on html, body — the Actions runner\'s system-ui (this box resolves Noto Sans) — the labels proven drawn in it by CSS.getPlatformFontsForNode, every check prefixed [DejaVu Sans] (that pass SKIPs with a reason without the face)
  { name: 'test-session-title-ui', tier: 'heavy', why: 'headless chrome (a 1280×900 desktop page, booted seven times) on a worktree server restarted twice, with a fake claude (three sessions) and a fake codex, three esbuild bundles (~60 s; SKIPs without chrome / dtach)' }, // lane session-title-chrome, THE CLI NAMES THE CONVERSATION on a real page: session_title_changed renames the sidebar row, the window title and the taskbar live; reload / restart (meta) / meta deleted (transcript) keep it; a rename wins over a later title; codex never carries the rung; CONTROL = the ladder without its cliTitle rung; THE .228 MIRROR (mirror-green-228): the rename races the double-click's own attach answer (inbound held past the dialog's focus), CONTROL = the answer sites without the dialog guard
  { name: 'test-billing-badge-live', tier: 'heavy', why: 'headless chrome (a 1400×900 desktop page, reloaded once) on a worktree server with a fake claude behind the real chat- and pty-wrappers, a pool of two fake members, the engine\'s link writer driven in-process by a preload hook (~55 s; SKIPs without chrome / dtach / a built bundle)' }, // lane badge-stale (2026-09-30, the owner's title chip said Mat Max 30+ min after the pool moved the conversation to UCI Max): the engine's per-session switch (accounts.ensureSessionPoolLink, why per-session-switch) ⇒ the title chip names the new member on the SAME node within 10 s for a standalone chat, the pool DEFAULT move of a linkless one, a terminal, a tab-group guest (and its host tab), a split pane, a window restored by the layout replay after a reload, the Stage hero; QUIET: a merge that changes nothing keeps every chip node (≥ 3 merges + a frame); CONTROL: the pre-fix writer (scripts/mutant-copy.mjs, no notify) moves the link and the chip stays on the old member for 12 s while the page re-judges the stale frame (an attempt an unrelated frame reached is void, ≤ 3), then the fixed writer brings it over
  { name: 'test-browser-multiview', tier: 'heavy', why: 'headless chrome (a 1280×900 desktop page, then a 390×844 phone page) on a worktree server with a fake claude (four chat sessions), a fake agent-browser and four fake stream upstreams; real clicks, a real right-click and a real icon drag through CDP (~1.5 min; SKIPs without chrome / dtach)' }, // MULTIVIEW (docs/design-browser-multiview.zh.md §3 (b) + D3 / D5, lane P): two chats grouped as tabs each get a browser — the first born BESIDE its chat (one pane ⇒ chat | browser), the second a quiet PULSING tab on the browser side (the shown pair and the window unchanged, never a third pane); a REAL click on the other chat ⇒ the right FOLLOWS to its browser and back — ZERO relay reconnects (the live views keep their socket objects, no fake upstream sees a second connection); two chats ALREADY side by side ⇒ the new browser is a tab on its chat's side, nothing moves; a session's second browser grows its strip, a real right-click → Open in new window = a second Agent browser window with its own selection; fold back through the window menu (the main one selects that tab) and through the ONE drag exception (the icon dropped on the group folds back, never a chain of two views of one session); a reload restores the group (members, sides, pair) and both views reconnect and draw; the phone shows one pane and a switch there never follows
  { name: 'test-tab-close-confirm-ui', tier: 'heavy', why: 'chrome — headless chrome with a real mouse on a scratch copy of the tree (no git worktree): three File Explorer windows in a tab group, the frame ✕ / a tab ✕ / side by side / the taskbar group menu and the frame menu, a rebuilt pre-fix control bundle (25 s measured; SKIPs without chrome)' }, // B-a67c: a whole tab group closes only after the house question ("Close {n} tabs?" naming every tab, Esc / Cancel keep all, Enter closes all); a tab's own ✕ and a lone window never ask — the fast half is test-tab-close-confirm
  { name: 'test-split-close-resurrect', tier: 'heavy', why: 'chrome — headless chrome (two 1600×1000 desktop pages) on a worktree server with a fake claude and two chat sessions; real Ctrl+clicks, tab ✕ clicks and desktop-preview clicks through CDP (~1.5 min; SKIPs without chrome / dtach)' }, // inc-mukeyzpt-lpou (the owner, 2026-09-27: a side-by-side viewer opened by Ctrl+click, closed by its strip ✕, came back as a FREE window with its old id after two desktop switches): the owner's sequence twice with the bundle's timings (open beside → Two → One inside the switch gate → ✕ → Two → One) ⇒ no editor anywhere, no cached desktop record of it, the group [Alpha | Bravo] split, nothing on disk; CONTROL the pre-fix removeFromTabChain (no retirement) ⇒ the incident; the ECHO (a pre-close record from another socket 50 ms after the ✕) never re-creates it and the held close still reaches the disk (CONTROL the ledger neutered); a PARKED second page on Two drops its hidden copy when One's newer record arrives and writes nothing back (CONTROL no wire base)
  { name: 'test-split-restore-hidden', tier: 'heavy', why: 'headless chrome (a 1571×905 desktop page, a second desktop client) on a worktree server per leg (its own esbuild bundle) with a fake claude; real desktop-preview clicks and reloads through CDP, a 9 s hold per leg (~3.6 min — 216 s ×3 at lane split-restore-leg; SKIPs without chrome / dtach)' }, // lane split-restore-leg (userW inc-muundq37-cjay): the owner's steps — split on B, A→B, reload on A, →B — for files+files / a file viewer / a browser-live guest / a second client on B throughout / a guest 3 s late: side by side at the record's ratio, the record keeps split + ratio + sides; CONTROL a mutant-copy desktop-manager.js without _replayMissing's queueRecordChains ⇒ red, flat
  { name: 'test-window-reveal-desktop-ui', tier: 'heavy', why: 'headless chrome (a 1400×1000 page, a second desktop client, a 390×844 phone page) on a worktree server; zero vendor calls (~40 s; SKIPs without chrome)' }, // userW inc-muv3qfo7-96tm: the Outbox (the rail panel\'s real 发件箱 button), For you and Channels windows opened on desktop 1 and named again from a new desktop 2 ⇒ desktop 1 active, the window active + visible on screen; a second client stays on its own desktop; the phone; CONTROL (the door without a DesktopManager ⇒ the Outbox hidden on desktop 2)
  { name: 'test-split-ux', tier: 'heavy', why: 'headless chrome (a 1280×900 desktop page, a second desktop client, a 390×844 phone page, a 448×850 DPR 3 Android phone page) on a worktree server with a fake claude and three chat sessions; real title-bar drags through CDP (~2.5 min; SKIPs without chrome / dtach)' }, // inc-muiq348r-jwb5 (§13): a NAMED group host is revealed on the phone switcher / sidebar card / window list / palette / go-to, a press keeps the tab. SPLIT UX (docs/design-split-ux.zh.md §6 chunk 3, the owner's gestures 2026-09-23): G1 — a window dragged 409 px LEFT and released on the right half of a snapped window's title bar is MOVED to the pointer (±8 px), never split (and the §1 path inside the top band takes the snap the indicator promised); G2 — the drop at the workspace's left edge over that bar is the left snap (±2 px); a 1.5 s hold over another window's body never splits; the icon-stack merge (the one drag exception) pulses the strip's side-by-side button + a "Grouped as tabs · Show side by side" toast whose one click splits with the active tab LEFT, the strip in pane order, one glyph between the pane tabs, owner-colour underlines (computed); the badge's Unsplit / Swap (host ±1 px); Undo after an announced split (±2 px) and the stale-undo toast; the divider lit on hover + its right-click menu; a second desktop client following the split and a swap (the chainSyncKey rebuild, no echo revert); the phone one pane, no button / glyph, never flattening; command mode Ctrl+\\ v / V Split r1 (leg 11, a third session): the strip button re-labelled after a plain tab switch, the merge toast withdrawn by a split / speaking when stale, the menu's Beside keeping the focus. Split tabs v2 (leg 12, L1–L10) + v2 verify r1: L1b a 640 px host at 0.85 paints no tab under the window controls (the right column's floor, the margin tail, the badge stepping aside; control = the as-shipped columns + padding); L11 a real divider drag on client 2 across client 1's structural change survives, reaches client 1 + the disk in ONE send, no echo (control = the hold neutered: the as-shipped snap-back); L4a a pointer drag moves a SHOWN tab, the API keeps a hidden one hidden; L6 / L9 the active id follows the restore's re-key; L7b the merge-as-split toast's Unsplit keeps the drop slot (control = the plain Unsplit); L7c a drop onto an already-split chain offers Undo under both settings.
  { name: 'test-stage-dragout-ui', tier: 'heavy', why: 'headless chrome (a 1571×854 DPR 2.2 page at UI scale 90 %, the reporter\'s) on a scratch server with a fake claude and one chat session; real tab and title-bar drags through CDP, + § 6 four read-only chats on two more desktops (~1.9 min; SKIPs without chrome / dtach / a built bundle)' }, // § 6 inc-munl8jkl-gaih (userW, 2026-09-30): a conversation brought onto the Stage from another desktop is DRAWN — real clicks on the previews, go-to, a resume and a new session on the Stage; computed content-visibility, in-view messages rendered, the title-row click in the title bar, colours over a floor (STAGEDRAG_TREE=<2.369.198> is red on A/B/C/C3); verify r1: C4 the hero\'s OWN Resume keeps its home box (the slot is never carried), T1 the hero\'s tab torn off by a real drag ⇒ the promoted conversation hidden its way, not on Fin after the leave. inc-muly2izg-cks3 (userW, 2026-09-28: "在 Dynamic Desktop 里面用这个Browser，Browser 拖不出来" — the owner: the tab left the bar, then the window was gone): ⓪ THE RING REPLAYED — the live view auto-opened into the chat\'s group while the Stage was off, Stage round trips, the tab pressed at (1246, 104) and released at (795, 455), straight and with a hand\'s down-first pull ⇒ the window is VISIBLE (computed, on top, in view), the taskbar lists it, the ring\'s next press lands in it (2.369.196: an invisible window — the Stage\'s leave-time hide stayed on the guest); on the Stage the hero chat + its live view BORN beside it; the reporter\'s own pull from the ring (the live tab → the empty workspace, Δ −451/+351, more horizontal than vertical) TEARS the tab off as its own window — b970f16d kept it a strip reorder for the whole drag (split tabs v2 decided once on the first 8 px) — and it stays apart past the workspace record, a remote reconcile and a leave/enter trip; the same pull on a normal desktop (the cause is the tab drag, not the Stage); a sideways reorder wobbling within 30 px of the bar stays a reorder; tabs group / the hero\'s own tab / a 2×2 grid / a pull UP onto a preview; the refused desktop drag SPEAKS (the preview says it under the pointer, the drop toasts, the window menu\'s Move to Desktop holds the reason row)
  { name: 'test-browser-identity', tier: 'heavy', why: 'headless chrome (1280×900) on a worktree server with a fake claude (three chat sessions), a fake agent-browser, fake stream servers, a fake Chrome behind the REAL mediator; real clicks and real keys through CDP (~1 min; SKIPs without chrome / dtach)' }, // LANE S2 (naive-user study 2, 2026-09-26, T4/T5/T7): ONE answer to "which browser is this conversation using" — pinned work + Personal attached: the chip, its menu, Session Properties (open since before the pin, updated without a reopen), the card chip and the live view (title + the strip's "(in use)" tab) print the SAME line, amber, both names; work attached ⇒ all say "work" and the live view followed by itself; Session Properties: one line, the window's own buttons, Esc closes it. work RECREATED (delete refused `pinned` without unpin; with it the pin is cleared) ⇒ the open live view retargets to the new browser by itself, no red overlay; a view forced onto the old id shows the refusal and a REAL Reconnect click re-resolves it. A REAL Set aside of a PINNED profile: the dialog asks "1 conversation(s) use this profile — unpin them?", one click unpins; the chat's chip says "gone was deleted — its pin was cleared", its Session Properties carry no raw bp- id, no dangling pin. The New Session dialog lists every profile (a shared one too) and follows the registry while open (the pick survives). A SHARED (mediated) profile, a REAL Take over and REAL keys: dispatched ⇒ the key reaches the fake Chrome through the mediator while the user drives and is receipted; dropped ⇒ "Input is not reaching the browser" + "not delivered — …" within ~1.5 s, cleared by the next delivered key
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
  { name: 'test-helm-render', tier: 'heavy', reads: ['deploy/helm/vibespace-user/'], why: 'binary: helm template (read-only, offline — a real external program, so HEAVY by the tier rule) · 0.9 s' }, // lane cluster-presets P2: the chart's company-presets volume over four value shapes (a release with the blocks / an override / no block = inherit / the legacy single client), presets.volume=false byte-identical to the 2.369.199 chart (history permitting), the pod template independent of the preset values (an override change never rolls the pod); 3 chart-copy controls (subPath, a required source, an env beside the volume); SKIPs loudly without helm
  { name: 'test-node-bootstrap', tier: 'heavy', reads: ['scripts/vibespace-agentd-install.sh'], why: 'adopted 2026-09-07, was in NO runner (226ms) — server' }, // Node-free pairing: the installer's node RESOLUTION + PROVISIONING contract (2.246.0). Hermetic — a local HTTP fixture stands in for nodejs.org/dist, so
  { name: 'test-gmail-sync', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (324ms)' }, // Offline e2e for the Gmail sync engine (2.134.0): a mock Gmail API served on 127.0.0.1 + a patched API base exercises seed sync, filename shape (RFC2047
  { name: 'test-mux', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (425ms) — server' }, // Unit test for src/agentd/mux.js — framing round-trip, chan-0 JSON control, byte-channel data, and CREDIT flow control (a fat transfer must not starve a
  { name: 'test-ssh-key-dialog', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (650ms) — chrome' },
  { name: 'test-ssh-key', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (757ms)' },
  { name: 'test-device-secret-quota', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (794ms) — server' }, // place-secret + quota-refresh device ops (2.298.0, design §Account split / §Quota refresh origin) against a REAL daemon. The quota op's VENDOR call is deliberately…
  { name: 'test-agentd-socks', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (903ms) — server' }, // On-demand EGRESS through a device (task #164): the daemon serves a SOCKS5 proxy on its loopback, the server reaches it via tcpForward, and a real SOCKS5 client…
  { name: 'test-agentd-bigread', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (910ms) — server' }, // Big-transfer integrity over the device plane (2.187.0). The mux control channel is credit-EXEMPT, so fs-done / stream-exit could OVERTAKE data still queued behind…
  { name: 'test-agentd-transfer', tier: 'heavy', why: 'a REAL device agent built from this tree + 300 MiB of scratch files on /tmp (4.1 s measured) — lane exit-transfer: a 100 MiB pull and push through the agent\'s own fs ops, sha256 both ends, the file held by the hub ≤ two windows (bytes in minus bytes on disk at every read + two hoarding controls), a lying end, an abort and a dropped link remove the part, /dev/zero, a growing file, 0 bytes, overwrite, a stale part, and a child_process census: no spawn during any transfer — server' }, // design 013 B: agents move ONE file between machines without a shell
  { name: 'test-device-agent-setup', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (953ms) — server' }, // deviceAgentSetup primitives over a REAL dialed-in daemon (graduation B.3): the ws-handler dial branch ships agent tools + the 0600 token via fsWrite, registers the…
  { name: 'test-agentd-devicemount', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (1221ms) — server' }, // device-folder-mount CHAIN acceptance (2.150.0): the daemon serves a folder over WEBDAV on 127.0.0.1 (serve-folder), the server reaches it through the mux via…
  { name: 'test-transcript-worker', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (1268ms)' }, // Transcript worker contract + main-thread-block regression (2.235.0, the userL degradation follow-up). Generates a >34MB JSONL (forces the bounded tail path + line…
  { name: 'test-machine-probes', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (1270ms) — server' }, // R1 — machine fact probes, one implementation for every machine (docs/design-three-tier.md `probe.*`). The same facts existed three ways: the local backend-status…
  { name: 'test-attach-ack', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (1788ms) — server' }, // attach-ack proof-of-life contract (2.234.1, userL mass false-death incident): EVERY ws attach — real, sub-, or nonexistent id — must get a synchronous attach-ack…
  { name: 'test-login-expiry', tier: 'heavy', why: 'chrome — the fast tier never launches a browser (1934ms here; a browser leg\'s cost follows machine load)' }, // a subscription's LOGIN SESSION has its own absolute deadline: pure reading (incl. the CLI-wiped shape), pool gates (dead ⇒ never usable, near ⇒ never a switch target), the once-per-threshold inbox ladder on a fake clock (restart-survival + re-login reset), the STRING every blocked/inbox surface prints (a login is never a spent quota bucket; a wiped file is never "expired" at a future date), wiring pins
  { name: 'test-agentd', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (3068ms) — server' }, // M0 e2e for vibespace-agentd (docs/design-remote-cs.md "= the local config"). Builds the daemon bundle into a temp install root, then via DeviceManager:
  { name: 'test-agentd-tunnel', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (3417ms) — server' }, // REVERSE-FORWARD (tunnel) acceptance (2.148.0, "互挂云盘去公网化"): the daemon binds 127.0.0.1:<port> ON THE DEVICE and pushes every accepted connection back over the mux to…
  { name: 'test-remote-lasterror', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (3724ms)' }, // meta.remote.lastError contract (2.228.1, the userL "host reconnecting (9) with no reason" report): when the remote transport child dies, the wrapper must record the…
  { name: 'test-agentd-dial', tier: 'heavy', why: 'server — REAL daemons: ~70 s (lane-pairing: + a wrong host, a wrong token then the right one against the REAL dial gate, the dial-status op + a no-capability control bundle, a 120-byte root on a short socket rung read by the hub; verify-r1 C1/C3 a never-converging pinned daemon twice (real + a no-flag mutant), B9 two real daemons on one pairing (real, a no-boot-id copy refused all the same — verify-r2 B9-r2a — and the same copy under a patched r1-rule server as the control), B8-r2 a rotation cuts the holder + the new device admitted (+ a no-lockout control copy): ~110 s in all)' }, // Transport B e2e (dial-out, M4-lite): a daemon behind "NAT" dials OUT to the server over websocket (hand-rolled zero-dep client in the bundle); the server speaks the…
  { name: 'test-dial-token-sinks', tier: 'heavy', why: 'server + REAL daemons — 4.3 s measured (verify-r3 THE DIAL-TOKEN DOOR CENSUS at runtime — the in-place push through place-secret; the tokens the real routes mint are SENTINELS looked for in the argv of every process on the machine (sampled every 40 ms), the hub\'s journal, every ws broadcast, every file under the hub\'s data/ and the device\'s root, the dial-status answers and a refusal frame — through the pairing button, a device started the installer\'s way, Generate + the in-place push, and graduate-dial over a FAKE ssh on the server\'s PATH that runs the installer\'s own argument parsing; B-grad: no token in the ssh argv, the arguments on stdin)' },
  { name: 'test-device-install-check', tier: 'heavy', why: 'server + bash — 23.1 s measured (verify-r3 B-inst r2: the environment form\'s re-exec shape keeps dial.json + dials back in, CONTROL (o) an unguarded daemon run from a patched source copy writes token \'\'; verify-r3 B-inst: a recording node shim + a 40 ms /proc sampler through a real install — the flags shape still installs with no token in any child argv, the environment shape: none in any process\'s argv, the daemon\'s environment clean, the files 0600; the manual `VIBESPACE_DIAL_TOKEN=… --dial` form; CONTROL (n) an installer copy with r2\'s children, +10 s): the REAL bundle\'s --dial-check exit codes 0/10/11/12/13/14 against a scratch server on the REAL dial gate, a plain http server and a closed port; the installer with a wrong token / a bad scheme / a typo host writes nothing (file census + a recording systemctl stub), --no-check writes, the right token installs and dials in' }, // lane-pairing ⑤ (B-7007): the installer checks the dial address with the daemon's own dial BEFORE it writes anything
  { name: 'test-pair-dialog-ui', tier: 'heavy', why: 'chrome + a worktree server + a REAL daemon — the pairing dialog: open mints nothing, the address rows, the custom verdict, Create / Generate mint once each on the chosen base, ten re-opens mint nothing, a retired-token daemon ⇒ the row + the Machines card say refused (token mismatch) in zh and en, the rect census at 860 / 360 px; verify-r4: a real daemon behind a Host-rewriting relay (F1), a new pairing under a taken name (F6), a Windows browser + a Linux device (F7 + a bundle control), the offline sheet\'s Generate sentence (F8 + a bundle control); verify-r5: a device dialing an address VibeSpace did not offer ⇒ the claim words (C1), two windows pairing one name ⇒ 409 + the replaced command says so (A1), the name the device gets (A2), a case-only twin ⇒ 409 (A3) · ~85 s measured' }, // lane-pairing ①②③ (B-7007)
  { name: 'test-exit-access-ui', tier: 'heavy', why: 'chrome + a worktree server + a REAL paired daemon + three stub conversations — "Who can use <machine>?": the dialog drawn on a fresh GET while the row is held stale, a Task Group by keyboard + a conversation by mouse + ask ⇒ ONE PATCH with the base, the second page\'s row, the 409 re-draw, the empty list in place, the For-you Allow / Deny, the device\'s run + the chat card, the real CLI, 403 / 401, the rect census at 860 / 360 px; verify-r4: the whole command verbatim in the row and the For-you window (F4 + a markdown bundle control), no typed Reply on an exit ask (F5); lane-exit-run-output ⑤: the card\'s output block (stderr\'s lines in mono + 显示输出 toggled IN PLACE on the same card), the machine\'s 最近的命令… list drawn from a fresh GET with keyed rows patched live off the exit-audit broadcast (an opened row stays the same node), the platform on the row and the Machines card, the REAL CLI\'s `runs` · ~89 s measured' }, // lane-pairing ⑥ (B-7007)
  { name: 'test-exit-runs-dialog-fit-ui', tier: 'heavy', why: 'chrome + a worktree server — the machine\'s Commands list (the REAL painter over a stubbed GET: a 658-char PowerShell -EncodedCommand row with a 40-line stdout of 200-char lines, a stderr row, a pull and a push) at 390 / 768 / 1280 px in zh and en: the rect census (nothing past the body\'s client width, the body inside the dialog, the dialog inside the viewport, the intro line whole), every pre wraps or scrolls itself (the Wrap toggle off), the row grid stacking below ~560 px, a transfer\'s "<0.1 s" on its outcome line, the 2.369.207 CSS control red · ~55 s measured' }, // lane exit-runs-dialog-fit (2.369.209)
  { name: 'test-incident', tier: 'heavy', reads: ['src/incident.js'], why: 'adopted 2026-09-07, was in NO runner (4056ms) — chrome' }, // Incident-capture contract smoke (2.238.0): POST /api/incident writes a bundle with client rings + server state, append attaches a follow-up, /api/incidents lists…
  { name: 'test-workflow-usage-tailer', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (4571ms)' }, // Workflow usage tailer (2.270.0) — the race regression test: the launch ack precedes the run dir's creation by ~17ms in real runs, so the tailer MUST arm on a dir…
  { name: 'test-agentd-remote', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (4624ms) — server' }, // M2 e2e: the agentd protocol over the SSH STDIO BRIDGE + persistent pipe-sessions (docs/design-remote-cs.md M2). The "remote" is localhost over a real `ssh` process…
  { name: 'test-cwd-recreate', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (4897ms) — server' },
  { name: 'test-port-forward', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (5242ms) — server' }, // Unit test for PortForwardManager (B-0b60 tunnel path): detect() parsing + end-to-end piping through a MOCK device (tcpForward → a real loopback echo server standing…
  { name: 'test-usage-events-push', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (5276ms) — server' }, // usage-events PUSH stream (R4 finale) against a REAL daemon: transcript growth → walker child → batched chan-0 push → server ack commits the device-side cursor…
  { name: 'test-usage-scan-op', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (5940ms) — cli' }, // R4 step 1 — the daemon's `usage-scan` op, end to end against a REAL daemon (docs/design-three-tier.md `usage.scan`). WHAT IT PINS: (1) the op's events match the…
  { name: 'test-sidebar-scroll', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (6336ms) — chrome' }, // Sidebar lazy-folder scroll preservation (2.228.3, recurring user report: "scroll down, click a card's expand arrow → the list jumps back to the top"). Mechanism…
  { name: 'test-terminal-zoom-select', tier: 'heavy', why: 'headless chrome: real xterm from node_modules under body zoom 1.25/0.8, CDP mouse drags — the un-fixed page selects row 20×scale, the counter-zoomed page selects row 20 (~6s)' }, // 2.369.118, userW inc-mu92zsgw-6c9y
  { name: 'test-window-drag-ui', tier: 'heavy', why: 'headless chrome at 1600×900 on a worktree server (own data/) with a real Xtigervnc Desktop, a fake agent-browser live view (dtach fake claude), the REAL xpra rung (xterm) and a Web view iframe on a 2×3 grid: real CDP drops / resizes released over each pane, the PDF viewer shrunk over its own frame at uiScale 90 % × DPR 2.2, the base commit\'s window.js as the control (~4 min; legs SKIP without their binaries)' }, // lane-drag-release
  { name: 'test-desktop-move', tier: 'heavy', why: 'chrome — headless chrome at 1571×905 on a worktree server with its own data/ (layouts installed through the restore path), real CDP title-bar drags, a right-click menu, a shell session (resume placement, SKIPs without dtach), two raw sockets forging layout-syncs, a second chrome for the two-page legs G/H/J/K/L (258 s measured 2026-09-30; SKIPs without chrome); verify r3: + leg N (a click-to-focus vs another page\'s move of that window, two pages; + ~25 s); verify r4: + leg O (a command-mode snap and a □ maximize under another client\'s cooldown, two pages + a raw socket; 346 s measured 2026-09-30)' }, // inc-mun7qjmw-iksh (userW, 2026-09-29): moving a window onto a desktop the page has not opened keeps that desktop\'s windows — A the incident\'s gesture (Fin 1 + HR 3, boot on Fin, a title-bar drop on HR\'s preview): the preview draws 4, the page\'s OUTGOING layout-sync carries HR with 4 (CDP webSocketFrameSent), the server\'s HR = 4 before any switch, HR shows 4 after a click, after an autosave and after a reload, the rollback points read HR 3 → 4 / Fin 1 → 0 and none HR shrinking; B the visited-first control; C the window menu Move to Desktop ▸ HR (real right-click, hover, click); D resume placement (a shell session placed on HR replacing its old never-opened entry: 3 + the new one); E THE SERVER BELT: a forged shrinking sync ⇒ layout-sync-refused WITH the kept record, nothing written or broadcast, the journal names it; CONTROL the same shrink with a close per window is accepted; F the 2.369.198 cache rebuild re-installed on the live page ⇒ the belt refuses, the page reconciles (4 shown, a toast), the server\'s HR never below 3; verify r1 (a SECOND chrome): G page B holds a drag on HR while page A moves a window there — B keeps it on its save, shows it, A keeps it, no refusal, then B moves it back under A\'s eyes and A shows it (a remote move applied as a move); H B\'s socket cut while A opens a window on HR — B reconnects, re-reads, keeps A\'s window; E+ a window one socket added is refused as another socket\'s ONE unexplained drop (`arrived`)
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
  { name: 'test-boot-reload-ready', tier: 'heavy', why: 'chrome — one worktree server restarted three times with a slow boot on purpose + headless chrome + one esbuild of a patched bundle (~56 s here)' }, // B-0ece: a page opened mid-boot says "VibeSpace is starting…" and loads by itself once /api/boot is ready; ⚙ → Update reloads only after the new server is ready (self-update answered by CDP Fetch, a REAL restart onto VIBESPACE_TEST_BOOT_HOLD_MS); a /api/layouts that never answers climbs the ladder into the reason + Reload and one boot-stuck event; a pre-fix bundle control goes red
  { name: 'test-update-dialog', tier: 'heavy', why: 'chrome — the fast tier never launches a browser (11.5 s here: one worktree server + headless chrome, five legs; SKIPs without chrome)' }, // ⚙ → Update VibeSpace… seen: the changelog in the device's language (zh / en at 1280 px and 390 px touch, ja at 1280 px) over a fixture canonical built from the real CHANGELOG files (VIBESPACE_CHANGELOG_FIXTURE_DIR — never the network) — `v<version> — <date>`, sections as small headings, bullets as DOM lists with the file's counts, an untranslated entry in English (lang="en"), an old-format entry as paragraphs, never a <pre>, the dialog fits a phone; screenshots in the suite's shots dir
  { name: 'test-taskbar-group-ui', tier: 'heavy', why: 'chrome with a real mouse on a worktree server — three File Explorer windows, a tab group, CDP mouse / pen / touch / keys, two rebuilt control bundles, two reloads, one leg at CPU ×20 (~90 s; SKIPs without chrome)' }, // A GROUPED TASKBAR BUTTON end to end (lane K): (a) click behind ⇒ the group's active tab focused + raised, no chooser even when the pointer rests; (b) click in front ⇒ the pinned chooser above the button, a row switches the tab, Esc / a click elsewhere close it; (c) hover ≥ the intent on the PAGE clock ⇒ the non-modal chooser (focus untouched), across the gap onto a lit row, gone after the leave grace (pixels in its box change), a 150 ms cross-over never opens; (d) a real title-bar drag over the button never opens; (e) touch taps: activate, then the chooser; (f) Enter / ArrowUp / ArrowDown / Esc; (g) the single button unchanged (click focuses, again minimizes); (h) right-click = the window menu; (j) verify r1: 30 hover open/leave cycles with no click leave the document's mousedown / keydown listener counts unchanged; (k) a rebuild under an open chooser re-anchors it (aria-expanded, Esc focus, a click on the rebuilt button keeps the SAME chooser); (l) a pen hovers — attributed to its own TYPED enter (scripts/pen-hover-judge.mjs), Chrome's post-open mouse re-target waited for, the pre-fix last-enter slot red on the same record; (l2) the same at CPU ×20; (o) a rebuild under a RESTING pointer (after a click / an Esc-dismissed hover) grows nothing, a return after a rebuild-window leave still hovers; (m) right-click on a chooser row = that tab's window menu, the chooser pinned beneath, its Close closes THAT tab; (n) a reload shows a restored group as ONE grouped button with no input; CONTROL: the scratch bundle rebuilt with the old always-chooser click ⇒ (a) red; CONTROL 2: the r1 disposer + the four low fixes reverted ⇒ (j) +30, (k) focus on body, (l) no open, (m) no menu, (n) SSS, (o) a chooser under the clicked pointer (hoverStep's enter row reverted)
  { name: 'test-ui-scale', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (24s) — chrome' }, // UI scale (DPI) + UI font scale + locked-model-badge restyle smoke (2.257.0). - locked badge: SVG lock in currentColor on the accent pill (no more orange
  { name: 'test-remote-keeper', tier: 'heavy', reads: ['data/bin/vibespace-remote-keeper'], why: 'adopted 2026-09-07, was in NO runner (27s) — server' }, // E2E test for data/bin/vibespace-remote-keeper — the remote-side persistence layer for remote chat sessions (2.124.0). Simulates the local chat-wrapper's
  { name: 'test-codex-p2-wrapper', tier: 'heavy', why: 'slow (28s)' }, // codex P2 wrapper: queue-while-busy, slash commands + real compact, live MCP/web/image/compaction records — real wrapper vs stub app-server
  { name: 'test-opencode-plugin', tier: 'heavy', why: 'chrome — the fast tier never launches a browser (29s here; a browser leg\'s cost follows machine load)' }, // the OpenCode background service is a PLUGIN, default OFF (owner 2026-09-07): fresh instance spawns nothing, enable/replay/disable over HTTP on a real server, env override, and the first-use dialog in headless chrome (asked once, Enable resumes the pending action)
  { name: 'test-acp-harness', tier: 'heavy', why: 'slow, binary (33s)' }, // S8 generic ACP v1 harness: the REAL acp-wrapper against a mock ACP agent (initialize → session/new → prompt → tool_call → request_permission → cancel → load) + normalizer shapes + stdout consumer + wiring pins
  { name: 'test-toolbar-resize', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (36s) — chrome' }, // Toolbar-resize persistence smoke (2.252.1 — the 2.250.1 snap-back rootfix). The bug: cssDefault()/def read the COMPUTED --toolbar-height, which the drag
  { name: 'test-writer-sweep', tier: 'heavy', why: 'slow, binary (40s)' }, // ONE writer sweep, any machine (CS separation, 2.276.0). Before this, the sweep existed three times — ssh, dial, and NOT AT ALL for local — so a local resume of a…
  { name: 'test-chat-paging', tier: 'heavy', why: 'chrome — three fixtures incl. the 48 MB huge compact-mode one (§1c, inc-mubvu3a4-x8sb) driven by real CDP wheel gestures on the fix AND on a pre-fix control copy (two bundle builds, two worktree servers; ~4-5 min)' }, // Chat virtual-scroll paging stability (2026-07-30 user report: "翻页过程中会 往上跳一大截，往回翻也会意外跳跃"). Drives a REAL view-only ChatView over a synthetic 700-record transcript… §4b the fold-dominated window (2.369.129); §4c/§4d the huge compact-mode session: the per-gesture rules of scripts/paging-gesture-rules.mjs (no jump back > 1.5 viewports · no pin / bottom landing before the window reaches the tail · blank ≤ 25 % · the ring never empty after a page) + the pre-fix control that must reproduce the incident
  { name: 'test-chat-send-landing', tier: 'heavy', why: 'chrome + one live chat session (real chat-wrapper, stub claude) over a 40 MB §1c transcript, four times (the fix and three scratch copies with one fix reverted each)' }, // B-172e (inc-mt1zrvj3-wsr4): a send from a window paged out of the tail, from a teleported seek slab, and across an in-flight extend lands on the sent message — real wheel + typed Enter; each control fails its own row
  { name: 'test-slack-relay', tier: 'heavy', why: 'headless chrome over the static relay page (~6 s; SKIPs without chrome)' }, // lane slack-workspace-app (design 018): docs/slack-relay/ as it ships — the relay rule equal to slack-manifest.js over one table, back to a private instance with the query verbatim, the code shown otherwise, a CDP no-network census
  { name: 'test-raw-filename-chrome', tier: 'heavy', why: 'chrome + a worktree server (~16 s; SKIPs without chrome)' }, // lane raw-filename (userW "从vibespace预览里下载文件，文件名都叫raw"): an image and a PDF, each under an ASCII and a CJK name, opened in the REAL viewer — the <img> draws / the PDF <iframe> loads and opening it starts NO download (inline); Chrome's fetch of the element's own /api/file/raw URL reads filename*; Chrome SAVES that URL (an <a download>, the download manager's naming path) under the file's own name (Browser.downloadWillBegin.suggestedFilename) and the bytes land on disk under it; CONTROLS in the same browser via CDP Fetch at the response stage: the header stripped ⇒ Chrome names it raw.png / raw.pdf (what userW saw), the header turned into attachment ⇒ opening the PDF preview starts a download; ⑤ (r2) the code editor's REAL ⇩ button in an editor opened locally and on host box opens /api/download with &host=box (red on the pre-r2 line)
  { name: 'test-artifacts-chrome', tier: 'heavy', why: 'chrome + a worktree server + a stub claude (48 s measured in int232\'s heavy; SKIPs without chrome)' }, // lane artifacts-model: Write ⇒ one card + the chip + auto-open beside the chat; Edit ⇒ the same element patched in place; setting off ⇒ card only, one click opens; a reload shows the same cards; int232 ⑧: an open Artifacts window survives a reload at its position (real clicks + a title-bar drag ⇒ the autosave; the boot restore replays it)
  { name: 'test-artifacts-handover-ui', tier: 'heavy', why: 'chrome + a worktree server + three stub claude chats running the REAL vibespace-msg / vibespace-design CLIs (~25 s; SKIPs without chrome)' }, // lane artifacts-handover-chrome: a Task's sidechain Write ⇒ the lead's card "By subagent"; a helper's send --artifact ⇒ the lead's hand-over cards + Artifacts rows + the Design window opening + "via <helper>" on the Design home; refusals by name; zh 390 px rect census
  { name: 'test-viewer-download-chrome', tier: 'heavy', why: 'chrome + a worktree server (~40 s; SKIPs without chrome)' }, // lane viewer-download: a .docx / .png / .md editor each Download into a CDP scratch dir (name + identical bytes), the title-bar menu row once, the dirty-editor toast, a 390 px phone reach
  { name: 'test-docx-viewer', tier: 'heavy', why: 'chrome + a worktree server, rebooted once for ⑫ (~64 s; SKIPs without chrome)' }, // THE WORD VIEWER, SEEN (lane docx-viewer; ⑫ "Open in LibreOffice" — the door + the spied launch route, then the absent-machine offer, both machines a scratch LibreOffice): scripts/fixtures/docx/ (python-docx, deterministic, committed) opened in headless chrome — no band above the first page and no page left of the pane (light AND dark), white paper, the document's own run/heading colours never the theme's, pgSz widths at 100%, the title page's different-first-page header and the INHERITED running head on pages 2–4, footer, footnote, table borders, the PNG, the running head's tab stop at the right margin (also at UI scale 125 %), the text order = mammoth's (the oracle); Fit width / 100% / − / + / Ctrl+wheel as the model says, the browser never zooms, remembered across a reload; hostile.docx (the tag as text, javascript:/data: hrefs gone, the web link in a new tab, #bookmark scrolls, the altChunk in a sandbox="" iframe, the style's CSS injection contained; innerHTML negative control); .doc / OLE / garbage refused by name, the .doc before any raw fetch; the embedded font through document.fonts and gone on close; 80 pages: Rendering… then 1 / 80, the count following the scroll to 80 / 80, render time + long tasks printed; the owner's 817 px × DPR 1.75 shape; CONTROLS with the untouched library's UMD build in the same page (altChunk script runs, <body> restyled, no running head on page 2, the tab stop misplaced under a transform, @font-face dropped in a shadow root)
  { name: 'test-browser-live-input', tier: 'heavy', why: 'chrome + a scratch server + the REAL agent-browser 0.38.1 and its chromium 151 (named, own and mediated browsers; builder r2: the shared browser driven on the real fence — its plain chip, fitted again at the handback) + a patched control tree with its bundle rebuilt + lane takeover-keyboard ⑥ (the userW split layout; its own patched world) · 60–75 s (SKIPs without the installed chromium / agent-browser ≥ 0.37 / dtach / a viewer chrome)' }, // LANE LIVE-INPUT, THE TRUSTED LEGS: ① the agent's own Chromium — the 3-unit key-text cap re-measured, the chunker typing 300 seeded texts exactly into a real textarea (the pre-fix one-record paste refused as control), the copy watch on a real page (paragraph, input after Ctrl+A, cut, password gives nothing, same-origin frame, navigation, the page never sees the binding); ② the viewer = headless Chrome on the machine's NON-loopback address (no secure context, no navigator.clipboard) with TRUSTED CDP input, per kind (a named profile = the owner's direct lease, the conversation's own browser, a MEDIATED profile): a real click keeps the keyboard sink, Ctrl+V and ⌘V (the Mac's paste command) of 11 units / CJK + emoji / a 12-line tabbed text, a real composition from keyCode 229 committing 12 characters with no lone Enter keyup, a double click and a drag selecting, Ctrl+C / Ctrl+A+Ctrl+X to the viewer's clipboard, every receipt delivered; THE COPY-OUT DOOR (verify): a hostile page firing synthetic copies on a timer leaves the clipboard untouched with nothing pressed and after one click (the click's copy = the chip), on a non-secure AND a secure viewer; the journal (no "already holds" per command, no query string in the handback line, ONE record start when video is switched on during agent commands); ③ a Mac viewer: ⌘A/C/X/Z/⇧Z; ④ the fit chip's words where the size comes from + its click making the page follow that window (shots in en + zh with LIVE_INPUT_SHOTS); ⑤ CONTROLS on a patched tree: the pre-fix record, every keyup forwarded, a drag without its button, no ⌘ table, both halves of the copy-out door removed (the hostile page's text IS written after one click) — each red; ⑥ lane takeover-keyboard (userW inc-mum339id-1zsb): the chat + its live view in ONE split group at 2327×1229, UI scale 0.9, real presses + keys — a press on the composer keeps the caret there and the typing (the page untouched, the takeover on, the agent refused browser_paused, both words said, Enter sends to the agent's stdin), a press on the picture takes the keys back, THE PASSWORD GUARD (a script's focus reclaimed, "tomsmith" to the page), a real xterm yields on its screen's press; CONTROL: the pre-fix verdict on a patched world ⇒ "pghello agent" in the page (userW's report); a viewer page is ENDED (Target.closeTarget), never left loaded — the door leg's secure viewer left loaded had turned ④'s words into "another device" (also on master)
  { name: 'test-ax-budget', tier: 'heavy', why: 'chrome — CDP accessibility tree over a scratch server (one chrome, two bundle builds — the fix and the neutered-band control — on the §1c fixture; ~75 s)' }, // THE ACCESSIBILITY-TREE MEASUREMENT LEG (docs/design-accessibility-tree.zh.md §3 row 0 lean / §4; 2.369.144's 50,150-node root cause): Accessibility.enable → getFullAXTree, TOTAL + NON-IGNORED per scope (list / window / minimap / sidebar) joined by backendNodeId; ① positive control ② OQ1 — aria-hidden on the list must drop ≥ 80 % of its non-ignored subtree, whether TOTAL falls too is the PRINTED verdict that decides the band's attribute ③ the growth over four page-ups (printed with its cause — the trim's keep zone filling inside the band) ④ THE READER'S BAND on a teleport + two 2,000-line gap slabs: the band census on its own edge, the GROWTH INVARIANT (a second slab moves NON-IGNORED ≤ 10 %), the per-window pin at measured ×1.25, ①b/④e the minimap strip ≤ 10 with an in-page control ⑤ the setting's two meanings (false = the list, true = the band re-derived on the flip) ⑥ NEGATIVE CONTROL: the band neutered at source in a scratch copy (second bundle build) must GROW > 30 % and expose every far card ⑦ FOCUS: a focus landing in a band-hidden card (.focus() and Shift+Tab from after the list) exposes it in the focus event's own task — the attribute read in-task and Chrome's "Blocked aria-hidden" warning count, the handler blocked in-page as the control
  { name: 'test-collab-live-counter', tier: 'heavy', why: 'chrome — the fast tier never launches a browser (53s here; a browser leg\'s cost follows machine load)' }, // the live sub-agent traffic readout (2026-09-07): the PURE composers (counts/pluralisation/age granularity/live vs frozen) + the normalizer's per-row record timestamps, then headless chrome — a REAL codex rollout opened read-only (frozen totals, nothing ticking, no encrypted blob in the DOM) and a LIVE codex chat session behind a stub app-server (head grows, age ticks, spinner switches and yields, everything freezes at turn end)
  { name: 'test-client-boot', tier: 'heavy', always: true, why: 'chrome — the fast tier never launches a browser (70s here; a browser leg\'s cost follows machine load)' }, // headless-chrome app boot (the FRONTEND face of 打不开; SKIPs without chrome)
  { name: 'test-pid-identity', tier: 'fast', why: 'in-process · 0.2 s' }, // B-1cc6 a pid is never an identity: src/proc-identity.js's verdict table over a fixture /proc (same / recycled / gone / zombie / rebooted / no starttime / no /proc), report-once, a bare-pid mutant RED, a real sleep with a wrong-starttime record never signalled. The census itself is test-architecture §85.
  { name: 'test-jobs-engine', tier: 'heavy', why: 'slow (71s)' }, // Background Work ENGINE gate (real spawns in an isolated tmp dataDir — never the repo's production data/). Pins: spawn→adopt-by-stamp across engine generations…
  { name: 'test-mobile-select', tier: 'heavy', why: 'chrome + a worktree server at 390×844 DPR 3 (Android UA, touch emulation) + a 1280×800 desktop page; Chrome\'s own touch gesture provider for the native long press (~46 s measured 2026-10-02; SKIPs without chrome)' }, // lane mobile-select: a long press on chat text is the platform\'s selection (no synthetic or trusted menu, nothing over the word), the message menu from the … button (never over the words) and from the chrome (strip / Thinking toggle / role label — ONE build, the platform\'s selection held off), Copy text = the whole message + a toast naming its lines, an open menu closes when a selection starts outside it, the live user-select census, desktop right-click unchanged; verify r1: code-first / table-first shapes (the … the element under its own centre, nothing narrowed beside it), the same census in BUBBLE mode, a 1024 px touch tablet (hover buttons hidden, the … tap opens the menu)
  { name: 'test-mobile-gaps', tier: 'heavy', why: 'chrome + a worktree server at 390×844 with a mobile UA + touch emulation, real long-press touch sequences, a real dtach shell (~50 s measured 2026-09-30, was ~60 s; SKIPs without chrome)' }, // docs/design-mobile-gaps.md top-10 + measured defects: every lifted touch target ≥36px, the nav For-you sheet, the "+" long-press sheet, the explorer single column / Select mode, the status-bar search, the phone's billing chip following the pool member (lane billing-chip: a stub active-sessions frame through the page's own socket ⇒ member A → B on the same chip node, DOM text + a screenshot), the message menu from the … button (hover buttons gone), the switcher "+" / long-press menus, the minimize guard, the terminal key row + Copy screen, the System/Ports/Channels windows, the wrapped settings nav
  { name: 'test-helper-ask-ui', tier: 'heavy', why: 'chrome + a worktree server (restarted twice) + a stub claude behind the real chat-wrapper speaking the measured 2.1.281 helper-ask shapes (~45 s; SKIPs without chrome / dtach)' }, // LANE S1 on a real page: the helper's permission card under its Agent card in the parent chat AND in its LIVE View Log window, the waiting chip naming the helpers and jumping to the oldest, Allow in the View Log answering the PARENT's stdin with the helper's request id (the stub resumes the helper), a server SIGKILL + restart keeping the pending card (reloaded page), Always Allow on the parent card, a foreground + a background helper stopped mid-ask (withdrawn words, "stopped" chip, "Stopped before it finished"), CONTROL: the pre-lane normalizer in the scratch worktree — chip, no card, no button
  { name: 'test-reattach-stagger-ui', tier: 'heavy', why: 'chrome + two worktree servers (one restarted 12×, a pre-fix control build restarted 6× — the bundle rebuilt with esbuild) + a stub claude behind the real chat-wrapper (~5 min; SKIPs without chrome / dtach)' }, // B-63f1 ② on a real page: a page NOT reloaded across a server SIGKILL + restart, the view's jitter seam pinned to its MAXIMUM (500 ms) and the probe typed BY THE PAGE at its own `attached` frame — provably inside the window (the frame log stamps both, ping at +1–4 ms); 12 runs: the probe's records on screen at +8 s, ids unique, list = total = DOM, the seq watermark = the last frame applied; every other run injects a real-shaped `lagged` frame 200 ms into the window (a second attached of the same rebuild supersedes — still whole); CONTROL: the pre-fix chat-view (the _onOp hold removed) loses the probe in its runs while its watermark claims the lost frames (the measured 9/12 class)
  { name: 'test-new-session-dialog', tier: 'heavy', why: 'chrome + a worktree server + a stub claude behind the real chat-wrapper asking permissions like the CLI (~15 s; SKIPs without chrome / dtach)' }, // LANE L on a real page: the New Session dialog never carries the name, Escape with an open picker / the cwd suggestion list closes only that list (a text-field Escape as the control; A2b the constructed shape where the page gets the key), the permission modes as words + the raw value (en + zh); the spawned CLI's own argv carries --settings permissions.allow (claude.allowAgentTools off ⇒ none, the control); the browser card's face + "Open <url>", Always Allow sending the WIDENED rule as `updatedPermissions`, the hovered Allow staying green (hovered Deny as the control), one real click answering a card, the close --all scope on a Bash card that also runs pgrep, and `git status` as the unwidened control. Measured red on the pre-fix build: 22 finding legs, every control green.
  { name: 'test-inbox-reply-ui', tier: 'heavy', why: 'chrome + a worktree server + a stub claude behind the real chat-wrapper answering real turns (~45 s; SKIPs without chrome)' }, // design-user-inbox-reply chunk 2: the For-you reply on a real page — hostile title/option/detail render as text (+ an innerHTML negative control), the running dot idle→running→idle through the active-sessions broadcast with no row rebuilt, a reply typed + Enter reaches the stub's stdin quoted and resolves the row in place, a stopped session's button disabled with the verdict's sentence, a half-typed box survives a broadcast (same node, text, focus), an option chip sends its label, the phone sheet's reply controls ≥36 px and Esc folds the box before the sheet; chunk 3: the title-bar mini inbox — per-window badge counts (a stopped view-only window its own, notices never), the popover lists exactly that session's rows and replies through the typing path, Escape layering, the badge on the tab in a chain, a hostile session name as text, a key-filter-less patched copy as the isolation control
  { name: 'test-inbox-window-ui', tier: 'heavy', why: 'chrome + a worktree server + a stub claude behind the real chat-wrapper (~20 s; SKIPs without chrome)' }, // design-user-inbox-reply §9 (the For-you WINDOW) on a real page: the popup row's ⤢ opens the window ON that item with its FULL 3 000-char detail readable (never cut, scrolls inside the pane) while the popup's row stays cut; hostile title/detail/option/session name render as TEXT (+ an innerHTML control); Mark done moves the selection to the next open item, the resolved row stays in place dimmed; a reply typed + Enter reaches the stub's stdin quoted and resolves the row; the mini inbox's ⤢ lists only its session; a second page replays the window from its openSpec; 480 px = one pane + ‹ back; ⚙ Communication ▸ For you… opens it; a half-typed reply survives a broadcast (same node, text, focus); keyboard ↑/↓ · Enter · Esc; the verify round ⑬–⑲ (2026-09-27): the wire's 300-char preview of a resolved item + GET /api/user-todos/:id whole (403 for an agent token, 404), a resolved ~6 000-char item loaded whole on select through ONE GET, THE READER'S OPEN TEXT KEPT WHOLE with zero fetches when another client resolves it, the resolved tail's head closing with a tail row selected, the scoped empty hint + no scope button for an account-level notice, javascript:/data:/vbscript: links never surviving, the REAL vibespace-ask's cut at 8 000 / 500 said by name and 7 999 whole
  { name: 'test-record-clear-ui', tier: 'heavy', why: 'chrome + a worktree server seeded in the five stores\' own shapes (34 s here; SKIPs without chrome)' }, // "Clear content…" on a real page with REAL right-clicks: the Task Group log window (a row → the ONE confirm dialog naming time + first words → the sentence in its place, TASK.md follows; the batch: Find → Select… → Select all shown → Clear selected, a hostile note as TEXT), the For-you popup + window, Session Properties' history, the Background Work panel, an agent group's window; a second client patched LIVE (zh: its focused Find box the same node) and a third (ja) in place; the zh / ja words; the rect census (desktop + 390 px phone); no native dialog; an innerHTML negative control; verify r2: every surface's VISIBLE door pressed for real (the For-you pane's button, a status row's ⋯, an expanded job's button, a group message's hover ⋯), a detail-only Find match opened + the dialog's "Found in the detail" line, a batch ending Select mode, a cleared row with no checkbox / ⋯ / menu, zh day / time cells, a withheld job log said, a refusal worded by its code, a 250-entry batch in parts
  { name: 'test-record-clear-client', tier: 'heavy', why: 'chrome × 2 browser contexts + a worktree server + its own esbuild bundle + two V8 heap snapshots + a real socket drop per clear (~85 s; SKIPs without chrome)' }, // "Clear content…" THE CLIENT-SIDE CENSUS, SEEN (lane-redact verify r5): a sentinel in each of the five stores (a status history entry that is not the current status, a job with a pending ask), every surface open on client 1 (en) and replayed on client 2 (zh, its own device storage) — the task log, the task detail with its title field FOCUSED (the typing guard), the For-you popup + window + the item's arrival toast, Session Properties with a select FOCUSED, the sidebar card expanded on its history, the Background Work window with the card expanded, the Job input window, the Channels window, the group window; the owner clears one kind at a time (the status history entry last, after an earlier status broadcast — the normal page); then the DOM (text, attributes, input values, shadow roots), localStorage, sessionStorage, IndexedDB, CacheStorage, window.name, the URL, the tab title, both clients' JS HEAPS (a V8 snapshot after a full GC — a word counts only if the product reaches it, never through Chrome's layout cache of a detached element), data/layouts.json and an incident captured after the clear; every surface PROVED to carry the word before; verify r6 THE ORDER CLASS: every clear races STALE ANSWERS on client 1 (a real socket drop — every reconnect resync —, the re-rendering windows, the group window re-opened; each five-store GET started before the clear held in the page and handed over newest first after it) with a CURRENT status carrying the word; CONTROL: a bundle whose Job input window listens to its own id only and whose Session Properties paints any history fill goes RED on exactly those surfaces (title + taskbar, the history), the layout file stays wordless, the heap judge sees it
  { name: 'test-record-clear-walk', tier: 'heavy', why: 'a worktree server + a stub chat CLI + a real job (33 s)' }, // "Clear content…" THE RUNTIME SENTINEL WALK (verify r3): every record of the five stores seeded with its OWN word, a real chat session on a stub CLI (vsst_, a conversation id, a group member, bound to two Task Groups), a real Background Work job (jbt_), the owner's cookie (sign-in ON), `claude` hidden from PATH, a ws client capturing every frame — §1 every census reader PROVED to carry its record's word before the clear (44 probes: cookie + vsst_ + jbt_ routes, the three injections, the five CLIs + the generated vibespace-status, TASK.md, the held stash, the spill, groups.json); §2 the owner's door under every token kind (no cookie / vsmt_ / vsst_ alone ⇒ 401; cookie + vsst_ or jbt_ ⇒ 403 agent_forbidden; a form POST / a text/plain body ⇒ 400; 201 ⇒ too_many; an id from another store's namespace ⇒ 404 and nothing touched) and the agent's reach (its own entry / item ✓, another session's / the owner's / a producer's / another member's ✗, a job token ✗); §3 the owner clears everything + the brief's cases (a reply typed after the clear quotes the sentence, resolve by the old text finds nothing, a job's already-resolved For-you item is cleared by the cascade, a message cleared before the next turn reports as the sentence, a refused wake was never stashed, an export after the clear re-imports cleared, a second clear takes a later announce's words, a covered run stopped by force keeps no last line); §4 every probe clean, every frame clean, the stub's stdin clean, the server journal ids only, on disk ONLY the two declared append-only holders; §5 a shadow-copy snapshot as the control
  { name: 'test-channel-jump', tier: 'heavy', why: 'chrome + a worktree server + a stub claude behind the real chat-wrapper running the shipped vibespace-channels (33 s here; SKIPs without chrome or dtach)' }, // FROM THE CHAT TO THE CONVERSATION (§26, B-099e): one call reads three fake conversations + drafts a reply ⇒ its card shows three keyed rows, the drafted first; a real row click opens THAT window; the chip names the last conversation and its menu lists three (drafted first); the window header says "Drafted by <session>" and a real click reveals the chat; a hostile compose subject (`<img onerror>` + a `<system-reminder>` tag) renders as text in the row + the chip (+ an innerHTML control); an agent bearer on both owner reads is 403; SIGKILL + restart + a fresh page ⇒ both cards' rows replayed from the persisted session meta, the chip re-derived; ⑨ (the stash made visible) a rejected draft's receipt waits for the idle agent ⇒ the strip above the composer + the card's "1 waiting", a real Hand over now click refused BY NAME (the stub has no inbox), the next prompt-context injection clears both
  { name: 'test-browser-propose-chrome', tier: 'heavy', why: 'chrome + a worktree server + a stub claude behind the real chat-wrapper running the shipped vibespace-browser over the REAL agent-browser 0.38.1 (27 s here); the Approve-to-CloakBrowser legs run only where VIBESPACE_TEST_CLOAK_PREFIX + VIBESPACE_TEST_CLOAK_CACHE name the measured build (else the Reject path, nothing downloaded); SKIPs without chrome or dtach' }, // lane browser-propose (2026-09-30, the owner: the agent proposes the switch, the user approves with one click): the agent opens a LOCAL page that reads like Google's sign-in refusal (signin.test → 127.0.0.1 by host-resolver-rules; never the real site) — its beacon reads navigator.webdriver = false (step 1 in the production shape) — and files `blocked --tier 2`; ONE card at the claim's position saying what Approve runs, ONE For-you item; the phone (390 px): fits, Approve / Reject ≥ 44 px, lines wrap; an agent bearer 403; a REAL click on Approve ⇒ the product's own install over the linked measured build (nothing downloaded), ONLY signin.test on the cloak site list (VIBESPACE_TEST_EGRESS_MAP maps the reserved .test host to loopback for the egress proxy), a new CloakBrowser profile pinned + leased, the CloakBrowser Chrome on its directory under the proxy with its seed, the page reopened there (its beacon from Chrome 146 through the proxy), the card done in place, the item answered; the agent's next prompt-context carries the approved words and the chat draws that card
  { name: 'test-group-report-card', tier: 'heavy', why: 'chrome + a worktree server + two stub claudes behind the real chat-wrapper, each with a CLI inbox and its own hook call, a SIGKILL restart (~60 s; SKIPs without chrome or dtach)' }, // A GROUP MESSAGE IS SEEN WHERE IT WAS HANDED OVER (lane group-report-card, the owner 2026-09-28: "怎么在那个对话里看不到你发了消息？"): alpha sends beta a message without --wake ⇒ the strip above beta\'s composer names it with NO hand-over button + the card\'s "1 waiting"; the owner types to beta ⇒ beta\'s hook answer carries the report and ONE card "alpha → <group>" sits under the owner\'s message, before the reply; a real click on the group opens its window; a --wake draws the same card ("woke this agent"), the next message no second; SIGKILL + restart + a fresh page ⇒ both cards once each, in place (the ring placed by time, the wake\'s transcript record upgraded), never the raw report
  { name: 'test-jobs-panel', tier: 'heavy', why: 'chrome + a worktree server seeded with the neutral triage fixture (~60s; SKIPs without chrome)' }, // Background Work TRIAGE panel (design §13) at 1200×800 (rail) AND 375×667 (window): the badge counts only awaiting + unacknowledged failures, a group holding an unacked failure is expanded by default while a done-only group is collapsed, a collapse persists across a reload (user-state jobsPanelFolds), a failed row shows its last line, the summary names the held notifications, the "Archived · N" row fetches only on click
  { name: 'test-desktop-app-keeper', tier: 'heavy', why: 'launches a real X server + x11vnc + an app per leg, SIGKILLs a keeper process and re-adopts, waits out an idle timeout and a CPU-burner runaway (~40s); SKIPs with its reason when Xvfb/x11vnc are absent' }, // docs/design-desktop-apps §6 row 3: launch → port listens → RFB handshake → record on disk → SIGKILL + rebuild ⇒ adopted → stop clean (/proc census equal, no orphan X); the ws bridge (auth 401 / 404 / an unknown kind 501 / rfb AND xpra relayed / bytes + input reports / the window-live policy PER PACKET on xpra) + §12 the real xpra rung (incl. a crashed xpra's Xvfb reaped, keeper up and keeper down) + §13 the fit belt's fork counts and the WM-frame leg (VIBESPACE_TEST_WM_DIR) + §14/§15/§16 a Watch viewer on the real xpra (lifecycle cut; the keymap and display-size fences + their takeover replay, "abc" typed into a real xterm, the holder's display size standing) + §13 (b2) the rfb twin on the real Xvnc; routes incl. a host with no access layer refused 503 host_unavailable (lane C2; v1's 400 retired) + §18 B-bfe6 a browser's OWN profile (0700, argv, removed at stop / app-exit / boot, kept on request, refusals by name, a no-retire control)
  { name: 'test-desktop-app-window', tier: 'heavy', why: 'chrome + a worktree server + a dtach stub agent (§E share legs, 2.369.195) + real Xvfb/x11vnc: launch from the dialog → window → canvas not black → a second client → SIGKILL + reboot ⇒ adopted + reconnects → Stop ⇒ exited (~90s); SKIPs without chrome or Xvfb' }, // docs/design-desktop-apps §6 row 4
  { name: 'test-desktop-xpra-window', tier: 'heavy', budgetMs: 2100000, why: 'chrome + a worktree server + the REAL xpra rung (xpra 6.5.3 + Xvfb + xterm): the seamless window filling the pane at two sizes with the pixels measured, the app\'s own title, typed text read back from the app, the clipboard both ways at the X level (xclip) on the loopback (secure) and the plain-http hostname (insecure) pages incl. REAL pastes on plain http (Ctrl+V on the pane, the Paste chip\'s box + Send), a third size under the UI scale (net zoom 1 measured, the X pointer at the same coordinates via xdotool), §4 the belt on the real rung (xterm resizing/moving itself fitted back, a second top-level at +2000+1500 placed inside, GNOME Calculator\'s mode switch keeping ≥ 95 % — SKIP without gnome-calculator), §6 HiDPI at DPR 2 (the canvas IS the screen pixel for pixel, the app\'s minimum clamping the window, phones) and §7 the r2 findings (DPR 1.5 pixel identity, the phone\'s lower rows + corner, a DPR-1 takeover, the 1.5× xterm cell) each against a patched-copy control server, §8 B-bfe6 a REAL browser launched from the dialog\'s Browsers section with an Open URL (window maps, the URL landed, the page title in the title bar, the keeper\'s 0700 profile, Stop removes it; a snap or absent browser SKIPPED with its reason), §12 LANE B seamless (a CSD calculator loses our bars, its header-bar drag moves our window, hover / Alt reveal, the pauses and the hatches, a forced-false control copy), §13 LANE C2 the main legs with host=<a scratch daemon PAIRED to the worktree server> (the picker, the device\'s ladder, the launch there, the window through the hub forward, the pane covered, the title naming the machine, keys into the device\'s file, Stop), §15 LANE D (a) the scale geometry (GNOME Calculator at DPR 2 and 1 through the window\'s own Scale ▸ rows auto → 1 → 1.5 → 2 → auto → 1 + a resize: the picture covers the pane, the window follows the scale, the column ∝ the true scale, every map at its final size), §16 real Chrome under seamless, one control copy for both, §17 lane M the ⚙ menu / a window context menu / the ⋯ Scale ▸ menu / a createPopover each CLOSE on a trusted click into a live GNOME Calculator picture while the calculator takes the digit, against a mutant-copy server whose closer is the pre-lane bubble mousedown (each stays open) (~1000 s + ~540 s — its own budget); SKIPs with evidence without chrome / xpra / xauth / xterm' }, // docs/design-desktop-apps §7 P8-2 chunk x2 (D21 (c) (b)) — the exit conditions of the chunk, measured on this box
  { name: 'test-desktop-app-snap', tier: 'heavy', budgetMs: 1200000, why: 'chrome + a worktree server under its own dbus-run-session + the REAL xpra rung with REAL google-chrome and gnome-calculator: a matrix of Chrome and Calculator × DPR 2 / 1 × UI 100 / 125 % on a 1920×963 page with the sidebar at 470, ten trusted acts each (rest, the right third of 1×3, right / left / top / bottom halves, the bottom-right of 2×2, maximize, restore, a 700 px resize) + at DPR 2 / UI 100 % the r2 flows (minimize / maximize → the sidebar opens → restore / un-maximize, the widen / narrow cascade, a phone round trip), every state measured (window / pane / picture vs #workspace) and judged on a decoded screenshot (the picture\'s last 40 device columns and rows found on screen), + a pre-fix control copy (~12 min); SKIPs with evidence without chrome / xpra / xauth / dbus-run-session' }, // inc-muhmqvzf-jodk (2026-09-26, the owner: "chrome吸附在右侧，右侧有截断"): a snapped desktop-app window never clips its picture — the owner's case (Chrome, DPR 2, the right third of a 1×3 grid) 0 px hidden; CONTROL = the pre-fix placement levers pulled back (the owner's case hangs past the workspace, the calculator's bottom half and its UI-125 % rest are cut)
  { name: 'test-desktop-app-fixed', tier: 'heavy', budgetMs: 900000, why: 'chrome + a scratch-tree server under its own dbus-run-session + the REAL xpra rung with a REAL GTK 3 window that fixes its size (lane app-fit-fixed): DPR 2 (zh) and 1 (en) — a 400×300 window, a lone 480×700 DIALOG taller than the pane (Inkscape\'s welcome), the swap to a resizable main (WeChat\'s login), a 1000×900 one larger than the 878 px workspace — plus a CONTROL tree with the levers pulled back, rebuilt; ~2.5 min measured (139 s)' },
  { name: 'test-office-desktop', tier: 'heavy', why: 'real xpra + LibreOffice Writer + a worktree server + chrome: the explorer row → the door → the Writer window (argv path last, the title, the picture), the file-changed signal after an edit + its untouched CONTROL, the code editor honouring it, a machine without LibreOffice on a scratch PATH (the sentence, the install plan, file mode) (~90 s; SKIPs with evidence without them)' }, // docs/design-desktop-apps §7.9
  { name: 'test-desktop-remote', tier: 'heavy', why: 'binary + daemon: a REAL agentd booted from the built bundle under a scratch HOME as the fake paired device + the REAL xpra rung (xpra + Xvfb + xterm) on it, six daemon boots + a server-speaks-first stall leg (~45 s); SKIPs with evidence without xpra / Xvfb / xauth / xterm' }, // DESKTOP APPS LANE C1 (design-desktop-apps-seamless §3.5, D5/D8): through src/server/desktop-access.js ⇒ facts ⇒ launch an xterm ON THE DEVICE (its record in the device\'s own ~/.vibespace/desktop-apps.json) ⇒ forwardPort (hub loopback → dm.tcpForward) ⇒ a REAL xpra hello through the forward ⇒ "abc" typed lands in the app\'s file (latencies printed, §8-7) ⇒ windows / keep-alive / status ⇒ the daemon SIGKILLed and a new one ADOPTS the live record at boot ⇒ stop leaves nothing carrying the marker; the capability gate: a daemon copy without the capability ⇒ host_needs_daemon in < 1 s, CONTROL = the copy without the handler answers nothing (the hang), an ssh host without a daemon + an unknown host refused by name; LANE C2 §7: the REAL hub keeper + the REAL bridge over that daemon (a launch with host followed to ready, the upgrade resolved through streamEndpointFor to the hub forward, a real xpra hello + pings + keys typed THROUGH THE BRIDGE, the forward released, offline ⇒ kept + 404, stop) + the capability gate through the hub keeper's launch; C2 verify §8: an op IN FLIGHT when the link dies answers host_unavailable in ms (a pre-fix client copy waits out its timeout), run-stream's per-op belt, an install run past its deadline with the device's child waited out; VERIFY r2: the capability found by content (F5), the device's facts reporting the detached install (installing ⇒ lastInstall), the daemon SIGKILLed mid-install ⇒ the install still ends (a pre-fix rung copy dies with it), the hub's side of the link destroyed with a 4 MB run-stream producer in flight ⇒ resumed into ~/.vibespace/run-stream/<pid>.log and finished (F2; the bundle without the orphan resume leaves it paused)
  { name: 'test-desktop-xpra', tier: 'heavy', why: 'a worktree server with PASSWORD AUTH on + the REAL xpra rung (xpra 6.5.3 + its own Xvfb + xterm), driven from node through the routes and the ONE ws bridge (~50 s): bring-up, the loopback-only binding check with a non-loopback TCP connect REFUSED, 401 / 404 / a real rencodeplus hello through the relay, resize-follows against X\'s own geometry, the clipboard both ways at the X level (xclip), keep-alive vs idle stop with the setting patched live, adoption of xpra AND vnc-display records across a SIGKILL + reboot; SKIPs with evidence without xpra / xauth / Xvfb / an X app' }, // docs/design-desktop-apps §7 P8-2 chunk x3 — the rung CLOSED on the real server (no chrome; the chrome half is test-desktop-xpra-window)
  { name: 'test-desktop-keepalive-chrome', tier: 'heavy', why: 'chrome + a worktree server + the REAL Xvnc singleton Desktop (90 s with the tab in the background, then a killed VNC server and a Paste while it reconnects, read back with xclip)' }, // lane desktop-keepalive K4 (userW inc-muoshmqn-dect): the stream survives a background tab; a press while down is said and pastes when the stream is back
  { name: 'test-desktop-vnc-fit', tier: 'heavy', why: 'chrome + a worktree server + the REAL Xvnc rung (TigerVNC 1.15 + xterm): the app fitted to the framebuffer, the VibeSpace window resized twice with the framebuffer following within 2 s and the app rect equal to it (black pixels outside the app counted and printed), the title bar = the title of the app window as text, the same follow under vibespace.uiScale 125 (net zoom 1, the pointer on the same X pixel), then the FIXED spelling (a PATH without Xvnc ⇒ Xvfb+x11vnc) with its chip; SKIPs with evidence without Xvnc / Xvfb+x11vnc / chrome / an X app (~60 s)' }, // P8-2 x4 (docs/design-desktop-apps §7): the vnc-display rung fits the window too
  { name: 'test-roster-reset-eta', tier: 'heavy', why: 'chrome + a worktree server: the Manage Agents roster rendered with clock-derived resets — the label under every donut, none under an empty-state window, the removed row-level line, row heights and the cluster alignment at 1200×800 and the mobile modal at 375×667; the credits chip (2.369.189): D dim / E in use on the identity line, never in the usage cell, patched by the poll as the same node, and the zh roster (按量) with the chip rect inside the row and the next-usable column unmoved' },
  { name: 'test-reconnect-storm', tier: 'heavy', why: 'chrome + 19 live chat sessions (real chat-wrapper, stub claude) behind a scratch server, twice (fix vs a scratch copy with the stagger neutered)' }, // perf lane ⑤b, inc-mtndq0vb: a socket drop with 5 visible + 14 hidden chat windows — attaches/s peak at the server, visible attached p95, the hidden spread, srv-loop-gap-ms, an un-hide mid-queue, identical-skip parity; the harness perf chunks C/D measure on
  { name: 'test-desktop-resume-paging', tier: 'heavy', why: 'chrome — the fast tier never launches a browser (224s here; a browser leg\'s cost follows machine load)' }, // inc-mtq5bpjt-0o0n end-to-end: a PINNED window survives a real desktop switch on a real >34MB transcript (gap sentinel installed), incl. the input-less scrollTop→0 probes and the round-3 TRUSTED-input legs (a real click must NOT disarm the resume repair, a real wheel/scrollbar drag must), WITH a source-level negative control that rebuilds the bundle with the gates patched out (SKIPs without chrome; ~3.5 min, two chrome runs + two bundle builds)
  // ── integrated 2.369.72 (suites master added while the split branch was open; all HEAVY: chrome / real serve / real wrapper / >10 s) ──
  { name: 'test-init-frame', tier: 'heavy', why: 'chrome + binary: headless 375×667 census of the status-bar panels + a dump of the installed CLI (2s here with the chrome legs skipped)' },
  { name: 'test-opencode-remote', tier: 'heavy', why: 'binary + slow: the shipped ssh op script over real child processes (21s)' },
  { name: 'test-opencode-s9', tier: 'heavy', why: 'server + chrome: real opencode serve + headless chrome + real processes (227s)' },
  { name: 'test-permission-rules', tier: 'heavy', why: 'cli: the real chat-wrapper stdin verb + local oracles (strace + real CLIs when present) (10s)' },
  { name: 'test-readings-attribution', tier: 'heavy', why: 'chrome: real engine/pool/symlinks + the headless §10 panel legs (3s here with chrome skipped)' },
  { name: 'test-turn-truth-ui', tier: 'heavy', why: 'chrome: a live ChatView in headless chrome + the real stdout consumer (9s)' },
  { name: 'test-parked-ask-ui', tier: 'heavy', why: 'chrome + dtach: a worktree server, a stub claude parked on a can_use_tool ask, a server restart (18s)' }, // lane parked-ask-stall: the card is back after the restart, requires_action, "waiting for you" (never thinking), the list's turn \'waiting\', the real watchdog tick holds (+ control), Allow reaches stdin and the tool runs
  { name: 'test-machine-card-fold-ui', tier: 'heavy', why: 'chrome + a worktree server; the server\'s own Machines card words fed live into a real ChatView at 390 / 1280 px in zh (~25 s; SKIPs without chrome)' }, // lane machine-card-fold SEEN: six cards of one machine = one head, open = six, the decoded script + Show full command, a failed card on screen + alert head, patched in place, another machine not swallowed
  { name: 'test-peer-card-fold-ui', tier: 'heavy', why: 'chrome + a worktree server + a stub claude behind the real chat-wrapper playing three 12-line worker reports (~25 s; SKIPs without chrome)' }, // lane peer-card-fold SEEN: folded at 1280 / 375 px (≤ 3 lines, 44 px target), Show in place by node identity, a swap keeps it open, bold headings, setting off ⇒ whole
  { name: 'test-chat-enter-ime-chrome', tier: 'heavy', why: 'chrome — a real ChatInput replaying inc-muukd9oq-qyc3 through CDP Input.imeSetComposition/insertText + two patched-copy bundles (~6 s; SKIPs without chrome)' }, // lanes chat-enter-ime r1+r2: a 229 Enter → commit → a plain Enter 20 ms later ⇒ swallowed, 150 ms ⇒ sent + the line; enterSends off ⇒ Ctrl+Enter
  { name: 'test-chat-hygiene-ui', tier: 'heavy', why: 'chrome + a worktree server + a stub claude behind the real chat-wrapper playing the study\'s records (~30 s; SKIPs without chrome)' }, // lane S3 seen: the Stop nudge folded as a note (and gone with chat.showAssistantNotes off), the handback card titled "VibeSpace · you handed control back after 17 s — the page is now …" with no "Message from", the helper/TaskStop lines as sentences + the visible-text census, the For-you toast naming the tray's corner once per item; ⑥ (S3 verify F3) a peer NAMED "VibeSpace" and a peer whose words open with VibeSpace's head, live and from the real prompt-context stash drain — peer cards, exactly one notice
  { name: 'test-page-link-ui', tier: 'heavy', why: 'chrome + a worktree server + a stub claude behind the real chat-wrapper (~15 s; SKIPs without chrome)' }, // B-2dbc (userW inc-murolahg-3rtv): a /p/<id> page link in an assistant message — a REAL click copies <origin>/p/<id>, a REAL Cmd+click opens the page (no "Not found", no file probe), a URL in a code span copies whole; CONTROL: the pre-fix rule on the live renderer copies the bare path and flashes "Not found"
  { name: 'test-integrations-ui', tier: 'heavy', why: 'server + chrome: a real worktree server (the vendor stub preloaded), a bundle build, a 375×667 page and a second client (~3 min)' }, // design §14.5 on the six browser key rows (the only cards since r4): the source chip walk, Replace never reveals, a PUT failure toasts, the deep link, two clients, zero-network Tests only; ⑩ design-integrations-per-account r4 chunk 3: the channel account card + dialogs end to end against scripts/fixtures/channels-vendor-stub.cjs (type-first Connect, presets / Custom / the Lark callback row, the consent in the dialog, the health line / ↳ rows / login-only, the ⋯ order D6, Edit → Re-authorize on a client switch, Duplicate with its own consent, the dead-sign-in error line healed by Re-authorize, the custom secret prefilled, Remove refused by name, in-place repaint, 375 px, pixel probes)
  { name: 'test-mounts-dialog-extract', tier: 'heavy', why: 'chrome: headless chrome over raw CDP on file:// bundles, no server — six real storage dialogs rendered through the shared module and through the byte-for-byte 2.369.160 baseline, compared by outerHTML and decoded pixels, with a one-character control; §3 D2: the storage Edit dialog — a client switch opens Re-authorize under the NEW client, the token lands WITH it, against a patched copy with the decision neutered (21s)' }, // D1 of design-integrations-per-account: the extraction of _mountsDialog/oauthLinkRow/_wireOAuthConnect is pixel-identical; the baseline fixture proved against 348aa226 when the history is present; D2 (4a) the Edit dialog draws identically and Save re-authorizes on a client switch
  { name: 'test-channels-aggregate-ui', tier: 'heavy', why: 'server + chrome: a real worktree server on the fake adapter with three synthetic rooms, a bundle build, two zh pages and a reload (~90s)' }, // THE AGGREGATED IM in the browser (owner ruling 2026-09-26): every conversation of the account listed with its chip and NO 跟踪 / 仅登录 anywhere; a window reads its messages, an image thumbnail loads through OUR route (?inline=1, a decoded PNG), a file is a download chip answering attachment + nosniff + sandbox; scroll-up reaches the vendor's older history and says where the conversation begins; the row menu 刷新周期 ▸ 每分钟 sets the override (chip, full view, a second client, a reload); the account ⋯ 交给一个 agent… hands the account to a Task Group through the ONE editor with its estimate, every row then wears the inherited （账号） chip; ⑦ (hotfix) the owner's exact dialog — 组 · 工作, 匹配过滤器的消息 × two time windows, digest 9999, cap 9999, 起草 — saves with no error toast, the card line + the wire hold the minted filter, re-open prefills and re-saves · mirror-193: the Grant access… leg runs with page 1's channels-updated frames HELD (the runner's stale-panel order, constructed) and must draw + save the SERVER's lists (a fresh GET …/view); every save judged by its toast's ARRIVAL (a MutationObserver log), never a count-then-slice of the stack (the control: an older toast leaving mid-save reads the runner's `[]`); ⑧ a list changed while the dialog is open is refused grain-changed and the dialog re-opens on it; CONTROL: the pre-fix dialog rebuilt into the scratch bundle draws the stale list, the server's stamp still refuses its save; ⑨/⑨b the conversation window's list has ONE writer (three renders in flight, a repaint's scroll event — constructed, judged once every bar + page parsed; control: 27 for 9, 18 for 9); a page throw names its line (V8's own parse for a SyntaxError); verify round 2: ⑦b a stored digest\'s own daily cap is in a field a person can type into (trusted CDP typing → the wire: digest 1440 + cap 7), toasts captured by mark never by index
  { name: 'test-channel-window-render', tier: 'heavy', why: 'server + chrome: a real worktree server on a store SEEDED with disabled Lark + Gmail accounts, a bundle build, one zh page + a phone-width reload + the ⑩h CONTROL\'s rebuild on a patched paging verdict (170 s measured 2026-09-28; SKIPs without chrome)' }, // THE RENDER LAYER IN THE BROWSER (§25, the owner's two screenshots): a Lark-shaped record's markdown link + bare URL are real <a> (http(s), _blank, noopener noreferrer), a mention a chip, the picture IN the body through our route, no "[image]" words, one author line for two messages within 5 min (the second's time on hover), the composer footer ONE short line + ⓘ; a Gmail thread titled by its CLEANED subject, the ticket banner one dim line, the quoted history FOLDED behind 显示引用内容（6 行） with its attribution, opened by a click and STILL OPEN (the same element) after a channels-updated broadcast patched the window, the read-only footer one line + 重新授权 opening the account's own dialog; a Lark account lacking a send scope names exactly the missing scope (console step) and Gmail never does; a hostile record (markup label, javascript: href, a frame in a card line, a tree carrying a javascript: href past the ingest) renders as text with an innerHTML negative control; a pre-lane record served WITH a tree; ⑦ inc-muk9jj0j-rel3 — a credential change reaches the OPEN windows (a Disconnect's one whole digest turns an open Lark composer read-only in place; the owner's state — consent landed, index verdict judged before it — a Gmail window left open shows the composer after the restart, a thread opened afterwards is writable at once); ⑧ the Push… dialog says what push is (both vendors) + exclusive/shared, the menu tooltip the same; the phone width (fold + Re-authorize ≥ 36 px); ⑪ (channel-polish) one avatar per run, the gutter time on hover, a system line breaking the run, the self accent, every avatar the same element + the same hue across a patch; screenshots; verify round 2: ⑩b three renders in flight (the page once at every instant, the queued reconnects ONE rebuild, no page upward, no POST /older), ⑩c a rebuild\'s own scroll event reads no page + the converse, ⑫b the picker at 500 sessions / 50 Task Groups measured (open 80 ms, keystroke 7 ms, a broadcast\'s patch 4–10 ms; the listener ends with the dialog); verify round 3: ⑩d a MAXIMIZE that lets the content fit (the clamp\'s scroll event reads no page, no POST /older, the un-maximize re-tails the reader) + a room that fits its pane (a bare scroll event reads nothing, a wheel up asks the vendor ONCE, a wheel held there no more), ⑫c the picker as an authority control (a trusted Enter after a roster patch moved a row to the top grants access to nobody; typing re-arms; ↓ kept by key; a vanished highlight disarms; a dead pick keeps its name); verify round 5: ⑩f the EQUAL-room clamp (trusted wheel up on a fitting 50-row page reads the local page; a maximize 300 ms later — the clamp back to a room of 0 — reads nothing, asks nothing; round 4 POSTed /older), ⑩g a caret key typed in the proposal card's reason box (inside the list) reads nothing; a click on a row + ArrowUp still pages once
  { name: 'test-channel-threads-ui', tier: 'heavy', why: 'server + chrome: a worktree server on the FAKE adapter (VIBESPACE_CHANNELS_FAKE + a 120-message big room) + one seeded disabled Lark room, a bundle build, four chrome pages (zh desktop ×2, a zh phone and a ja phone with touch emulation) — 56–76 s measured 2026-09-28; SKIPs without chrome' }, // lane channel-threads (spec §7.3, one leg per brief item + attacks 7/16/20/21 of §10): (a) the quote line flashes its parent; a parent never stored is said ONCE; the REAL Lark toRecord shape draws its tag + chip; (q) quote-vs-topic (2026-09-28): a Lark reply without reply_in_thread draws the quoted-original strip and NO tag, the message it quotes NO chip, a strip click flashes it and opens NO pane, a topic keeps its tag / chip / pane titled 话题, no 线程 in a zh window, the fake-poll big room's quotes untagged; (b) the thread chip opens a SIDE pane at 1280 px (main scrollTop unchanged) and a PUSHED view at 360 px (Back keeps the reading position); (c) a reply typed in the pane lands INTO the thread (the fake's threadKey), shown in the pane and the list with its tag, the main draft untouched; (d) + / arrows / Enter add a chip .rx-mine = 1, a click removes it, the strip's other chips the same nodes; (e) page B's reaction reaches page A's chip in place < 2 s, no row rebuilt, no /messages fetch; (g) phone: long press = the who-list (no toggle), tap toggles, the + never alone on a line; (h) zh + ja at 360 px under DejaVu Sans: every chip / tag / pane word whole; (f) last: a 3 s wheel storm over the big room spends ≤ 20 reaction-list calls in the minute (the server's own counters)
  { name: 'test-channel-lark-threads-ui', tier: 'heavy', why: 'server + chrome: a worktree server on the FAKE adapter with the separate-listing seam, two chrome tabs (zh + ja) — 13 s measured 2026-10-01; SKIPs without chrome' }, // lane lark-threads (2026-10-01): the fake's separate-listing seam — a topic born on a root the window drew: the OWNER\'s Refresh widens it, the chip grows in place in two tabs (no reload), the pane loads the reply; the author menu "Set a name…" → the owner\'s name on every head in both tabs, an empty name restores, an agent bearer refused
  { name: 'test-channels-panel-redraw', tier: 'heavy', why: 'server + chrome: a real worktree server on a store SEEDED with one disabled Lark account of 879 conversations, a bundle build, one zh page + a control page on a rebuilt bundle (~20 s; SKIPs without chrome)' }, // THE CHANNELS PANEL REDRAWS IN PLACE (verify round 4, 2026-09-27): with "Show all" open on the first screen and the account card (1 758 rows) a WHOLE digest and a PARTIAL digest naming ONE row each redraw in < 40 ms (measured 2–4 ms incl. the layout; 77–104 ms before), every row / the rows box / the group list / the Accounts part / the account section are the SAME elements afterwards, twenty broadcasts 250 ms apart keep the handler under 15 % of the main thread (1.8 %; 35 % before), a TRUSTED click on a row with a broadcast between the press and the release still opens its conversation (the row never detached), a collapsed account stays collapsed across a redraw, a conversation that left the digest leaves both lists; CONTROL: the scratch bundle rebuilt with reconcile = replaceChildren (the round-3 draw) — ≥ 4× slower and the same click LOST; verify round 5: ⑤b line 3 follows the WHOLE access list (one, two, three principals; the row rebuilt only when its facts change), ⑤c a trusted click on the account head's ⋯ / the head across a broadcast lands (the menu under the button), ⑦ CONTROL the round-4 panel (the stale row, the lost ⋯ click)
  { name: 'test-channels-list-polish-ui', tier: 'heavy', why: 'server + chrome: a seeded disabled Lark account — the DM shows the peer\'s face (pixel), the badge on top, group picture, chat rows, zh/ja 390 px, old-peerOf control' },
  { name: 'test-channel-names-ui', tier: 'heavy', why: 'server + chrome: a worktree server on the FAKE adapter, a bundle build, one page (~10-25 s; SKIPs without chrome)' }, // B-c127 SEEN: a REBUILT channel notice (a view-only transcript holding the server\'s post of a real wake block) names the account in its head and the conversation as a link, the agent\'s block folded, the raw id nowhere in its visible words; a REAL click on the name opens THAT conversation (the id resolved from the panel\'s list); a LIVE card (`peerChannel` through the view\'s own op path) reads "<name>: 1 message from Ada — …" once and a real click opens it
  { name: 'test-channels-e2e', tier: 'heavy', why: 'server + chrome: a real worktree server, a bundle build, TWO chrome pages and a SIGKILL+reboot (~90s)' }, // the P0 exit conditions end to end: a fake conversation in the panel, opened as a window, surviving a restart, synced between two clients, two passes each advancing their own cursor, and a READ-ONLY conversation with NO send control; P3 (design §9): the composer proposes, the inline approval card + the other client's Outbox window render ONE record (identity row + the `unknown` warning), one For-you pointer filed with its id on the row and retracted by the engine, Approve sends through the fake adapter and the second client repaints off `channel-outbox-updated`, the audit log holds propose→approve→attempt→outcome with draftedBy/approvedBy/sentAs/identityMarking, Reject carries its reason and writes no attempt, and the outbox survives the SIGKILL + reboot; P4 ⑪ (§9.4/§9.5): a send whose answer was LOST lands as `unknown` with the For-you item and a Check outcome button, Check outcome from the card settles it to sent (the item retracted as `system`, reconcile-attempt → reconcile-outcome audited, nothing re-sent), the panel's sender-line switch reads OFF (instance default) and a user's own draft carries no sender-line note even after a channel turns it on, the reconciled proposal survives the reboot; ⑯ (2.369.186, the .185 mirror red): every freshness-pill word (a census over `freshnessText`'s own cases, zh/ja/en) is ≤ 82 px and drawn whole in a plain and a ↳ child row at the 188 px panel, the title yielding — under this box's face AND 'DejaVu Sans' forced (the runner's `system-ui`); control: the pre-fix product (the r4 CSS cap + the r3 words, scratch copies) cuts "refresh paused" at 82 of 89 px under DejaVu Sans only
  { name: 'test-tasks-mirror-race', tier: 'heavy', why: 'server + chrome: a real worktree server, two bundle builds, 5 constructed + 20 throttled page loads (~2–3 min; SKIPs without chrome)' }, // THE TASK-GROUP MIRROR NEVER GOES BACKWARDS (R4 verify r1, the test-channels-e2e ⑮ flake): two boot GETs of /api/tasks are in flight at page load; one whose body parsed AFTER the `tasks-updated` broadcast that carried a new group replaced the fresh list with its stale snapshot (3–4 of 30 loads at CPU ×12, `_fetchTasks` named as the last writer) — every roster built from the mirror (Grant access…, Reach & policy) was empty. ① the interleaving CONSTRUCTED (the page's /api/tasks answers gated until the broadcast applied, then released): the group stays, the roster names it; ③ 20 natural loads at CPU ×12: never a miss; ② CONTROL: the scratch bundle rebuilt without the generation guard empties the mirror on EVERY constructed trial
  { name: 'test-channels-groups-e2e', tier: 'heavy', why: 'server + chrome + two dtach fixture sessions: a real worktree server adopting two stub-CLI sessions, headless chrome, a page reload (~60s)' }, // AGENT GROUPS IN THE PANEL (design §22.5, chunk g3): the first screen IS the group list; New group (live sessions, nothing pre-selected, the "will wake N" echo) with a HOSTILE name rendered as text everywhere; each invitee's stub CLI records ONE invite frame with the context; the owner sets alpha → always in the detail and sends as You: alpha's stub records the wake, beta's (next-turn) records nothing, the toast says woke 1; the @-autocomplete + a mention wake; the list reorders by activity in place with zero fetches; an agent's post shows unread, opening the window reads it; the Accounts fold survives a reload — every wake through the REAL ladder + authorizer into a recording stub
  { name: 'test-channels-i18n', tier: 'heavy', why: 'server + chrome: drives scripts/dbg-comm-surfaces.mjs at zh AND ja (two worktree boots per language, headless chrome over every panel/window/outbox/editor/wizard/Integrations surface) + ④ its IM pass (zh/ja/en × desktop/phone × dark + en light, forced DejaVu Sans) for the rect census (~6 min)' }, // a3 of the comm-panel polish (owner "似乎没太做好 i18n"): ZERO Latin-only visible text nodes on the eight surfaces under zh and ja outside a PRINTED allowlist (proper nouns, URLs, ids, the fixture's own data by DOM path); a planted English literal turns the PURE census red (the negative control runs before chrome); ④ (channel-polish, 2026-09-27) THE LOOK'S RECT CENSUS over the IM pass: nothing overlaps / is cut / leaves its row / scrolls sideways, phone targets ≥ 36 px, every avatar ≥ 4.5 : 1 and aria-hidden — a planted shot trips all seven rules first
  { name: 'test-worktree-userchan-ui', tier: 'heavy', why: 'chrome: headless chrome + the LIVE_SESSION_FACTS drift guard (4s here with chrome skipped)' },
  { name: 'test-fork-restore', tier: 'heavy', why: 'server + dtach + a fake CLI: a scratch copy of the tree booted twice (SIGKILL between) with two parents and three pending forks, then the same run on a copy carrying the pre-fix boot dedup (~70s)' }, // fork-group round 3: a restart beside pending forks retires no parent, and the terminal fork / the chat fork announced while the server was down / the chat fork whose init is the first line after the re-attach each adopt their own id
  { name: 'test-restore-liveness', tier: 'heavy', always: true, why: 'server + daemon: fault-injected vibespace-device daemons, real dtach fixtures and three worktree-server boots over a self-upgrading daemon, + ⑤ the EMFILE-shaped restart (a prlimit\'d server whose table is filled, the status write it survives and the pre-fix copy dies of, two restores after) (156 s measured with ⑤)' },
  { name: 'test-dead-bridge', tier: 'heavy', budgetMs: 900000, why: 'server + real dtach + node-pty + a stub CLI: §1 the mechanism on raw dtach (the inherited pty master, the orphan, the 6-byte dead attach, attach-first-then-kill), §2 SIGKILL mid-stream with a Background Work job holding the master → the boot sweep, §3 the pre-fix copy stays dark, §4 a stuck client the sweep may not touch → the watch heals on the OTel witness, the backlog judged late, one card (247 s measured)' }, // lane-dead-bridge (2026-09-30): a restored session's bridge stayed dead for 3 h after the 12:03 crash
  { name: 'test-unexpected-exit-e2e', tier: 'heavy', budgetMs: 300000, why: 'B-f698 verify r1: a real server + dtach + a stub CLI — the respawn after a mid-turn crash racing a Resume click leaves ONE CLI; a System-panel kill is a user kill (never respawned)' },
  // ── MOVED FROM FAST (B-f4cb, 2026-09-27) by THE TIER RULE above the table: each boots a
  // server, runs a real external program, adds a checkout, or measured ≥ 10 s (the number is the
  // median of the last three fast runs on this box). Cheap → expensive; the lanes schedule by the
  // markers' timings once a heavy run has measured them.
  { name: 'test-codex-sandbox-net', tier: 'heavy', why: 'cli — 0.2 s here: the REAL `codex sandbox` loopback A/B runs whenever codex is on PATH (the fast-tier rule: a real agent CLI is heavy)' }, // codex sandbox keeps loopback open for the vibespace-* tools: real `codex sandbox` A/B (evidence-SKIP without the binary) + wrapper/adapter/probe pins
  { name: 'test-harness-settings', tier: 'heavy', why: 'cli — 0.3 s here: the REAL codex `features list` load leg runs whenever codex is on PATH (the fast-tier rule: a real agent CLI is heavy)' }, // docs/design-harness-settings.zh.md §8: checkTable refusals, derived schema rows field-equal to the 2.369.120 snapshot, harnessSetting coercion, the plan (off ⇒ not written), applyConfigPlan/readConfigPlan on a scratch HOME (JSON + the comment-preserving TOML setter's fixtures: replace/append/dotted/refusals/idempotence/CRLF; r7: symlinked configs written THROUGH + modes kept + a dangling link refused, the duplicate-key shapes, the REAL codex loading every produced file — evidence-SKIP without the binary — and the rel re-check), the closed enum vocabulary, registerHarnessSettings prefix rules, the receipt wording, the live-verb fan-out
  { name: 'test-restore-smoke', tier: 'heavy', always: true, why: 'server — 7.2 s: the end-to-end boot + session lifecycle + 29-route GET battery on a worktree server (the lost-export class only shows at boot) — always, like the other boot smokes' }, // the end-to-end boot + session-lifecycle + 29-route GET battery (the lost-export class only shows at boot or route-run time). 8.9s measured: the most expensive thing the fast tier is willing to pay for
  { name: 'test-agentd-session', tier: 'heavy', why: 'binary — 7.3 s: the agentd bundle built with esbuild + real dtach sessions that survive a dropped connection' },
  { name: 'test-browser-profiles', tier: 'heavy', why: 'binary — 7.3 s: the REAL agent-browser (--version / --help / session info) whenever it is installed, beside the PURE environment half' }, // AGENT BROWSER P0 (design-agent-browser-v2 §3.2/§9): the ENVIRONMENT half — the four spawn variables for local AND remote, the RESOLVED user-data-dir (§9 says assert the directory, because the two env strings pass on variant B, the broken one), the (D)→(C)→(N)→none ladder with its journalled reasons (the design's A/B are MEASURED rejects — r3), the browserKey continuity ladder, the D1 floor probe's outcomes over a fake binary, the pin indirection's no-restart property read back off the FILE, r3's three legs (the CLI's project-level `./agent-browser.json` layered with two patched-copy pre-fix controls, the host-decided remote fragment driven under every shell on the box + its `-L` sweep control, and 0600/0700 modes with a umask-independent control), and r4's: a FENCED config never lands on rung C (⑰, two patched-copy controls + the C rung's cwd record for the pin), the PURE predicate and the shipped fragment's awk driven over ONE "names a profile" table under every shell × every awk with round 3's grep as the control (⑭), the socket-root rule (⑱, an owned 0700 dir under the suite's OWN scratch base, a planted symlink refused) and its launch-free real-binary pair (⑨: `session info --json` + the argument-check refusal). ~4s, no ports, no fixed /tmp path, never the production /tmp/vs-ab-<uid>; the real-binary legs SKIP with evidence
  { name: 'test-cli-cmd-refresh', tier: 'heavy', why: 'server — 9.4 s: a scratch worktree server whose fake claude is renamed between spawns (dtach required)' }, // B-a18e: the agent-CLI path re-resolved at SPAWN time when the boot answer went stale (the installer-window restart) — the helper over injected facts, the wiring pins, and a scratch server whose fake claude is renamed A → B → A between spawns (each spawn runs it where it NOW is, no restart; gone everywhere ⇒ the old error path + one line). ~8 s, dtach required (SKIP names it)
  { name: 'test-browser-mediation', tier: 'heavy', why: 'slow — 10.2 s: the PURE CDP mediation rules + the real mediating proxy over a fake browser' }, // AGENT BROWSER P6 (design-agent-browser-v2 §6.2 / §6.5 / D6): the §6.2 sharing verdict (instance only where the mediating proxy exists and on this machine), the PURE CDP mediation rules over literal messages (target scoping, the session gate, browser_paused while the user drives, the whole-browser acts refused, scope growth/shrinkage, the measured Chrome ordering replayed) and the REAL proxy over a fake CDP upstream on loopback (two grants on one browser — the second cannot see or touch the first's tab; /json twins re-pointed; unknown token 404; revoke closes the lease's tabs; repoint 1012); takeover C3 ⑤: raw CDP (connect / get cdp-url / --cdp / --auto-connect) refused by the router AND the shipped CLI with zero server calls, a takeover pauses resolveFor for the managed ephemeral browser and an attachment alike; ③b (desktop lane C verify r2): a client that RESETS or half-closes while its upstream opens is no uncaught error and leaves no upstream open (a pre-fix copy as the control). The real-chrome exit proof is test-browser-mediation-chrome (heavy). ⑥ verify r4: THE CENSUS — every method of each censused Chrome's pinned /json/protocol fixture (153 + 154, compared at its version — lane-cdp-154) has a row in src/cdp-census.js and no row is stale, every row's five verdicts (the anchor's tab / the lease's other tab / free / switch on paused / switch on free), the one anchor row, the P6 lists as dated rows, an unknown method refused by name while paused, the switch's words, the real proxy reading the switch live + listing the unknown method it refused; CONTROLS a row demoted / the unknown rule dropped / the switch ignored.
  { name: 'test-channels-accounts', tier: 'heavy', why: 'slow — 13.2 s in-process (since 2.369.192\'s verify rounds: the refresh races + the identity door\'s matrix over the real engine and a fake Google); its credential law\'s push-blocking half is test-channels-accounts-model (fast)' }, // the ACCOUNT MODEL (2026-09-22, owner's mounts analogy): N adapter records per kind, each stamped at connect with the credential it was minted under (`cluster:<presetKey>` / `own`) — two Gmail accounts under two presets refresh with THEIR OWN client ids, flipping the integration's default leaves the first on its client (a patched engine copy that hands the adapter no key reproduces the silent swap), a withdrawn preset answers preset-gone BY NAME and never another client, an unknown key mints nothing, `own` is offered only when the values are complete, a further account's disconnect removes only its own record + index rows, the routes (`{credentialKey, newAccount}` / per-account reauthorize / the P1a per-kind path), the Lark keyed rung read LIVE off the record; zero vendor calls
  { name: 'test-fork-groups', tier: 'heavy', why: 'slow — 13.3 s: a fork lands in its source\'s Task Groups (owner 2026-09-25) — the plan, the fork-source-id wait, the real _doForkSession / pending-bind queue driven, the one-fork-create census; the terminal-mode fork end to end (real lock capture over scratch lock files → real TaskGroupManager in a scratch data dir), the parent/fork capture race (locks in both orders), the PID WITNESS (two sessions created together, stray/dead locks, a lock after the old 17 s window, real process trees over /proc), the restored fork flag; round 3: the writer witness over a real wrapper→claude→sleep tree, the no-sidecar rule on ONE lock, a pending chat fork captured, the boot dedup through the real dedupWebuiSockets, the real chat consumer (glued dtach preamble, a torn record reported), the real boot-restore R6 re-open (arm spied), code-only wiring pins; sixteen mutant-copy controls; re-homes its own process; ~4 s, no browser, no server' },
  { name: 'test-desktop-viewers', tier: 'heavy', why: 'slow — 16.9 s: the keeper election + the REAL desktop-stream bridge over a fake xpra upstream' }, // P8-2 x5 (docs/design-desktop-apps §7 P8-2 "x5 多客户端 = 单活跃 viewer"): the PURE one-active-viewer rule (active/blocked/watch with the agent lease, first attach, re-election by recency with the naive most-recently-joined pick as the control, panes never socket ids in the broadcast), the keeper's election + its desktop-app-viewers broadcast, the BRIDGE over fake xpra + rfb upstreams composed as the wiring composes it (blocked ⇒ no upstream and 0 packets either way, Resume here ⇒ the old active cut 4001 and the held hello/keymap/display/geometry replayed in order, an agent driving ⇒ picture only, a human takeover replaying the held kinds, the active leaving ⇒ the dormant one takes over, the session ending closes blocked sockets) with the pre-x5 bridge as a patched-copy control, the /viewers/takeover route and the wiring pins. ~1 s, no display
  { name: 'test-browser-continuity', tier: 'heavy', why: 'server — 18 s: a worktree server + a fake agent-browser' }, // + B-f7ab ⑤: a session spawned with per-session browsers OFF gets its key on its first agent route once they are ON — through the real wiring and the real meta choke point, kept across Terminate → Resume
  { name: 'test-apps-ui', tier: 'heavy', why: 'server + chrome: a throwaway worktree server running the apps stub seam + a stub claude behind the real chat-wrapper + headless chrome over CDP — 7–30 s measured; SKIPs without chrome / dtach' }, // APPS — THE USER'S DOOR AND THE AGENT'S PROPOSAL ON A REAL PAGE (docs/design-app-persistence.zh.md §3.1, owner D3): Desktop apps → Your installed apps → Install an app… → search → pick → THE install dialog (the plan's facts + every command) → a real click on Install → the log, done, the row; the agent's `vibespace-app install hello --why …` with its own session token → ONE For-you item (origin apps, the proposer, the size) → the For-you window's Install… → THE dialog ON the proposal (who, why) → Install → the agent's `wait` prints done, the item resolved, the row says proposed by …; a second proposal declined with Not now (the agent hears it); an agent token on the user's install route 403; the section fits a 390 px phone
  { name: 'test-app-system-enter', tier: 'heavy', reads: ['src/app-system.js', 'src/app-system-serve.js', 'src/app-serve.js', 'deploy/sysroot/vs-sysroot-enter', 'deploy/sysroot/vibespace-sysroot.sudoers'], why: 'real binary: the REAL helper (unshare / chroot / sudo / debootstrap) only inside disposable Debian 12 containers (docker --cap-add SYS_ADMIN, node:22-bookworm-slim) — a few minutes; SKIPs with the evidence without docker or the image' }, // THE APP SYSTEM (design §3.2): create (rung A/B), installs, the shim on the same pid (P7), the token never inside, no mount left, Repair, Rebase + rollback, refusals by name, a controls leg per security rule
  { name: 'test-app-install', tier: 'heavy', why: 'real binary: five throwaway Debian 12 containers (docker, node:22-bookworm-slim) run a REAL apt as root inside them — 53–62 s measured; SKIPs with the evidence without docker or the image' }, // APPS THAT SURVIVE A REBUILT MACHINE (docs/design-app-persistence.zh.md §3.1 + §3.3, Layer 0): the checkout read-only in a container, a non-root user with passwordless sudo (the fleet's shape) driving the REAL machine keeper + the ONE package slot + the apps engine (scripts/fixtures/app-install-driver.cjs): plan as the user → install (sudo -n, THE root script) → a .deb the user had → a package installed outside VibeSpace = drift → Adopt → xterm's desktop files = catalog rows → remove; every stanza root wrote byte-identical to the PURE builder, no %3a names, the base sha = the PURE reader's, debs/ + sys/ root:root 0755 and the manifest the user's 0600, root refusing a foreign apps dir; then a FRESH container with --network none over the same home: the boot replay's rung 1 puts xterm / sl / cowsay back offline (~2 s), hello (removed) stays gone, the next boot is the marker hit; CONTROL: an empty repository puts nothing back and says so
  { name: 'test-desktop-serve', tier: 'heavy', why: 'slow — 17.8 s: the nine-op desktop-serve table, the install plan and the detached install slot over real children' }, // DESKTOP APPS LANE C1 (docs/design-desktop-apps-seamless.zh.md §3.5): the desktop-serve OP TABLE — the closed nine-op set answered BY NAME by the runner (a table op the runner stopped naming is caught), every literal op a src/ caller passes inside the table, every failure {ok:false, code, error} with a runner-without-its-catch patched copy as the control, the daemon's three touches (hello-ack capability, both handler arms replying desktop-serve-result through the bundled runner against ONE per-process machine keeper, the client's id-keyed routing set + its capability gate naming host_needs_daemon), the SHARED tier's requires, the hub keeper holding device #0's machine keeper + ONE store, and desktop-access over fakes (local in-process, a paired device verbatim, an ssh host without a daemon refused host_needs_daemon before the event loop turns, the picture forward piping bytes both ways, ref-counted). LANE C2 §6–§10: the xpra install plan table (apt ≥ 5 vs xpra.org pinned 6.x, refusals by code, a malformed codename never scripted), the picker verdict, the hub REGISTRY of a paired machine's apps over a stub device (never the local store, idle via the op, the report judged once, offline kept + re-adopted, keeper.local, byte-identical local list), streamEndpointFor (+ the half-closed / gone viewer races released once, a pre-fix copy leaking as the control), the routes (host, machines, plan, NDJSON install, busy 409 first), machines() never connecting, the install past its deadline (install_timeout, the child waited out never killed, the slot held ⇒ busy, install_link_lost), the sudo probe itself over a fake sudo (a no-probe copy as the control). VERIFY r2: a viewer RESET during the forward is no uncaught error (F1, process-level trap, a pre-fix copy raising ECONNRESET as the control); the DETACHED install (F3/F4): it outlives a SIGKILLed starter, a re-created access layer re-attaches to the machine's pidfile slot (one install; the in-memory pre-fix starts two), a lost link / a timed-out-then-lost install holds the slot until the machine says gone, the freeing line naming the evidence. No wall-clock bound is a literal (2.369.189 mirror red): "at once" = under half the launcher's own pidfile-wait cap read from the module, beside the evidence (polls counted by a PATH `sleep`, the wait's exits). ~18 s, no display
  { name: 'test-discovery-interpret', tier: 'heavy', why: 'binary — 24.4 s: real processes (sh / tail / sleep) for the process-identity twin + lsof over open rollouts; the discovery-facts parity suite' },
  { name: 'test-desktop-display', tier: 'heavy', why: 'binary — 31.4 s: a real Xvfb (-displayfd allocation, the Xauthority writer, enumeration) + the xpra probe on a fake binary' }, // desktop-display facts: -displayfd allocation never collides, the Xauthority writer admits/refuses real clients, enumeration on a real Xvfb, the xpra probe on a fake binary; every binary leg SKIPs with its reason when absent; per-pid scratch, no fixed display or port (~3s with Xvfb)
  { name: 'test-stdout-registry', tier: 'heavy', why: 'slow — 32.4 s: every stdout consumer on a fake pty through its real normalizer, a scratch worktree, and the installed claude grepped for its emitted spellings' }, // S5 stdout consumer registry: descriptor caps.streamProtocol → ONE consumer (src/server/stdout/); unknown protocol = loud console.error + telemetry + RAW passthrough (never stream-json); each consumer on a fake pty feeds representative records to its REAL normalizer + id adoption / streaming flag / _stdin_ack / todos / engine calls; wiring pins
  { name: 'test-channels-aggregate', tier: 'heavy', why: 'slow — 53.9 s in-process: the real engine at the owner\'s scale (873 conversations); the money ceiling its wakes answer to stays fast (test-spend-paths), and so do the drain\'s rules (test-channel-drain)' }, // THE AGGREGATED IM (owner ruling 2026-09-26, design §5 inv 6 / §6.2 / §6.5 / §7.3): the REAL engine at the owner's scale — 873 conversations DISCOVERED (the cursor walked past 500) and INGESTED with no track step, the pre-link backlog read; the per-conversation scheduler whose timer-pass call counts ARE the arithmetic (hot 30 s / warm 5 min / cold 15 min); the per-account budget in the VENDOR's unit, exhaustion said with its numbers, the waiting ones first next minute; the owner's override + paused, persisted; push first (the cold safety net, a pushed record for an undiscovered conversation ingested, a kick naming a conversation, the parked-SDK remedy sentence); the agent refresh behind reach / floor / budget; history on demand PREPENDED in order, never a wake; attachments through the ROUTE (nosniff + sandbox, attachment unless a raster inline, svg never, 0600, LRU eviction at the budget) + search; the three assignment grains reaching exactly their sets, a new matching conversation inheriting in one pass, ONE pace ledger per assignment, the scope digest as ONE block; a restart keeps it all; the tracked ⇒ hot migration; lane R2 verify: an inherited grain's daily cap under ONE burst pass with a slow ladder (5 of 100), concurrent agent refreshes each answered by their OWN fetch, the agent share of the minute keeping the hot rows' cadence, a 429 said from the first failure (backoffUntil / lastOkAt), the settings bounds census + the said clamp; r3: a vendor back-off honoured by agent refreshes and window opens (zero calls, consecutiveFailures unmoved, the owner's press still runs), the panel + window re-read on reconnect; controls: the old 5-page discovery, a poll-everything scheduler, the per-conversation-only wake, the foreign-pass refresh, the share at 100 %, the ungated back-off (40 calls, failures 41)
  { name: 'test-exit-forensics', tier: 'heavy', why: 'binary — 61.2 s: B-3052: the REAL chat/pty/codex wrappers against a fake CLI (~50 s) — a child killed by a signal is named in the meta + log, a signalled wrapper records itself, still dies 128+signo and hands its child only what the default action did, the record never re-creates files the kill path unlinked (also under real dtach), the reconnect-window record, the _remote_exit sentinel signal through the REAL keeper, the real setupSessionPty teardown line/event/tomb pair + 7-day sweep (with and without a .buf), r4: the teardown fed AT the socket EOF in the incident order (master dies first) waits for the wrapper, the record is first and never torn, one patched-copy control per change — mirror-193: a kill-path trial counts only when the handler ran AFTER the unlink (its own words: record skipped / the control ctl-open existed=false; the tick is constructed unlink-then-SIGTERM, since a starved CPU runs the woken master + wrapper before the sender makes its next syscall), repeated up to 8 and counted; a pad trial only when the handler opened the inflated file; every sample after the wrapper AND the child are gone' },
  { name: 'test-codex-effort-meta', tier: 'heavy', why: 'cli — 62.2 s: the REAL codex chat-wrapper against a stub app-server through the resume / set-effort / per-message races' }, // the effort a TURN ran at (owner: "调成了 ultra 但 metadata 显示 xhigh"): the resume race reproduced against a stub app-server with the REAL wrapper (+ a negative control in master's record shapes), set-effort reaching the app-server AND the live status, per-message meta following its own turn, the wrapper_meta fallback, the merge fold vs codex's own copy, the session-meta writer, and the "ultra (multi-agent · reasoning …)" label read from the model catalog
  { name: 'test-window-targets', tier: 'heavy', why: 'binary — 63.6 s: a real Xvfb + the python3 AT-SPI helper + a GTK fixture (SKIPs with evidence without them)' }, // AGENT BROWSER P9 first half (design-agent-browser-v2 §4.9 / §5.1.1 / §6.6, D27 (a) / D28 / D29): the PURE verdicts (the closed chord vocabulary, the action preference that never picks showContextMenu unnamed, the per-verb capability law — key / click --at refused with the probe rows when no wired injection backend exists, click @ref / type never gated by injection), the BOUNDED subprocess over fake helpers (a hung helper is SIGKILLed at the wall and answers helper_timeout with the child dead; garbage ⇒ helper_error; a missing interpreter ⇒ python3_missing; a11y_unavailable passed through), the engine over a fake keeper (one holder per window, not_attached / window_leased, refs per snapshot, the audit line without text) and the routes' status map; then a REAL leg on this box's own Xvfb + the GTK fixture through the real helper — refs minted from the real tree with the census printed, click @ref changing the app's state as read back from ITS tree, the label-drawn button refused node_has_no_action with AND without an injection backend, type through EditableText, ctrl+s and a canvas point click landing (the app's own witness labels) and both refused with the probe when xdotool is taken away, a PNG screenshot of the frame — SKIPs with evidence without python3-gi/Atspi/Gtk or Xvfb; takeover r2: a desktop-app BROWSER is refused by row, exec name, launcher program or running exe (the measured fixture scripts/fixtures/window-targets/browser-execs.json, this box's installed browsers, a shell copy named `chrome`; gedit / chromium-thumbnailer / infobrowser controls; the r1 rule in a patched engine copy is the negative control) LANE E VERIFY R2: deterministic race legs + the PER-SITE census (every held()/heldOrUnlink(/stillHeld( call removed alone turns a leg red), reach_unreadable (a throwing Task Group store keeps the lease; control: the fold-to-[] copy), the cancellable injection (a takeover / revoke kills the lease's own child and releases the held keys — real-display leg + a no-release control; control: cancelActs neutered), TYPE_MAX × delay fits the scaled timeout.
  { name: 'test-browser-fit', tier: 'heavy', why: 'slow — 79.2 s in-process: the real browser-stream bridge + keeper over fake CDP / stream upstreams on real timers' }, // LANE S4 (naive study 2 — "实况画面只占窗格上面一截", the phone's desktop-width strip, the blank-white picture): the PURE pane → viewport rules (src/browser-fit.js: CSS px never device px, the aspect kept at a bound, the headed floor, THE RULE — the holder's pane while somebody drives, else the largest visible — the verdict with agent-set ⇒ letterbox / force / restore, OUR mirror vs the AGENT's over the MEASURED 0.38.1 shapes in scripts/fixtures/browser-stream/fit-0.38.1.json, the picture clocks, the pinch transform a tap maps through) + the trailing frame gate; the REAL bridge over a fake upstream (the rule end to end, the late viewer's fit replay, the headed re-fit, the restore after the grace and its cancel, a failed size said and not re-asked, a restarted browser set again, THE TRAILING FRAME, THE FRESH FRAME after a navigation and on `refresh`); the REAL keeper's setViewportFor never starting a browser + the CDP captureFrame over a fake endpoint; client wiring pins; patched-copy controls (device px, no holder rule, no trailing frame, no own-mirror recognition, no fresh frame, no first-picture re-check); verify r1: two viewport sets in flight judged by the daemon's ORDER (both orders of the race, the agent's choice put back), the restore deferred mid-turn, the page-size note across a new bridge + a stale note healed, the hider observer + the phone split-rule pins, two more controls (no-outcome, no-defer); verify r1 continuation: the order judged when the mirrors land AFTER our call returned (both late ⇒ judged at our result; ours late ⇒ still ours through `prevOwn`), a size the page did not take said once as unavailable, a noted agent choice on a headed floor kept, OUR resize as ONE `viewer-fit` trace row, the real keeper's note on disk read back by a new keeper, five more controls (13). ~50 s, no chromium
  { name: 'test-browser-ephemeral', tier: 'heavy', why: 'slow — 89.3 s: the real keeper, routes and shipped vibespace-browser over a fake agent-browser whose daemons are real `sleep`s, plus fake-Chrome identity legs' }, // BROWSER TAKEOVER C3 (design-browser-takeover §5 T3, D2/D7/D8): the MANAGED EPHEMERAL browser — PURE record shape / set exclusion / the ceiling counting ephemerals + the desktop-app count seam (`browser_cap` naming every holder; a named start keeps `cap`, control) + the REAL keeper, routes and shipped CLI over a fake agent-browser: first verb ⇒ ONE record (ns vs-<key>), ONE lease `ephemeral`, ONE audit line, /resolve kind:'ephemeral' with the session's EXACT pairs (the browser-env resolver never asked), reuse, idle-out = stopped + relaunch, the live-view port PARITY with the legacy path, takeover pause, fork/child records, conversation death ⇒ record removed (a named profile never), the 7th conversation refused, runaway park, restart adoption; r2: every /resolve kind names the keeper's socket root (rung H only hostSocketBase) and a decoy SOCKET_DIR + XDG through the shipped CLI lands on it (the r1 table beside a CLI copy is the control). ~6 s, port 0, scratch dirs + an isolated HOME r3: the keeper launches a config-less browser with its named file, /resolve names the same `config`, a command from a directory holding its own agent-browser.json runs with it; the pre-r3 keeper in a patched copy is the control. r4: the keeper names its own machine*.json only while lstat says it is its regular file with its content (a swapped-in symlink / an edit re-written; the r3 existsSync check in a patched copy is the control). lane H ④: the ephemeral is a HOLDER ROW (digest + status `leases`, `browserLive`), its start/verb/stop are seam events that HOLD the verb until the recorder armed, `browser_stopped` without a CLI ask, the REAL recorder taps it with no viewer (boot too); a mutant-copy keeper dropping the row is the control. verify r1: a dead ephemeral is judged by its PROCESS before the tick (0 CLI asks) and the REAL bridge's upstream close takes its row out at once; only the verb that started the browser waits for the arming (stuck ⇒ the next verbs 0 ms; a failed arming backs off); `detach` on an ephemeral is an ephemeral seam event that retires it now and says so; naive study 2: a sub-agent's browser is tapped under its OWN pairs (`~child:`, the real bridge) and recorded; each with a mutant-copy control. ⑤ the keeper is the ONLY launcher of a profile browser (CDP, never the directory; every call repeats the launch view) and a view never starts one, over a fake binary that behaves like 0.38.1 (per-session daemons, a held profile lock, launch-view restarts), three mutant-copy controls.
  { name: 'test-ci-heavy-launch', tier: 'heavy', why: 'slow — 131.2 s: eight real `--heavy-launch` runs, each a worktree + build + a suite, plus the supersede / lock / crash A/Bs; the ONE push-blocking pin (the launcher detaches and its child writes a verdict) stays fast as test-ci-gate §10, in a stub repository' },
  // ── MOVED FROM FAST (lane fast-budget, 2026-10-04) — the Actions fast job was cancelled at its 15 min on .202/.203/.205:
  // 792 s of suites serial, 15 of them over 10 s. Each row below measured over THE TIER RULE's 10 s, and its cost is real
  // clocks, real children or real workers the suite exists to judge; the accidental costs were fixed instead (peer-text-census,
  // jobs-browser, bridge-liveness, browser-builds — their rows above say how).
  { name: 'test-reset-credit-ui', tier: 'heavy', why: 'slow — 64 s in-process (the row said 340 ms; lane fast-budget measured it): a real codex wrapper + stub app-server children, process-group walls (2.9 s each), the spend ledger\'s 500 ms flush awaited between engine boots, a 100-step parity walk on the real engine — real clocks throughout' }, // docs/design-reset-credits.zh.md §5 (p2): the manual use — the PURE dialog sentences, the roster chip (claude disabled WITH its reason), the route over the REAL engine + a stub wrapper (not_supported by name / no_live_session / ONE verb through the authorizer / cooldown / no_credits / spend_refused / agent refused / a person's failure reported, never laddered) with patched-copy controls, and the three entry points calling ONE dialog
  { name: 'test-browser-windows', tier: 'heavy', why: 'slow — 50 s in-process (the row said 9.0 s; lane fast-budget): the real bridge over a fake stream server on real clocks — the 135-step seeded walk (11 s) and the B-d635 missed-ask legs (4–6 s each)' }, // lane browser-windows (2026-10-01): the live view's tab chips (driving: bring forward / switch; watching: the view moves), a tab on show that paints nothing for 2 s said + polled (U0b, userW's inc-muqdohf0-hkjc), every chip act journaled; a patched-copy control; verify r1 (48): ④ no capture without a viewer + the frame facts clear a lying page (a control), ③ THE WINDOW-OWNERSHIP TABLE (43 cells actor × target × act off the real modules, a patched-copy control per rule R1–R9, the R7 order pin, the T2 ⑧ wiring pin)
  { name: 'test-browser-cli-pin', tier: 'heavy', why: 'slow — 35 s in-process (the row said 4 s; lane fast-budget): the real keeper over a fake npm — real child processes with 2.5 s delays, hung npm groups stopped at the step\'s wall clock (control (f) waits 3 × 5 s to prove the unbounded copy never frees the slot), re-attached real `sleep` steps' }, // LANE BROWSER-ADMIN 2b: THE BROWSER CLI VERSION VibeSpace drives (`browser.cli` path | pinned | x.y.z) — PURE (the modes, the install verdict, the native naming, the pin file's rule, THE resolve rung order: the pinned install FIRST, a missing / shim pin skipped), the REAL keeper over a fake npm + the shared fake agent-browser (ONE `npm install --prefix <data>/browser-tools/agent-browser-<v> --no-save --ignore-scripts` in THE slot cloak's install uses — never two at once —, verified off the folder AND the program's own --version, the pin file following the setting, the runtime running the pinned binary, a restart mid-install re-attaching), the agent CLI + browser-env reading the pin, the routes (an agent token refused on both installs), the words en/zh/ja, two patched-copy controls; scratch only, port 0, no download
  { name: 'test-exit-run', tier: 'heavy', why: 'slow — 12.5 s (25 s before lane fast-budget\'s single-sample controls; the row said 4.8 s): judges the secret-shape regexes on the CLOCK at ×8 input (hrtime ratios, each quadratic control ~1.5 s) — a clock witness, so it is a SERIAL row' }, // the owner\'s four "exit 1 · 0.0 s" cards on a paired Windows box: the hub chose the shell (sh -lc), the daemon folded ENOENT into code 1, nothing showed the output
  { name: 'test-browser-kept', tier: 'heavy', why: 'slow — 17 s in-process (the row said 2.5 s; lane fast-budget): the real keeper and routes on real clocks — the ⑭e / ⑭f rebind waits (1.7–3.2 s each)' }, // LANE BROWSER-RESUME chunk A (design-agent-browser-v2.zh.md §3.9, the owner's ruling 1 2026-09-30 "state survives the process"): PURE src/browser-kept.js (the kept tab list web-only + a page's title through the name door, the stop-time relay × CDP merge, D2's restore table, the limits, D1's end verdict incl. endsAtTerminate, no cache path touches a login, THE BOUND + a seeded 100-conversation × 60-round walk), browser-profiles (the kept directory in the config, never beside a fence; the unpin; `adopt_not_yours`), browser-env on a scratch data dir (0700 kept dir at spawn, the fence said once, the sweep spares a kept dir + an unreadable store spares all, keyNamed sees a tabs-only key), the ORCH store (D2 before/after the agent's close, Forget refused while running, a registered dir left in place, corrupt set aside, the sweep's ends + cache trim + LRU removal on real dirs, 100 real dirs under a fake du, the shutdown flush), the REAL keeper over a fake 0.38.1 + a real browser-env (the record on its kept dir, relay tabs, the CDP read at a stop, the idle-out, the agent's close via its audit, a detach keeps the entry, a helper keeps nothing, a boot finds a dead one ⇒ restart), the routes (agent token refused, kept_live, not_kept, the housekeeping strip), 3 patched-copy controls · CHUNK B (the owner's ruling 2): ⑧ PURE resumeVerdict (every refusal by name) / resumePlan (the first page into the launch tab only, new tabs in order, never a `tab close`) / the note belted like peer text / the frame bounded / the `continue` cause never delivered; ⑨ the real keeper over a fake browser that keeps TABS: D2 at the next start (reopened in order, the tab on show switched back to BY ITS TARGET ID), a deliberate stop's tabs waiting + told `kept`, the agent's `resume` as new tabs, the user's Resume stamping no verb and told once, a failing tab named, the hand-back = one stash entry + one card and NOTHING delivered (no turn, no notice), a failed stash moving the note onto the next command; ⑩ the routes (agent token 403, the panel's key Resume resolving the live session, the resolve's restored / kept / resumed, the agent's resume refusals); ⑪ controls: a plan that navigates the current page, an announcer that announces `continue`, a keeper that reopens the tabs twice when two commands race into one start
  { name: 'test-windows-device-fs', tier: 'heavy', why: 'slow — 16 s (the row said 3.0 s; lane fast-budget): REAL device agents as fake-Windows children — the shell probe\'s 3 s bound runs out on a hung sh, twice' },
  { name: 'test-vnc-view', tier: 'heavy', why: 'slow — 15 s in-process (the row said 5.3 s; lane fast-budget): src/vnc.js\'s own clipboard give-up (3 s / 3.4 s) and reconnect waits (1.3 s each) on real clocks over the stand-in X server — still no real X server' }, // the shared picture view: inc-mtdrm922's counter-zoom rule, the grep census that vnc-view.js is the ONE noVNC surface, and desktop-window.js byte-for-byte against the RETIRED file (the sanitized-git control; ONE deliberate change named — the plain-http copy chip), §5 the Paste flow's paste box (2.369.136, now the shell's), §6 the desktop-side copy on plain http — fake DOM + fake RFB, ~3s
  { name: 'test-desktop-stream-keepalive', tier: 'heavy', why: 'slow — 11.5 s in-process (the row said 2.8 s; lane fast-budget): a live viewer reading at 512 KiB/s behind a full queue (4.2 s) and the pong-only control cutting it (3.6 s) — throughput on real clocks' }, // 2.369.118 (userW inc-mu3lmd4s-dmwf): the desktop bridge pings every PING_MS, terminates a silent peer after two rounds and NAMES every close (real ws client + a TCP stand-in server, ~1s); the singleton Desktop walks the reconnect ladder; 2.369.156 r7 §5: the held-bytes cap — a viewer declaring a 2 GiB packet is closed 1009 packet-too-large in its first chunk with memory bounded, the other viewer untouched (control = the uncapped bridge, ~3s)
  { name: 'test-agentd-worker-pool', tier: 'heavy', why: 'slow — 11.2 s in-process (the row said 9 s; lane fast-budget): real Worker threads wedged past their deadlines (2.5–3.2 s per control) and the crash back-off on real clocks' },
  { name: 'test-scratch-reaper', tier: 'heavy', why: 'slow — 11.6 s (the row said 5.3 s; lane fast-budget): real victim processes signalled TERM → grace → KILL (graces 0.3–2.5 s) and two real node sweeps contending for the lock (one waits its 1 s bound)' },
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
// is a suite in flight, possibly another lane's. (B-1d08, 2026-09-29: the
// ROOT's OWNER is now on record and every rule needs the stale floor — see
// "THE REAPER JUDGES BY THE ROOT'S OWNERSHIP EVIDENCE", the block above judgeScratch.)
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
// B-1d08 (2026-09-29): each argv claim also says whether the path goes ON beneath the root (`<root>/…`) — the only
// proof a bare argument carries that the root was a DIRECTORY once it is gone (`/tmp/vs-checkheavy.txt` never was).
// verify r2 (R4): A PATH IS NORMALIZED BEFORE THE SHAPE IS READ. `<gone>/../<live>/x` (an env value or an argument with a
// literal `..`) named the GONE root — the shape is anchored at the start of the string — so a process of a live run rooted
// there was grouped under a root its owner is alive nowhere, and once reparented and old it was the dir-gone rule's.
// `..`, `.` and `//` fold (the kernel's cwd is canonical already; strings are not); a trailing slash is kept.
const normPath = (x) => { const s = String(x || ''); return s.startsWith('/') ? path.posix.normalize(s) : s; };
// an argv element / word: an optional `<flag>=` head, then the value — only the value is a path
const normArg = (s) => { const eq = s.startsWith('/') ? -1 : s.indexOf('='); const head = eq >= 0 ? s.slice(0, eq + 1) : ''; return head + normPath(s.slice(head.length)); };
function argvScratchClaims(argv = [], { joined = argv.length <= 1 } = {}) {
  const out = [];
  const take = (r, slash) => { if (!PRODUCT_ROOT_RE.test(r) && !out.some((c) => c.p === r + slash)) out.push({ p: r + slash, via: 'argv', dir: false }); };
  for (const a of argv) {
    const s = String(a || '');
    if (joined) { for (const tok of s.split(/\s+/)) for (const m of normArg(tok).matchAll(/(?:^|=)(\/tmp\/vs-[A-Za-z0-9._-]+)(\/|$)/g)) take(m[1], m[2]); }
    else { const m = /^(?:[^\s=]+=)?(\/tmp\/vs-[A-Za-z0-9._-]+)(\/|$)/.exec(normArg(s)); if (m) take(m[1], m[2]); }
  }
  return out;
}
/** The scratch roots named in the arguments (lane N), in order, de-duplicated. */
export function argvScratchRoots(argv = [], opts = {}) {
  const out = [];
  for (const c of argvScratchClaims(argv, opts)) { const r = SCRATCH_ROOT_RE.exec(c.p)[0]; if (!out.includes(r)) out.push(r); }
  return out;
}
export const REAP_NAMES = new Set(['node', 'npm', 'claude', 'codex', 'opencode', 'Xvfb', 'Xvnc', 'Xtigervnc', 'x11vnc', 'xmessage', 'esbuild', 'dtach']); // Xtigervnc (lane N 2026-09-25, the heavy RED on 69720f2b): the singleton Desktop's X server by its own argv[0] (`Xvnc` is only Debian's symlink) — a leaked `Xtigervnc :7` under a GONE scratch dir held the machine-global :7/5901 for the next run to adopt (observed: cwd a deleted /tmp/vs-deskapp-smoke-*, adopted 40 s later by another run's server; test-ci-gate §9b)
/** The environment names that ROOT a process (besides its cwd and a Chrome's --user-data-dir). */
export const ROOT_ENV = ['HOME', 'VIBESPACE_DEVICE_ROOT', 'VIBESPACE_AGENTD_ROOT', 'AGENT_BROWSER_SOCKET_DIR', 'AGENT_BROWSER_PROFILE', 'AGENT_BROWSER_CONFIG'];
// B-60d2 (2026-10-07): A PRIVATE SESSION BUS's runtime dir roots its helpers too — dpi-measure's dbus-run-session /
// xdg-desktop-portal / gvfsd under /tmp/vs-work/dpi-measure/run-*/ carry it beside HOME, and held the dir after their run.
ROOT_ENV.push('XDG_RUNTIME_DIR');
/** …and the ones that name a DIRECTORY by what they mean (AGENT_BROWSER_CONFIG names a file: it proves a directory
 *  only by going on beneath the root, like a bare argument). */
const DIR_ENV = new Set(['HOME', 'VIBESPACE_DEVICE_ROOT', 'VIBESPACE_AGENTD_ROOT', 'AGENT_BROWSER_SOCKET_DIR', 'AGENT_BROWSER_PROFILE', 'XDG_RUNTIME_DIR']);
/** Every scratch root a process NAMES, with where (`via`: cwd / an env name / --user-data-dir / argv) and whether the
 *  naming itself proves the root is a DIRECTORY (`dirProof`: a cwd, a directory-typed env name or flag, or a path that
 *  goes on beneath the root). In order (cwd, ROOT_ENV, --user-data-dir, the argv roots). `joined` = its /proc cmdline
 *  carried NO NUL (a title-rewritten process: the one string is scanned as words); default: a one-element argv. */
export function scratchRootClaims({ cwd = '', cwdGone = null, env = {}, argv = [], joined = argv.length <= 1 } = {}) {
  // verify r2 (R4): THE KERNEL'S OWN MARKER. readlink(/proc/<pid>/cwd) of an unlinked directory is `<path> (deleted)`;
  // when that path IS the scratch root (the isolated tiers run every suite with cwd = the worktree root), r1's
  // segment-boundary rule read the space after the name as "not the shape" and the process named NO root — the reaper's
  // very target (a stray left with cwd in a removed root) was invisible where the pre-r1 shape had convicted it. The
  // marker is stripped: the root is then judged by whether it exists (gone ⇒ the dir-gone rule, recreated ⇒ its record).
  // verify r3 (T2): the marker is stripped only when the KERNEL says the directory is gone (`cwdGone` from procInfo's stat:
  // nlink 0; a string-only caller passes nothing and the marker is trusted) — a directory literally named `… (deleted)`
  // (nlink > 0) keeps its name, which the shape does not cover, so it names no root (it convicted a live process). And a cwd
  // the kernel says is gone is a GONE root whatever the path holds now: the claim carries `gone`, so a NEW run's record at
  // the same path (the dbg-*.mjs fixed names, /tmp/vs-fixtest twice over) never spares the OLD run's stray in the deleted inode.
  const cwdStr = String(cwd || ''), cwdDel = / \(deleted\)$/.test(cwdStr) && cwdGone !== false;
  const cands = [{ p: cwdDel ? cwdStr.replace(/ \(deleted\)$/, '') : cwdStr, via: 'cwd', dir: true, gone: cwdDel }, ...ROOT_ENV.map((k) => ({ p: env[k], via: k, dir: DIR_ENV.has(k) }))];
  for (let j = 0; j < argv.length; j++) {
    const a = String(argv[j] || '');
    if (a.startsWith('--user-data-dir=')) cands.push({ p: a.slice('--user-data-dir='.length), via: '--user-data-dir', dir: true });
    else if (a === '--user-data-dir' && j + 1 < argv.length) cands.push({ p: argv[j + 1], via: '--user-data-dir', dir: true });
  }
  if (joined) for (const m of argv.join(' ').matchAll(UDD_JOINED_RE)) cands.push({ p: m[1], via: '--user-data-dir', dir: true });
  cands.push(...argvScratchClaims(argv, { joined })); // lane N: a root named only in the arguments (dtach / pty-wrapper)
  const out = [];
  for (const c of cands) {
    const s = normPath(c.p), m = SCRATCH_ROOT_RE.exec(s); // verify r2 (R4): the shape is read off the normalized path
    if (!m || PRODUCT_ROOT_RE.test(m[0])) continue;
    // verify r1 (K1): the shape ends at a path-segment boundary. `/tmp/vs-a+b/sub` (an EXISTING directory whose name goes on
    // with a character the shape excludes) used to claim the root `/tmp/vs-a` — gone, cwd-proven — and a reparented process
    // rooted there was convicted after the floor. A name the shape does not cover names no scratch root at all.
    const next = s.charAt(m[0].length); if (next && next !== '/') continue;
    const proof = c.dir || next === '/';
    // B-60d2: A VERIFY WORKSPACE'S LANE DIR IS ITS OWN ROOT — /tmp/vs-work/<lane>, never the shared workspace, so one
    // live lane there no longer spares every other lane's orphans (and the directory sweep judges the same unit)
    const sub = m[0] === WORK_ROOT ? /^\/([A-Za-z0-9._-]+)(?:\/|$)/.exec(s.slice(m[0].length)) : null;
    const root = sub ? `${m[0]}/${sub[1]}` : m[0];
    const seen = out.find((o) => o.root === root && o.via === c.via);
    if (seen) seen.dirProof = seen.dirProof || proof; else out.push({ root, via: c.via, dirProof: proof, gone: !!c.gone });
  }
  return out;
}
/** Every scratch root a process names, in order, de-duplicated (the roots of scratchRootClaims). */
export function scratchRootsOf(info = {}) {
  const out = [];
  for (const c of scratchRootClaims(info)) if (!out.includes(c.root)) out.push(c.root);
  return out;
}
// B-60d2: a PRIVATE SESSION BUS a suite or a measurement started (dbus-run-session and what it activates) is a suite's
// executable too — rooted under a scratch dir by HOME / XDG_RUNTIME_DIR, never the owner's desktop (rooted in ~ and /run/user)
export const SESSION_BUS_HEADS = ['dbus-', 'xdg-desktop-por', 'xdg-document-po', 'xdg-permission-', 'gvfs', 'at-spi'];
const reapNamed = (a0) => REAP_NAMES.has(a0) || a0.startsWith('vibespace-devic') || a0.startsWith('chrome') || SESSION_BUS_HEADS.some((h) => a0.startsWith(h));
// verify r2 L3: a process answers to its argv[0] (the first whitespace token — a title-rewritten Chrome's argv is one
// string) OR its /proc comm (/usr/bin/google-chrome's comm is `chrome`); never comm alone (the claude CLI's comm is its version)
const reapNamedProc = (i) => reapNamed(i.a0) || (!!i.comm && reapNamed(i.comm));
const REAP_STALE_MS = 10 * 60 * 1000; // = src/fixture-guard.js FIXTURE_STALE_MS (a run in flight is never older)
function procRead(procRoot, pid, f) { try { return fs.readFileSync(path.join(procRoot, String(pid), f)); } catch { return null; } }
function procInfo(procRoot, pid, bootMs = procBootMs(procRoot)) {
  const st = procStat(pid, procRoot); if (!st) return null;
  const { ppid, starttime, state } = st;
  const raw = (procRead(procRoot, pid, 'cmdline') || Buffer.alloc(0)).toString('utf8').replace(/\0+$/, '');
  const argv = raw.split('\0').filter((x, i) => i === 0 || x);
  const joined = !raw.includes('\0'); // verify r3: no NUL = a title-rewritten cmdline (read as words); else exact argv
  const first = argv[0] ? String(argv[0]).split(/\s+/)[0] : '';
  let comm = ''; const cb = procRead(procRoot, pid, 'comm'); if (cb) comm = cb.toString('utf8').trim();
  const a0 = first ? path.basename(first) : comm;
  let cwd = ''; try { cwd = fs.readlinkSync(path.join(procRoot, String(pid), 'cwd')); } catch { }
  // verify r3 (T2, 2026-09-30): THE KERNEL'S MARKER IS READ WITH THE KERNEL'S STAT. readlink says `<path> (deleted)` for an
  // unlinked cwd — and for a directory a person literally named so (measured: nlink 2, the marker is the name). stat through the
  // magic link tells them apart: an unlinked directory has nlink 0 (ENOENT under a fake table whose target is gone); a name with
  // the marker is linked. `cwdGone` is that fact; the claim reader strips the marker only when the kernel says the dir is gone.
  // verify r4 (X2b, 2026-09-30): THE STAT IS ASKED ONLY WHERE ITS ANSWER IS USED. stat through the magic link reaches the cwd's OWN
  // filesystem: on a FUSE / NFS mount whose daemon or server hangs the call blocks in D state — SIGTERM does not end such a wait, and a
  // frozen bindfs held the judge until SIGKILL (measured) — and r3 asked it for EVERY (deleted) cwd on the box, so one shell left in a
  // removed worktree on the hung workspace mount would have hung every fast tier's sweep (under the reaper lock: every other sweep
  // skipping) and `--reap` with it. A cwd the scratch shape does not cover names no root whatever the marker means, so the stat is
  // confined to the shape (/tmp — a hung mount a suite itself put under its own root is the residual, stated).
  let cwdGone = null;
  if (/ \(deleted\)$/.test(cwd) && SCRATCH_ROOT_RE.test(cwd)) { let st = null, code = null; try { st = fs.statSync(path.join(procRoot, String(pid), 'cwd')); } catch (e) { code = e && e.code; } cwdGone = st ? st.nlink === 0 : code === 'ENOENT'; }
  const env = {}; const eb = procRead(procRoot, pid, 'environ');
  if (eb) for (const kv of eb.toString('utf8').split('\0')) { const i = kv.indexOf('='); if (i > 0) env[kv.slice(0, i)] = kv.slice(i + 1); }
  // B-442c (2026-10-02): THE KERNEL'S BIRTH TIME (btime + starttime, scratch-run.mjs procBornMs). The /proc/<pid> dir's mtime is
  // when procfs last instantiated the inode — after the 16:23 OOM's dentry eviction every one read "now" and hour-old orphans were
  // spared as "young: 42 s". A table that states no btime (the fixtures' fake roots) keeps their convention, the dir's mtime: on a
  // real /proc that reading is never OLDER than the truth, so it can only spare, never convict early.
  let bornMs = procBornMs({ starttime }, bootMs);
  if (bornMs == null) try { bornMs = fs.statSync(path.join(procRoot, String(pid))).mtimeMs; } catch { }
  return { pid, ppid, state, starttime, a0, comm, argv, joined, cwd, cwdGone, env, bornMs };
}
// ── B-1d08 (2026-09-29): THE REAPER JUDGES BY THE ROOT'S OWNERSHIP EVIDENCE, NEVER BY A NAME ──────────────────
// Three incidents in one day: ① two lanes' fast tiers ran at once and one run's sweep reaped a stray the other run's
// suite had just planted under a scratch dir it had already removed (exit 144); ② a coordinator's
// `node scripts/ci.mjs --check-heavy > /tmp/vs-checkheavy.txt` was killed by a lane's fast tier — a FILE with the
// scratch shape was read as a root; ③ (the target, kept) a finished verifier's scratch server left 15
// `vibespace-device` daemons re-parented to systemd for an hour. So a candidate is convicted only on THREE facts:
//   (a) THE ROOT IS A DIRECTORY under the scratch prefix: one that exists (a real directory, ours — never a file, a
//       symlink or another user's), or a gone one the process's own naming proves was a directory (its cwd, HOME /
//       the device + agentd roots / the agent-browser socket + profile dirs, --user-data-dir, or a path going on
//       beneath the root). A file, a bare string or a lookalike is never a root;
//   (b) ITS OWNER IS GONE: the run record `<root>/.vs-run.json` (scripts/scratch-run.mjs — written by scratch.mjs
//       `scratchDir` / `scratchHome`, mutant-copy's dirs and this file's scratch worktrees) names a process that is no
//       longer that process (pid gone, reused — another starttime —, a zombie, another boot), or the dir is gone with
//       its record. A process naming ANY root whose owner is alive — any run's, not only this one's — is never a
//       candidate, whatever else it names;
//   (c) IT IS OLD: at least the fixture stale floor (a run in flight that removed its dir first, or a stray a suite
//       planted on purpose, is younger). Plus, as before, nobody alive outside the root owns it (the parent walk).
// An EXISTING directory WITHOUT a run record (a suite that predates it, a dir minted by hand) keeps the pre-record
// rule — every member unowned AND stale, and then only the known executables: the owner is unknown, so the name is
// the one extra fact. `judgeScratch` returns every verdict (victims / spared / ignored, each with its evidence), and
// the sweep itself is serialised machine-wide by `acquireReaperLock` (below).
function rootKindOf(r, exists) {
  let st = null, err = null;
  try { st = fs.lstatSync(r); } catch (e) { err = e; }
  if (exists && !exists(r)) return { kind: 'gone' };
  if (!st) {
    if (exists) return { kind: 'dir' }; // declared present by the caller (a test's fake root)
    return err && (err.code === 'ENOENT' || err.code === 'ENOTDIR') ? { kind: 'gone' } : { kind: 'other', why: `unreadable (${err && err.code})` };
  }
  if (st.isSymbolicLink()) return { kind: 'other', why: 'a symlink, not a directory' };
  if (!st.isDirectory()) return { kind: 'other', why: 'a file, not a directory' };
  if (typeof process.getuid === 'function' && st.uid !== process.getuid()) return { kind: 'other', why: `another user's directory (uid ${st.uid})` };
  return { kind: 'dir' };
}
// A TEST'S OWN PROCESS TABLE (B-1d08): `VIBESPACE_CI_REAP_PROCFS=<dir>` makes a tier's sweeps judge a fake /proc the
// test built — test-ci-heavy-launch §6 proves the heavy tier's LANES sweep between suites without planting a real stray
// under a removed root (which any sweep on the box, on this code or older, could take). Only the pids listed there are
// ever signalled, each re-checked against the same table. Unset = the machine's /proc.
// VERIFY r1 (K7, 2026-09-29): THE SEAM IS A TEST'S, SO IT IS HELD TO THE TEST'S OWN GROUND. The value was taken as
// given: a table anywhere, missing or not. Reproduced on the real `--reap`: a table under the lane's HOME naming a
// real pid (starttime 12345 — never its own) under a gone root, 30 min old, and the real, owned, claim-less `sleep`
// behind that number was SIGKILLed with nothing printed about a fake table; a table that did not exist made every
// sweep of a tier a silent `[]`. GIT_ENV carries the variable to every suite and to the detached heavy child, so one
// `export` in a pusher's shell reaches every real tier. Now: the table must be a directory under a `/tmp/vs-*` scratch
// root (src/fixture-guard.js's shape — the one place a real run is never pointed at), else the sweep is REFUSED by a
// thrown error the tier prints per suite and `--reap` prints and exits 2 on; and every sweep under a seam says so first.
// VERIFY r2 (R2, 2026-09-29): A SEAM LISTS, IT NEVER SIGNALS. The r1 rule bounded WHERE the table may be, not what it
// may do: reproduced on the real `--reap` with a table under an ACCEPTED scratch root naming a real, owned, claim-less
// `sleep` (starttime 12345 — never its own) under a gone dir, 30 min old — SIGKILLed, "reaped 1 of 1". The signal's
// identity re-check reads the SAME table (`sameProcess` over the seam), so a fake row can never fail it, and under a seam
// every real root's record reads owner-dead too (its pid is looked up in the fake table). A seam's word about a pid is not
// the kernel's: under VIBESPACE_CI_REAP_PROCFS a sweep judges, prints every victim with its evidence and returns the list —
// and signals NOTHING (the seam line says so; `--reap` closes with "none signalled"). Only an in-process caller that hands
// the table in (`procRoot`, a test's own call — unreachable from any environment) is signalled from a fake table.
export function procRootSeam() {
  const v = process.env.VIBESPACE_CI_REAP_PROCFS;
  if (!v) return null;
  // verify r2 (R1): the REAL path is what is judged — `path.resolve` is lexical, so a symlink under /tmp/vs-* to a table
  // elsewhere (the lane HOME, a checkout's data/) and a symlinked component were both "under a scratch root" by name
  let p; try { p = fs.realpathSync(v); } catch { p = path.resolve(v); }
  const m = SCRATCH_ROOT_RE.exec(p);
  if (!m || PRODUCT_ROOT_RE.test(m[0])) throw new Error(`VIBESPACE_CI_REAP_PROCFS=${v} refused${p !== path.resolve(v) ? ` (it resolves to ${p})` : ''}: a fake process table is judged only under a /tmp/vs-* scratch root (src/fixture-guard.js) — nothing is judged, nothing signalled`);
  let st = null; try { st = fs.statSync(p); } catch { }
  if (!st || !st.isDirectory()) throw new Error(`VIBESPACE_CI_REAP_PROCFS=${v} refused: not a directory — a seam naming a table that is not there is a misconfiguration, never "nothing to reap"`);
  // verify r2 (R1): a seam is a LIVE test's — the scratch root it sits under must have a live owner (its run record, judged
  // on the real kernel); a table a finished run left behind (root still there, its owner dead or never recorded) was
  // accepted and a real tier under it judged nothing but that stale table
  const own = seamOwner(m[0]);
  if (!own.alive) throw new Error(`VIBESPACE_CI_REAP_PROCFS=${v} refused: its scratch root ${m[0]} has no live owner (${own.why}) — a seam is a live test's; a table a finished run left behind judges nothing`);
  return p;
}
const seamOwner = (root) => { const rec = readRunRecord(root); return rec ? runOwnerState(rec) : { alive: false, why: 'no run record' }; };
export const defaultProcRoot = () => procRootSeam() || '/proc';
const seamLine = (p) => `[ci] scratch reaper: judging the FAKE process table ${p} (VIBESPACE_CI_REAP_PROCFS, a test seam) — its verdicts are listed and NOTHING is signalled (a seam is dry)`;
const seamDryLine = (n) => `[ci] scratch reaper: ${n} victim(s) listed under the test seam, none signalled (verify r2 R2: a table's word about a pid is not the kernel's)`;
const fmtAge = (ms) => (ms == null ? '?' : ms >= 60000 ? `${Math.round(ms / 60000)} min` : `${Math.round(ms / 1000)} s`);
/** EVERY VERDICT of a sweep, PURE over a proc root (a test drives a fake one): `victims` (what a sweep would reap,
 *  each with its evidence — root, via, rule, owner, age), `spared` (candidates it would not, and why) and `ignored`
 *  (processes naming the scratch shape where there is no root: a file, a symlink, a gone path never shown to be a
 *  directory). `now` / `staleMs` / `exists` / `readRecord` / `bootId` are parameters for the same reason. */
export function judgeScratch({ procRoot = defaultProcRoot(), now = Date.now(), staleMs = REAP_STALE_MS, exists = null, readRecord = readRunRecord, bootId, self = process.pid } = {}) {
  const res = { victims: [], spared: [], ignored: [], roots: new Map() };
  let pids = [];
  // verify r4 (X4c, 2026-09-30): A TABLE THAT CANNOT BE READ IS SAID. r1 (K7) refused a seam naming no table; one that vanished AFTER the
  // seam was accepted (mid-sweep) read as an EMPTY sweep — the announce line, then silence, indistinguishable from a clean box. The throw
  // reaches the tier's and the launcher's catch sites ("scratch reaper skipped: …"), `--reap` prints it and exits 2 on both paths, and the
  // sweep's `finally` releases the lock.
  try { pids = fs.readdirSync(procRoot).filter((d) => /^\d+$/.test(d)).map(Number); } catch (e) { throw new Error(`the process table ${procRoot} could not be read (${(e && e.code) || e}) — nothing judged, nothing signalled (a test seam whose table vanished is a misconfiguration, never "nothing to reap")`); }
  const infos = new Map();
  const bootMs = procBootMs(procRoot);
  for (const pid of pids) { const i = procInfo(procRoot, pid, bootMs); if (i) infos.set(pid, i); }
  const systemd = new Set([1, ...[...infos.values()].filter((i) => i.a0 === 'systemd').map((i) => i.pid)]);
  const skip = new Set(); // this process and its ancestors
  for (let q = self; q && infos.has(q) && !skip.has(q); q = infos.get(q).ppid) skip.add(q);
  const boot = bootId === undefined ? machineBootId(procRoot) : bootId;
  // each root is judged ONCE per sweep: its kind, its record, its owner
  const rootInfo = (r) => {
    if (res.roots.has(r)) return res.roots.get(r);
    // verify r3 (T2): a group keyed `<root> (deleted)` is a cwd the KERNEL said is gone (nlink 0) — gone whatever the path holds now
    const k = / \(deleted\)$/.test(r) ? { kind: 'gone' } : rootKindOf(r, exists);
    const ri = { root: r, kind: k.kind, why: k.why || null, record: null, owner: null };
    if (k.kind === 'dir') { ri.record = readRecord(r); if (ri.record) ri.owner = runOwnerState(ri.record, { procRoot, bootId: boot }); }
    res.roots.set(r, ri);
    return ri;
  };
  const row = (i, root, via, extra) => ({ pid: i.pid, ppid: i.ppid, name: i.a0, cmd: i.argv.slice(0, 3).join(' ').slice(0, 120), root, via, starttime: i.starttime, ageMs: i.bornMs == null ? null : Math.max(0, now - i.bornMs), ...extra });
  const notARoot = (c) => { const ri = rootInfo(c.root); return ri.kind === 'gone' ? (c.linked ? `${c.root} is not here, but the kernel finds its cwd a linked directory (another mount namespace — not a gone root)` : `${c.root} is gone and its ${c.via} never showed it was a directory`) : `${c.root} is ${ri.why}`; };
  // verify r4 (X2c, 2026-09-30): A LINKED DIRECTORY IS NEVER A GONE ROOT. A process of this uid in another MOUNT namespace prints its
  // cwd as a plain path (measured under `unshare -m`: no marker, no "(unreachable)") that this namespace may not have at all — ENOENT read
  // as "scratch dir gone", and the live process was convicted an hour later. The kernel's stat through the magic link (r3's reader)
  // answers for the directory ITSELF: linked (nlink > 0) = a directory this namespace cannot see — not a root here, never a group.
  // Asked lazily, once per cwd whose root is gone BY PATH, never per process (X2b: a stat through the link can block on a hung mount).
  const linkedElsewhere = (i) => { try { const st = fs.statSync(path.join(procRoot, String(i.pid), 'cwd')); return st.isDirectory() && st.nlink > 0; } catch { return false; } };
  // a process's GROUP is the FIRST root it names that passes (a) — cwd first, as before: a daemon a heavy suite still
  // has in flight under the isolated worktree stays grouped there
  const groups = new Map();
  for (const i of infos.values()) {
    if (skip.has(i.pid)) continue;
    if (i.argv.some((a) => /scripts\/ci\.mjs$/.test(a))) continue; // a gate runner, never a candidate
    const claims = scratchRootClaims(i); if (!claims.length) continue;
    // verify r3 (T2): a claim the kernel marked gone (`gone`) is never the live root that spares, and it is grouped as `<root> (deleted)`
    const live = claims.map((c) => (c.gone ? null : rootInfo(c.root))).find((ri) => ri && ri.owner && ri.owner.alive);
    if (live) { res.spared.push(row(i, live.root, null, { why: `its root's owner is alive (${live.owner.why})` })); continue; }
    for (const x of claims) if (x.via === 'cwd' && !x.gone && rootInfo(x.root).kind === 'gone') x.linked = linkedElsewhere(i); // verify r4 (X2c)
    const c = claims.find((x) => { if (x.gone) return true; const ri = rootInfo(x.root); return ri.kind === 'dir' || (ri.kind === 'gone' && x.dirProof && !x.linked); });
    if (!c) { res.ignored.push(row(i, claims[0].root, claims[0].via, { why: claims.map(notARoot).join('; ') })); continue; }
    const key = c.gone ? `${c.root} (deleted)` : c.root;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ i, via: c.via });
  }
  // verify r2 L7: the judgement runs to a FIXPOINT — a parent outside a group that is itself a victim of this sweep
  // (another gone root's orphan) owns nothing, so its children are listed in the SAME sweep, not the next one
  // verify r3 (LOW 4): bounded by the candidates, never a constant — every round that continues adds a victim, so a chain
  // of N gone groups needs N rounds (a cap of 8 listed 8 of a chain of 10 and left the rest for the next sweep)
  const victimPids = new Set();
  const maxRounds = [...groups.values()].reduce((n, m) => n + m.length, 0) + 1;
  let verdict = { out: [], kept: [] };
  for (let round = 0; round < maxRounds; round++) {
    verdict = judgeGroups();
    const before = victimPids.size;
    for (const o of verdict.out) victimPids.add(o.pid);
    if (victimPids.size === before) break;
  }
  res.victims = verdict.out;
  res.spared.push(...verdict.kept);
  return res;
  function judgeGroups() {
    const out = [], kept = [];
    for (const [root, entries] of groups) {
      const ri = rootInfo(root);
      const members = entries.map((e) => e.i), viaOf = new Map(entries.map((e) => [e.i.pid, e.via]));
      const inGroup = new Set(members.map((i) => i.pid));
      // a member is OWNED when walking its parents (through fellow members) reaches a
      // live process outside the group — a suite, a runner, this process, a user's
      // terminal; reaching systemd/init, a vanished pid or a victim of this very sweep means nobody owns it
      const orphaned = (i) => { let q = i; const seen = new Set(); while (q && !seen.has(q.pid)) { seen.add(q.pid); if (systemd.has(q.ppid)) return true; const p = infos.get(q.ppid); if (!p) return true; if (!inGroup.has(p.pid)) return victimPids.has(p.pid); q = p; } return true; };
      const ageOf = (i) => (i.bornMs == null ? Infinity : now - i.bornMs);
      const at = (i, extra) => row(i, root, viaOf.get(i.pid), extra);
      if (ri.kind === 'gone' || (ri.owner && !ri.owner.alive)) {
        // (b) the OWNER is gone — with its directory, or its record names a process that is no longer it: every
        // member nobody alive outside the group owns, WHATEVER its name, once it is (c) older than the stale floor
        const why = ri.kind === 'gone' ? 'scratch dir gone' : `owner gone: ${ri.owner.why}`;
        const owner = ri.kind === 'gone' ? 'the dir is gone (its run record with it)' : ri.owner.why;
        for (const i of members) {
          if (!orphaned(i)) kept.push(at(i, { why: 'owned by a live process outside the root' }));
          else if (ageOf(i) < staleMs) kept.push(at(i, { why: `young: ${fmtAge(Math.max(0, ageOf(i)))} < the ${fmtAge(staleMs)} stale floor (a run in flight, or a stray planted on purpose)` }));
          else out.push(at(i, { why, rule: ri.kind === 'gone' ? 'dir-gone' : 'owner-gone', owner }));
        }
      } else {
        // an existing directory WITHOUT a run record: only when NO member is owned and all are stale — and then
        // only the executables a suite starts (the owner is unknown, so the name is the one extra fact)
        const live = members.some((i) => !orphaned(i));
        const minAge = Math.min(...members.map(ageOf));
        if (!live && minAge >= staleMs) {
          const why = `orphaned ${Math.round(minAge / 60000)} min (no live suite owns ${root})`;
          for (const i of members) {
            if (reapNamedProc(i)) out.push(at(i, { why, rule: 'no-record', owner: 'no run record (the dir predates it, or was made by hand)' }));
            else kept.push(at(i, { why: 'no run record, and not an executable a suite starts (the name narrows the record-less rule)' }));
          }
        } else for (const i of members) kept.push(at(i, { why: live ? 'no run record, and a member of its group is owned by a live process' : `no run record, and its group's youngest member is ${fmtAge(minAge)} < the ${fmtAge(staleMs)} stale floor` }));
      }
    }
    return { out, kept };
  }
}
/** The orphans a sweep would reap: [{pid, ppid, name, cmd, root, via, why, rule, owner, ageMs, starttime}] — the
 *  `victims` of judgeScratch (PURE over a proc root). */
export function scratchOrphans(opts = {}) { return judgeScratch(opts).victims; }
/** B-60d2: EVERY scratch path a live process names (cwd — a gone one too —, the ROOT_ENV values, every argv element or
 *  word, a `<flag>=` value), normalized, whole — the directory sweep's "held" evidence: a unit is held when one of these
 *  is it or lies beneath it. A zombie names nothing. */
export function liveScratchPaths({ procRoot = defaultProcRoot() } = {}) {
  let pids = [];
  try { pids = fs.readdirSync(procRoot).filter((d) => /^\d+$/.test(d)).map(Number); } catch (e) { throw new Error(`the process table ${procRoot} could not be read (${(e && e.code) || e}) — no directory judged`); }
  const out = new Set(), bootMs = procBootMs(procRoot);
  for (const pid of pids) {
    const i = procInfo(procRoot, pid, bootMs); if (!i || i.state === 'Z') continue;
    const cands = [String(i.cwd || '').replace(/ \(deleted\)$/, ''), ...ROOT_ENV.map((k) => i.env[k]), ...i.argv.flatMap((a) => String(a || '').split(/\s+/).map((w) => w.slice(w.startsWith('/') ? 0 : w.indexOf('=') + 1)))];
    for (const c of cands) { const n = normPath(c); if (SCRATCH_ROOT_RE.test(n)) out.add(n.length > 1 ? n.replace(/\/+$/, '') : n); }
  }
  return [...out];
}
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** THE DIRECTORY SWEEP, where the process reaper runs (after every suite, at every heavy launch, `--reap`): the scratch
 *  dirs nothing live names and nothing wrote for a day (scripts/scratch-sweep.mjs). Never under a fake process table
 *  (a seam's word about who is alive is not the kernel's). `VIBESPACE_CI_DIR_SWEEP=off` skips the tiers' sweeps (a lane
 *  on a box whose reap is the owner's); `--reap` by hand always judges. */
export function sweepDirsNow({ dryRun = false, log = console.log, byHand = false, procRoot = defaultProcRoot(), ...opts } = {}) {
  if (!byHand && process.env.VIBESPACE_CI_DIR_SWEEP === 'off') return null;
  if (procRoot !== '/proc') { log(`[ci] dir sweep: skipped under the fake process table ${procRoot} (a test seam) — no directory judged`); return null; }
  return sweepScratchDirs({ liveRoots: liveScratchPaths({ procRoot }), dryRun, log, keepList: [REPO_ROOT, path.join(REPO_ROOT, 'data')], ...opts });
}
const quietSweep = () => { const lines = []; const r = sweepDirsNow({ log: (l) => lines.push(l) }); if (r && (r.reaped.length || r.failed.length)) console.log(lines.join('\n')); };
/** THE VICTIM LIST, ONE LINE PER PID (B-a965, 2026-09-24): a sweep that named only its
 *  roots left "22 roots / 34 processes" unattributable after a stray `ci.mjs --help`
 *  reaped a lane's detached servers under /tmp/vs-work. PURE over the list. B-1d08: each
 *  line also carries the EVIDENCE that convicted it — the owner's state, the age, what named the root. */
export function reapReport(list) {
  const roots = [...new Set(list.map((o) => o.root))];
  const head = `[ci] reaping ${list.length} scratch orphan process(es) from ${roots.length} finished scratch dir(s): ${roots.slice(0, 4).join(' ')}${roots.length > 4 ? ' …' : ''}`;
  const evidence = (o) => [o.owner && !String(o.why || '').includes(o.owner) ? `owner: ${o.owner}` : '', o.ageMs !== undefined ? `age ${fmtAge(o.ageMs)}` : '', o.via ? `named by ${o.via}` : ''].filter(Boolean).map((x) => ' — ' + x).join('');
  return [head, ...list.map((o) => `[ci]   pid ${o.pid} (ppid ${o.ppid}) ${o.name}: ${o.cmd || o.name} — root ${o.root} — ${o.why}${evidence(o)}`)];
}
/** `--reap --dry-run`: the verdict per candidate with its evidence — every victim (reapReport), every spared
 *  candidate and why, every process naming the scratch shape where there is no root — then one closing line. PURE. */
export function verdictReport({ victims = [], spared = [], ignored = [] } = {}) {
  const lines = victims.length ? reapReport(victims) : ['[ci] no scratch orphans'];
  for (const o of spared) lines.push(`[ci]   spare pid ${o.pid} (ppid ${o.ppid}) ${o.name}: ${o.cmd || o.name} — root ${o.root} — ${o.why}${o.ageMs != null ? ` — age ${fmtAge(o.ageMs)}` : ''}`);
  for (const o of ignored) lines.push(`[ci]   not a root: pid ${o.pid} (ppid ${o.ppid}) ${o.name}: ${o.cmd || o.name} — ${o.why}`);
  lines.push(victims.length
    ? `[ci] --dry-run: ${victims.length} process(es) listed above, none signalled (${spared.length} spared, ${ignored.length} naming no scratch root)`
    : `[ci] --dry-run: nothing to reap (${spared.length} spared, ${ignored.length} naming no scratch root), none signalled`);
  return lines;
}

// ── ONE SWEEP AT A TIME (B-1d08) ─────────────────────────────────────────────
// Two fast tiers may run on this box at once (lanes; the fast tier deliberately does NOT take the heavy machine
// lock), and the heavy tier's lanes sweep concurrently inside one process — so the SWEEP takes a short-lived,
// machine-wide lock: `flock(1)` on a file in the machine's tmp dir, held by ONE child (`sh` opens the file on fd 9,
// flock locks it, then `exec cat` keeps it) until the sweep ends — released by killing that child, and by the kernel
// when the child dies for any reason (this process killed ⇒ cat's stdin reaches EOF ⇒ it exits). Never a
// mkdir + owner file + break rule (lane C's lesson: that scheme is a race). A sweep that cannot get it within
// REAPER_LOCK_WAIT_MS SKIPS and says so — nothing judged, nothing signalled; the sweep that holds it is judging the
// same evidence. Sync (the fast tier's runner, the launcher, `--reap`) and async (the heavy tier's lanes) twins.
export const REAPER_LOCK_WAIT_MS = 5000;
// `VIBESPACE_CI_REAPER_LOCK=<file>`: a test drives its own sweep lock (like VIBESPACE_CI_HEAVY_LOCK for the machine lock)
export const defaultReaperLockPath = () => process.env.VIBESPACE_CI_REAPER_LOCK || path.join(machineTmpDir(), `vibespace-ci-reaper-${typeof process.getuid === 'function' ? process.getuid() : 'u'}.lock`);
// verify r1 (K4): the holder TOUCHES the file once it holds it — the lock is opened for append and never written, so its
// times never moved and systemd-tmpfiles' age rule on /tmp (`q /tmp 1777 root root 10d` on the author's box) would remove
// it while held; a removed lock file admits a second sweep (reproduced: `rm` under a holder, the next taker is granted).
// A lock in use is now never older than its last sweep. (A lock removed by hand still admits one — held, stated.)
// verify r2 (R3): THE HOLDER SAYS WHO IT IS. The touch is now a write of the holder's own pid (`$$` — the sh that exec's
// into cat keeps it), because a skip that named only the FILE left a hung sweep undiagnosable: /proc/locks names the pid
// of flock(1), which has already exited, so the file's content is the one place the holder can be read. Informational
// only — never a break rule (lane C's lesson): the lock is still the kernel's flock, released when the holder dies.
// verify r3 (T6): `command exec` — a redirection that fails on the special builtin `exec` ends a non-interactive sh with ITS exit
// (2 on dash), so a lock file this user cannot open (another uid's file of our name: the root-owned tmpfiles case) read "the lock
// holder exited 2", never the `cannot open` line written for it; under `command` the failure is an ordinary status (dash + bash
// measured: `|| exit 70` runs, the fd persists on success)
const LOCK_HOLDER_SH = 'command exec 9>>"$1" || exit 70; command -v flock >/dev/null 2>&1 || exit 69; flock -w "$2" 9 || exit 75; echo "$$" > "$1" 2>/dev/null; exec cat';
const SH = fs.existsSync('/bin/sh') ? '/bin/sh' : 'sh'; // never a PATH lookup for the shell itself (a service's baked PATH)
/** Who holds `lockPath`, off the pid its holder wrote: ` — held by pid P (cat, parent Q <comm>, for <age>)`, or why it cannot be read. */
function holderNote(lockPath) {
  let pid = 0; try { pid = Number((fs.readFileSync(lockPath, 'utf8').trim().split('\n')[0] || '').trim()); } catch { }
  if (!Number.isInteger(pid) || pid <= 0) return ' — its holder wrote no pid (an older holder, or a torn write)';
  const st = procStat(pid); if (!st || st.state === 'Z' || st.state === 'X') return ` — the holder pid ${pid} it named is gone (the lock is being released)`;
  // verify r3 (T6): a holder is `cat` (the sh exec'd into it); a number that now runs anything else was reused, and the note said
  // "held by" an innocent process (measured: a node named as the holder) — the operator would have looked at the wrong process
  if (st.comm !== 'cat') return ` — the pid ${pid} it named now runs ${st.comm}, not a holder (the number was reused, or the file is stale; the lock is the kernel's flock, still held by someone)`;
  const parent = procStat(st.ppid), born = procBornMs(st, procBootMs()), age = born == null ? null : Date.now() - born;
  return ` — held by pid ${pid} (${st.comm}, parent ${st.ppid}${parent ? ' ' + parent.comm : ''}, for ${fmtAge(age)})`;
}
const LOCK_FAILS = { 69: () => 'flock(1) is not installed on this machine', 70: (p) => `cannot open ${p}`, 75: (p, s) => `another sweep holds ${p} (waited ${s} s)${holderNote(p)}` };
function startLockHolder(lockPath, waitMs) {
  const child = spawn(SH, ['-c', LOCK_HOLDER_SH, 'vibespace-reaper-lock', lockPath, String(Math.max(0, waitMs) / 1000)], { stdio: ['pipe', 'ignore', 'ignore'] });
  child.on('error', () => { });
  if (child.stdin) child.stdin.on('error', () => { });
  child.unref();
  return child;
}
// held = the holder became `cat` (it exec'd only after flock succeeded); failed = it exited — its code read off
// /proc (field 52, a zombie's status) before this process reaps it, or off the child once it has
function lockVerdict(child, lockPath, waitMs) {
  if (!child.pid) return { why: 'could not start the lock holder (sh)' };
  const st = procStat(child.pid);
  let code;
  if (st && st.state !== 'Z' && st.state !== 'X') return st.comm === 'cat' ? 'held' : null;
  if (st) code = st.exitCode == null ? -1 : st.exitCode >> 8;
  else if (child.exitCode !== null || child.signalCode) code = child.exitCode === null ? -1 : child.exitCode;
  else return null;
  const f = LOCK_FAILS[code];
  return { why: f ? f(lockPath, Math.round(waitMs / 100) / 10) : `the lock holder exited ${code}` };
}
const dropHolder = (child) => { try { if (child.stdin) child.stdin.destroy(); } catch { } try { process.kill(child.pid, 'SIGKILL'); } catch { } };
const heldLock = (child, lockPath) => ({ ok: true, path: lockPath, holder: child.pid, release() { dropHolder(child); } });
/** Take the sweep lock, waiting up to `waitMs`: {ok:true, release()} or {ok:false, why}. Sync. */
export function acquireReaperLock({ lockPath = defaultReaperLockPath(), waitMs = REAPER_LOCK_WAIT_MS } = {}) {
  let child;
  try { child = startLockHolder(lockPath, waitMs); } catch (e) { return { ok: false, why: `could not start the lock holder (${e.code || e.message})` }; }
  const deadline = Date.now() + waitMs + 3000;
  for (;;) {
    const v = lockVerdict(child, lockPath, waitMs);
    if (v === 'held') return heldLock(child, lockPath);
    if (v) { dropHolder(child); return { ok: false, why: v.why }; }
    if (Date.now() > deadline) { dropHolder(child); return { ok: false, why: `the lock holder did not answer within ${Math.round((waitMs + 3000) / 1000)} s` }; }
    sleepSync(10);
  }
}
/** The async twin (the heavy tier's lanes): same holder, the wait on the event loop. */
export async function acquireReaperLockAsync({ lockPath = defaultReaperLockPath(), waitMs = REAPER_LOCK_WAIT_MS } = {}) {
  let child;
  try { child = startLockHolder(lockPath, waitMs); } catch (e) { return { ok: false, why: `could not start the lock holder (${e.code || e.message})` }; }
  const deadline = Date.now() + waitMs + 3000;
  for (;;) {
    const v = lockVerdict(child, lockPath, waitMs);
    if (v === 'held') return heldLock(child, lockPath);
    if (v) { dropHolder(child); return { ok: false, why: v.why }; }
    if (Date.now() > deadline) { dropHolder(child); return { ok: false, why: `the lock holder did not answer within ${Math.round((waitMs + 3000) / 1000)} s` }; }
    await new Promise((r) => setTimeout(r, 20));
  }
}
const hasProcRoot = (procRoot) => { try { return fs.statSync(procRoot || defaultProcRoot()).isDirectory(); } catch { return false; } };
const skipLine = (why) => `[ci] scratch reaper SKIPPED — ${why}: nothing judged, nothing signalled`;
// a victim is signalled only while its pid is still THAT process (the starttime the sweep judged): a pid recycled in
// the 3 s grace is somebody else's
const sameProcess = (o, procRoot = defaultProcRoot()) => { const st = procStat(o.pid, procRoot); return !!st && st.state !== 'Z' && st.state !== 'X' && (!o.starttime || st.starttime === o.starttime); };
// verify r3 (T1, 2026-09-30): THE SIGNAL SITE IS THE CHOKE POINT. r2's "a seam lists, never signals" lived in each
// caller's `if (seam) return` — two sweeps remembered it, and a third caller that forgot (planted on a copy: one new function,
// judge then signal) SIGKILLed a real child off a fake row, because the identity re-check read the seam's own table. Now
// nothing is signalled here while VIBESPACE_CI_REAP_PROCFS is set and no in-process table was handed in, whatever the caller
// remembered — and the re-check reads the KERNEL's /proc unless an in-process table (a test's own) was handed in.
// verify r4 (X1c): THE REFUSAL SAYS SO. A caller that forgot the dry return (the r3 T1 shape) printed its victims and then closed with
// "reaped 0 of N — N still alive after SIGKILL" for a signal never sent — a silent `return 0` is a dry run nobody noticed.
const signalVictims = (list, sig, procRoot, log = console.log) => {
  if (!procRoot && process.env.VIBESPACE_CI_REAP_PROCFS) { log(`[ci] scratch reaper: ${list.length} victim(s) NOT signalled — VIBESPACE_CI_REAP_PROCFS is set and no in-process table was handed in (a seam is dry)`); return 0; } // an env seam: a table's word about a pid is not the kernel's
  let n = 0; for (const o of list) { if (sameProcess(o, procRoot || '/proc')) { try { process.kill(o.pid, sig); n++; } catch { } } } return n;
};
/** SIGTERM, then SIGKILL the survivors after `graceMs` — under the sweep lock. Returns the list it acted on
 *  (empty with `.skipped` = the reason when the lock was not had). */
export function reapScratchOrphans({ log = console.log, graceMs = 3000, lockPath, lockWaitMs = REAPER_LOCK_WAIT_MS, ...opts } = {}) {
  const seam = opts.procRoot ? null : procRootSeam(); // verify r1 K7: a refused seam THROWS here (the caller prints it), before any /proc question
  // verify r3 (T3): the table ANNOUNCED is the table JUDGED — the one resolution above is handed to the judge (the judge's own
  // default resolved the seam again, so a symlink re-pointed between the announce line and the judge listed another table's rows)
  const table = seam || opts.procRoot;
  if (!hasProcRoot(table)) return []; // no /proc (macOS): nothing can be judged, so there is no sweep to serialise
  const lock = acquireReaperLock({ lockPath, waitMs: lockWaitMs });
  if (!lock.ok) { log(skipLine(lock.why)); return Object.assign([], { skipped: lock.why }); }
  if (seam) log(seamLine(seam));
  try {
    const list = scratchOrphans({ ...opts, procRoot: table });
    if (!list.length) return list;
    for (const line of reapReport(list)) log(line);
    if (seam) { log(seamDryLine(list.length)); return list; } // verify r2 R2: a seam lists, never signals
    signalVictims(list, 'SIGTERM', opts.procRoot);
    const until = Date.now() + graceMs;
    while (Date.now() < until && list.some((o) => alive(o.pid) && sameProcess(o, opts.procRoot || '/proc'))) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    signalVictims(list.filter((o) => alive(o.pid)), 'SIGKILL', opts.procRoot);
    return list;
  } finally { lock.release(); }
}
// THE LANES' TWIN (2026-09-16, the 2.369.104 ↔ lanes integration). The sync
// reaper above waits its grace inside `Atomics.wait`, which is fine after a
// spawnSync suite but would freeze the async runner — and with it every other
// lane's completion — for up to 3 s per call. Same evidence, same kills, the
// grace awaited on the event loop instead. `judgeScratch` spares a sibling
// lane's suite in flight (its root's owner is alive, or its server is a live
// child of this runner), so the sweep is safe to run mid-tier.
export async function reapScratchOrphansAsync({ log = console.log, graceMs = 3000, lockPath, lockWaitMs = REAPER_LOCK_WAIT_MS, ...opts } = {}) {
  const seam = opts.procRoot ? null : procRootSeam();
  const table = seam || opts.procRoot; // verify r3 (T3): announced = judged
  if (!hasProcRoot(table)) return [];
  const lock = await acquireReaperLockAsync({ lockPath, waitMs: lockWaitMs });
  if (!lock.ok) { log(skipLine(lock.why)); return Object.assign([], { skipped: lock.why }); }
  if (seam) log(seamLine(seam));
  try {
    const list = scratchOrphans({ ...opts, procRoot: table });
    if (!list.length) return list;
    for (const line of reapReport(list)) log(line);
    if (seam) { log(seamDryLine(list.length)); return list; } // verify r2 R2: a seam lists, never signals
    signalVictims(list, 'SIGTERM', opts.procRoot);
    const until = Date.now() + graceMs;
    while (Date.now() < until && list.some((o) => alive(o.pid) && sameProcess(o, opts.procRoot || '/proc'))) await new Promise((r) => setTimeout(r, 100));
    signalVictims(list.filter((o) => alive(o.pid)), 'SIGKILL', opts.procRoot);
    return list;
  } finally { lock.release(); }
}

// THE USAGE INDEX'S DIRECTORIES (design 011 lane 3). A server keeps its usage
// index at ~/.vibespace/db/<hash of its data/'s real path>/ (src/server/usage-index.js)
// with an owner.json naming that data/. A scratch server whose HOME is the real
// one leaves such a directory behind when its data/ is removed; this sweep
// removes an index directory ONLY when its owner.json parses, names an absolute
// data/, and that data/ no longer exists — a directory without the record, or
// whose data/ is there, is never touched (the index is rebuildable either way).
export function sweepUsageIndexDirs({ root = path.join(os.homedir(), '.vibespace', 'db'), log = () => { } } = {}) {
  const removed = [];
  let names = [];
  try { names = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return removed; }
  for (const name of names) {
    const dir = path.join(root, name);
    let owner = null;
    try { owner = JSON.parse(fs.readFileSync(path.join(dir, 'owner.json'), 'utf8')); } catch { continue; }
    const dataDir = owner && typeof owner.dataDir === 'string' ? owner.dataDir : '';
    if (!path.isAbsolute(dataDir) || fs.existsSync(dataDir)) continue;
    try { fs.rmSync(dir, { recursive: true, force: true }); removed.push(dir); log(`  · usage index of a removed data/ swept: ${dir} (${dataDir})`); } catch { }
  }
  return removed;
}

/** `--reap` BY HAND (lane H verify r1): the operator is shown EVERY victim — the
 *  per-pid report (pid, ppid, command head, root, the rule that fired, and since
 *  B-1d08 its evidence: owner, age, what named the root) before the first SIGTERM,
 *  then a closing line naming any survivor. Same rules and the same sweep lock as
 *  every tier's sweep; a sweep that could not take the lock says so and exits 3
 *  (did not run). `--dry-run` prints the VERDICT PER CANDIDATE (verdictReport —
 *  victims with their evidence, the spared and why, the processes naming no root)
 *  and signals nothing; it takes no lock (it signals nothing). A refused test seam (procRootSeam) is printed and
 *  exits 2 on both paths (verify r1 K7); an accepted one lists and signals nothing (verify r2 R2). */
const dirSweepByHand = (log, dryRun) => { try { sweepDirsNow({ dryRun, log, byHand: true }); } catch (e) { log(`[ci] dir sweep refused: ${e.message}`); } };
export function reapByHand({ dryRun = false, log = console.log, ...opts } = {}) {
  let seam = null;
  try { seam = opts.procRoot ? null : procRootSeam(); } catch (e) { log(`[ci] --reap refused: ${e.message}`); return 2; }
  if (dryRun) {
    if (!seam && !opts.procRoot) dirSweepByHand(log, true); // B-60d2: the dirs (a fake table judges none)
    if (seam) log(seamLine(seam));
    try { for (const line of verdictReport(judgeScratch({ ...opts, procRoot: seam || opts.procRoot }))) log(line); } catch (e) { log(`[ci] --reap refused: ${e.message}`); return 2; } // verify r3 (T3): announced = judged
    return 0;
  }
  try {
  const list = reapScratchOrphans({ log, ...opts });
  // verify r4 (X4c): a table that vanished mid-sweep throws out of the sweep (its lock released by the sweep's finally) — refused, said, exit 2 on both paths
  if (list.skipped) return 3;
  // B-60d2: the directories after the processes (a dir a victim held is free once it is gone)
  const dirSweep = () => { if (!seam && !opts.procRoot) dirSweepByHand(log, false); };
  if (!list.length) { log('[ci] no scratch orphans'); dirSweep(); return 0; }
  if (seam) { log(`[ci] test seam: ${list.length} listed, none signalled`); return 0; } // verify r2 R2: the closing line never claims a reap under a seam
  // verify r1 (K5): a victim that died but is not yet reaped by its parent is a ZOMBIE — `kill(pid, 0)` still succeeds, so
  // the closing line called it "still alive after SIGKILL" (seen: a non-detached child during a sync sweep). Dead is dead.
  const stillRunning = (pid) => { const st = procStat(pid); return !!st && st.state !== 'Z' && st.state !== 'X'; };
  const left = list.filter((o) => stillRunning(o.pid));
  log(`[ci] reaped ${list.length - left.length} of ${list.length} scratch orphan process(es)${left.length ? ` — ${left.length} still alive after SIGKILL: ${left.map((o) => o.pid).join(' ')}` : ''}`);
  dirSweep();
  return 0;
  } catch (e) { log(`[ci] --reap refused: ${e.message}`); return 2; }
}

// THE suite runner of both tiers' lanes (the sync runSuite it was the twin of went with the fast tier's lanes,
// lane fast-budget): one argv, the row's budget, the verdict shape ({ok, ms, killedFromOutside}) plus `lines` — the output is BUFFERED and
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
  { name: 'test-exit-run', why: 'a CLOCK witness: its secret-shape legs and controls judge regex complexity by hrtime ratios at ×8 input (linear ≈ 8, quadratic ≈ 64, bound 12–16) — a loaded box drifts the linear side toward the bound, so it runs alone (lane fast-budget, moved from the fast tier)' },
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

// ── SHARDS (lane mirror-green r2, 2026-10-03) ────────────────────────────────
// The Actions heavy job hit its 60-min timeout on .199/.200: 216 suites over the
// runner's TWO lanes (laneCount on 4 cpus) had drained in 2611–2950 s already on
// .196–.198. `--heavy --shard i/n` runs ONE slice of the tier; the workflow runs
// the n slices as a matrix and one aggregate job reads them as one status. THE
// SPLIT IS A FUNCTION OF THE TABLE'S NAMES AND n ALONE — never of a marker's
// timings, the cpu count or the table's order — so n matrix jobs, each computing
// it on its own runner from the same commit, agree, and `--dry-run` here lists
// exactly what each job runs:
//   · the SERIAL group (SERIAL rows + anything machineGlobalFixtures flags —
//     scheduleLanes' own judgement) is ONE unit, in shard 1: its suites still run
//     in one serial lane after that job's parallel lanes drain, alone, as measured;
//   · every other suite goes to shard 1 + FNV-1a(name) mod n, so adding or
//     removing a suite moves NO other suite (a deal over a sorted list would
//     reshuffle every name after it).
// Balance on the runner's own per-suite times (.198 + .200 logs, 212 of 218
// suites, 7790 s summed): 4 shards = 1329 / 2044 / 2519 / 1899 s of suites, ~11–21
// min each over two lanes. A shard is a PARTIAL run: its marker never stands for
// the tier (heavyBlocker / heavyAlreadyGreen ignore partial markers).
// shardCensus is THE CENSUS (test-ci-gate §8b, with the controls): every heavy
// suite in exactly one shard and the serial group whole — a suite dropped from
// every shard is a suite no mirror job runs.
export function parseShard(spec) {
  const m = /^(\d+)\/(\d+)$/.exec(String(spec || ''));
  if (!m) return null;
  const i = Number(m[1]), n = Number(m[2]);
  return n >= 1 && i >= 1 && i <= n ? { i, n } : null;
}
export function shardHash(name) {
  let h = 0x811c9dc5;
  for (const b of Buffer.from(String(name), 'utf8')) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}
// PURE: n slices of `suites`, plus the serial group's names (all in slice 0).
export function shardPlan(suites, n, { serial = SERIAL, fixtures = machineGlobalFixtures, sourceOf = () => '' } = {}) {
  const serialNames = scheduleLanes(suites, { serial, fixtures, sourceOf, keepOrder: true }).serial.map((s) => s.name);
  const shards = Array.from({ length: n }, () => []);
  for (const s of suites) shards[serialNames.includes(s.name) ? 0 : shardHash(s.name) % n].push(s);
  return { shards, serial: serialNames };
}
// PURE: what is wrong with a split — [] when every suite is in exactly one shard
// and the serial group shares one.
export function shardCensus(suites, shards, serial = []) {
  const problems = [], home = new Map();
  shards.forEach((list, k) => {
    for (const s of list) {
      if (home.has(s.name)) problems.push(`${s.name} is in shard ${home.get(s.name) + 1} AND shard ${k + 1}`);
      else home.set(s.name, k);
    }
  });
  for (const s of suites) if (!home.has(s.name)) problems.push(`${s.name} is in NO shard — no mirror job runs it`);
  for (const name of home.keys()) if (!suites.some((s) => s.name === name)) problems.push(`${name} is sharded but is not a heavy suite`);
  const homes = new Set(serial.map((name) => home.get(name)));
  if (homes.size > 1) problems.push(`the serial group is split over shards ${[...homes].map((k) => (k === undefined ? 'none' : k + 1)).join(', ')}`);
  return problems;
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
/** The files (exact) and prefixes (directories) a heavy suite's verdict depends on.
 *  `memo` (optional Map) caches each FILE's expansion — the ordered list of what
 *  reading it adds — keyed by root + path, so one pass over ~150 suites reads
 *  and parses each shared file (server.js, src/…) once instead of once per
 *  suite (measured 2026-09-27: 3.9 s → a fraction per affectedSuites call over
 *  the real heavy table; test-ci-gate made five such calls = 19 s of the fast
 *  tier). Only valid while the tree is unchanged, so a memo lives for ONE
 *  computation (affectedSuites makes its own; a caller that walks the table
 *  itself passes one). The replay keeps the first-reason-wins order exactly. */
export function suiteInputs(s, { root = repo, memo = null } = {}) {
  const files = new Set(), prefixes = new Set(), seen = new Set();
  // HOW each input got in (the first reason wins), so a selection can say
  // "boots the product" instead of "reads src/lib/i18n-ja.js" for a suite that
  // never opens that file — the reason in the log is what a reader trusts.
  const via = new Map();
  const queue = [];
  const enq = (rel, how) => { if (!via.has(rel)) via.set(rel, how); queue.push(rel); };
  enq(`scripts/${s.name}.mjs`, 'suite');
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel); files.add(rel);
    for (const op of fileExpansion(root, rel, memo)) {
      if (op[0] === 'enq') enq(op[1], op[2]);
      else if (op[0] === 'prefix') { prefixes.add(op[1]); if (!via.has(op[1])) via.set(op[1], 'literal'); }
      else for (const p of BOOT_INPUTS) { (p.endsWith('/') ? prefixes : files).add(p); if (!via.has(p)) via.set(p, 'boot'); }
    }
  }
  for (const r of s.reads || []) { (r.endsWith('/') ? prefixes : files).add(r); if (!via.has(r)) via.set(r, 'reads'); }
  return { files, prefixes, via };
}
// What reading ONE file adds, in order: ['enq', rel, how] | ['prefix', dir] | ['boot'].
function fileExpansion(root, rel, memo) {
  const key = root + '\0' + rel;
  if (memo && memo.has(key)) return memo.get(key);
  const ops = [];
  let text = '';
  try { text = fs.readFileSync(path.join(root, rel), 'utf-8'); } catch { }
  if (text) {
    for (const spec of specsOf(text)) { const r = resolveLocal(rel, spec, root); if (r) ops.push(['enq', r, 'import']); }
    // a SUITE names its fixtures and `path.join(REPO, 'src/x.js')` modules as
    // repo-relative literals; a directory literal is a prefix, a file is walked
    if (rel.startsWith('scripts/')) {
      for (const m of text.matchAll(CONCAT_LOAD)) ops.push(['enq', m[1] || m[2], 'import']);
      for (const m of text.matchAll(LITERAL_INPUT)) {
        const p = m[2];
        try { const st = fs.statSync(path.join(root, p)); if (st.isDirectory()) ops.push(['prefix', p.replace(/\/?$/, '/')]); else ops.push(['enq', p, 'literal']); } catch { /* names nothing on disk */ }
      }
      if (BOOTS_THE_PRODUCT.test(text)) ops.push(['boot']);
    }
  }
  if (memo) memo.set(key, ops);
  return ops;
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
export function affectedSuites({ range, suites, root = repo, gitRoot = root, changed, memo = new Map() } = {}) {
  const ch = Array.isArray(changed) ? { files: changed } : changedFiles(range, gitRoot);
  const why = new Map();
  const pick = (s, reason) => { if (!why.has(s.name)) why.set(s.name, reason); };
  if (ch.files === null) for (const s of suites) pick(s, `the changed files could not be listed (${ch.error}) — everything runs`);
  else {
    const global = ch.files.filter((f) => GLOBAL_INPUTS.includes(f));
    for (const s of suites) {
      if (s.always) { pick(s, 'always: true (a boot/restore smoke runs on every push)'); continue; }
      if (global.length) { pick(s, `${global[0]} changed (a global input — dependencies)`); continue; }
      const { files, prefixes, via } = suiteInputs(s, { root, memo });
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
  // OWNED BY THIS RUN (B-1d08): every process rooted in the worktree — this run's suites, their servers, the
  // daemons those detach — is spared by any sweep on the box while this runner lives, and is litter once it does not.
  // Written after `worktree add` (git wants an empty target); `.vs-run.json` is gitignored.
  try { stampScratchRun(wt, { run: GIT_ENV.VIBESPACE_CI_RUN }); } catch (e) { console.log(`[ci] the scratch worktree has no run record (${e.code || e.message}) — sweeps judge it by the record-less rule`); }
  return wt;
}
/** The id every run record this gate run's suites write carries (`VIBESPACE_CI_RUN`, exported to each suite through
 *  GIT_ENV): which tier, which runner — so `--reap --dry-run` can say whose run a live root belongs to. */
function markCiRun(tier) {
  const st = procStat(process.pid);
  GIT_ENV.VIBESPACE_CI_RUN = `ci-${tier}-pid${process.pid}@${st ? st.starttime : 0}`;
}
function removeScratchWorktree(wt) {
  try { spawnSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt], { env: GIT_ENV }); } catch {}
  try { fs.rmSync(wt, { recursive: true, force: true }); } catch {}
  try { spawnSync('git', ['-C', repo, 'worktree', 'prune'], { env: GIT_ENV }); } catch {}
}

// ── modes ────────────────────────────────────────────────────────────────
// ── FAST LANES (lane fast-budget, 2026-10-04) ─────────────────────────────
// The Actions `fast` job was CANCELLED at its 15 minutes on 2.369.202, .203
// and .205 and never reached a verdict: 269 suites ran one after another
// (792 s summed here, ~1.34× that on the runner). Two halves of one fix: the
// suites over THE TIER RULE's 10 s were made fast or moved (their rows say
// which), and the tier now runs over N worker lanes like the heavy tier.
// N = min(4, cpus), counting the cpus this process may RUN ON
// (os.availableParallelism — a taskset or a cgroup cpuset shrinks it): 4 on
// the 4-cpu runner. Measured in its shape (depth-1 clone, node 22, taskset
// 0-3): 3 lanes (min(4, cpus − 1)) 192 s, 4 lanes 165 s, both green — the
// suites wait on children and the disk as much as on a cpu, and the clock
// judges run alone anyway. VIBESPACE_CI_FAST_LANES=<n> overrides it (1 = the
// sequential tier). Longest first, by each row's own measured `· N s`.
// FAIL-FAST stays: the first red starts nothing new, SIGTERMs the suites in
// flight and blocks the push. Each suite's output is buffered and printed
// whole when it ends, tagged with its lane.
//
// THE VERDICT MAY NOT DEPEND ON LOAD — the pre-push hook runs this tier on a
// developer's busy box. A suite that judges WALL-CLOCK time (a bound of 1 s or
// less, or a ratio of two clocks) runs in the SERIAL lane after the parallel
// lanes drain, alone, as before; so does anything machineGlobalFixtures flags.
// A bound of 2 s or more that only tells "answered" from "hung until a
// multi-second timeout" stays parallel, and so does every suite that judges
// WORK through scripts/work-meter.mjs (it counts operations, not time).
// test-fixture-isolation is LAST: it sweeps for the litter any suite left.
export const FAST_MAX_LANES = 4;
export const FAST_SERIAL = [
  { name: 'test-peer-text-census', why: 'clock: a megabyte of openers through the belt is judged < 100 ms' },
  { name: 'test-peer-parsers', why: 'clock: ③ judges its 40 rows linear by hrtime ratios (best of five); its ④ controls are WORK / a deadline since .209' },
  { name: 'test-fs-canary', why: 'clock: the canary\'s stat and loop are judged in ms (< 100 / < 300 / ≥ 1200)' },
  { name: 'test-dial-link-kept', why: 'clock: a refused dial / a known boot id is judged "at once" (< 100 / < 200 ms)' },
  { name: 'test-mail-frame', why: 'clock: the quadratic hostile shapes at MAX_HTML_BYTES are judged < 1 500 ms, the old loops over it' },
  { name: 'test-channel-blocks', why: 'clock: ⑬ judges every hostile shape under an 800 ms budget and its controls past it; ⑱ a 1 MB post under 250 ms (its linear pin + control are WORK since .209)' },
  { name: 'test-auto-cli-tick-reads', why: 'clock: the tick\'s synchronous hold of the loop is judged in ms (and its control > 1 s)' },
  { name: 'test-channel-facts', why: 'clock: a 1 MB Cc / To refused by its length in < 100 ms' },
  { name: 'test-remote-discovery-dirty', why: 'clock: a cold read answers stale in < 200 ms' },
  { name: 'test-browser-switch', why: 'clock: a 200 KB url + title judged at its bound in < 200 ms' },
  { name: 'test-raw-filename', why: 'clock: a refused remote download answers 502 in < 1 000 ms' },
  { name: 'test-fixture-isolation', last: true, why: 'LAST ON PURPOSE: the standing sweep for fixture litter in the real ~/.claude/projects runs after every suite that could write one' },
];
// THE CLOCK-JUDGE CENSUS (lane work-meter-judges, .209): a COMPLEXITY claim (linear / quadratic / bounded) is judged
// by WORK — scripts/work-meter.mjs counts operations, so a loaded box reads the same verdict — never by a ratio of
// clock readings: int206 read test-peer-parsers' control ×1.96 at load 27, int208 test-channel-blocks ⑱'s ×2.37
// (bound 2.5; ×2.52–2.62 alone). `clockJudgeLines(src)` finds an assertion beside a clock read and a complexity word:
// a clock read (process.hrtime / performance.now / a Date.now delta) with `ok(` AND linear / quadratic / ratio / O(n
// within CLOCK_WINDOW lines (comment lines ignored). Every suite it finds is on CLOCK_JUDGES with the reason it stays
// on the clock — a deadline ("answered, not hung"), or the one class no work count sees: BACKTRACKING inside one regex
// exec (V8 release builds expose no regexp step counter). test-architecture reds a suite found and not listed (a NEW
// clock-ratio judge: convert it to the meter, or list it with a reason) and a listed suite no longer found.
export const CLOCK_WINDOW = 6;
const CLOCK_READ = /process\.hrtime|performance\.now\(\)|Date\.now\(\)\s*-\s*[A-Za-z_$]/;
const COMPLEXITY_WORD = /[Ll]inear|LINEAR|[Qq]uadratic|\bratio|[A-Za-z]Ratio|RATIO|\bO\(n/;
/** PURE: the 1-based lines of `src` where a clock read sits within CLOCK_WINDOW lines of an `ok(` and a complexity word. */
export function clockJudgeLines(src) {
  const ls = String(src).split('\n').map((l) => (/^\s*(?:\/\/|\*|\/\*)/.test(l) ? '' : l));
  const near = (i, re) => { for (let j = Math.max(0, i - CLOCK_WINDOW); j <= Math.min(ls.length - 1, i + CLOCK_WINDOW); j++) if (re.test(ls[j])) return true; return false; };
  const out = [];
  for (let i = 0; i < ls.length; i++) if (CLOCK_READ.test(ls[i]) && near(i, /\bok\(/) && near(i, COMPLEXITY_WORD)) out.push(i + 1);
  return out;
}
export const CLOCK_JUDGES = [
  { name: 'test-channel-blocks', why: 'deadlines: ⑬ every hostile shape under BUDGET_MS (800 ms, ~10× the slowest) and its controls past it in a child — the lazy tag regex / fence regex BACKTRACK inside one exec; ⑱ a 1 MB post under 250 ms (its JSON.parse precedes the cut, which bounded() would charge)' },
  { name: 'test-channel-facts', why: 'deadlines: a 1 MB Cc / To refused by its length < 100 ms; the encoded-word decoder on a 16 KB hostile name < 50 ms (a regex — backtracking is invisible to the meter)' },
  { name: 'test-channel-reactions', why: 'not a judge: an informational print of compactSide\'s ms, never asserted (its linear pin is WORK)' },
  { name: 'test-artifacts-list-model', why: 'not a judge: an informational print of listPlan\'s ms at 500 rows, never asserted (its linear pin is WORK since int238 — the old `median < 5 ms` read 7.63 ms on the runner)' },
  { name: 'test-exit-run', why: 'regex BACKTRACKING: redactSecrets at ×4 / ×8 input judged ≤ ×8 / ×16 time, best of 5 — the work meter cannot see the backtracking inside one exec (its §2c comment); wide bounds, a quadratic reads ×16 / ×64' },
  { name: 'test-mail-frame', why: 'deadlines: the hostile shapes at MAX_HTML_BYTES under 1 500 ms and the old regex loops past it in a child (backtracking inside one exec)' },
  { name: 'test-peer-parsers', why: 'regex-heavy rows: ③ judges 40 parsers linear by hrtime ratios — the meter\'s charge model does not read every one honestly yet (lane work-meter-judges tried: 19 rows read ×3–4 by charge artifacts); its ④ controls are WORK / a deadline' },
  { name: 'test-peer-text-census', why: 'deadlines: two 64 KiB records through read + search + thread < 1 500 ms; 64 KiB of openers through the line belt < 100 ms (regex passes)' },
];
export function fastLaneCount({ cpus = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length, env = process.env } = {}) {
  const forced = Number(env.VIBESPACE_CI_FAST_LANES);
  if (Number.isInteger(forced) && forced >= 1) return forced;
  return Math.max(1, Math.min(FAST_MAX_LANES, cpus));
}
/** PURE: the fast tier's lanes — scheduleLanes over FAST_SERIAL, timed by each row's own measured `· N s`, the `last` rows at the very end. */
export function scheduleFastLanes(suites, { serial = FAST_SERIAL, fixtures = machineGlobalFixtures, sourceOf = () => '' } = {}) {
  const timings = Object.fromEntries(suites.map((s) => [s.name, fastRuleFindings(s, '').measuredMs]).filter(([, ms]) => ms != null));
  const plan = scheduleLanes(suites, { timings, serial, fixtures, sourceOf });
  const last = new Set(serial.filter((r) => r.last).map((r) => r.name));
  plan.serial = [...plan.serial.filter((s) => !last.has(s.name)), ...plan.serial.filter((s) => last.has(s.name))];
  return plan;
}
/** PURE: the closing report — the ten slowest suites, and a WARNING line per suite over FAST_MAX_MS (informational: a clock gate flakes). */
export function fastTimingReport(timings, { top = 10, maxMs = FAST_MAX_MS } = {}) {
  const sorted = [...timings].sort((x, y) => y.ms - x.ms);
  const lines = [`[ci] the ${Math.min(top, sorted.length)} slowest fast suites: ${sorted.slice(0, top).map((t) => `${t.name} ${(t.ms / 1000).toFixed(1)} s`).join(' · ')}`];
  for (const t of sorted.filter((x) => x.ms > maxMs)) lines.push(`[ci] WARNING: ${t.name} took ${(t.ms / 1000).toFixed(1)} s — over THE TIER RULE's ${maxMs / 1000} s for a fast suite (make it fast or move it to the heavy tier; this line does not fail the run)`);
  return lines;
}

/**
 * THE FAST TIER. `isolate` runs it in a scratch worktree at `sha` instead of
 * against this working tree — INVARIANT ⑭ ("the verdict is about the refs
 * being PUSHED") reaching the last place in the hook that had not heard it.
 * Reproduced before the fix: standing on `main` and pushing a branch whose tip
 * adds src/broken.js, the tier ran in a tree that did not contain that file
 * and printed ALL GREEN. The closing line now NAMES its subject either way, so
 * "ALL GREEN" can never again be a sentence about a tree nobody is publishing.
 */
async function fastGate({ sha: wantSha, isolate } = {}) {
  const t0 = Date.now();
  markCiRun('fast');
  const fast = SUITES.filter((s) => s.tier === 'fast');
  const sha = wantSha || gitOut(['rev-parse', 'HEAD']);
  let runRoot = repo, wt = null, cleaned = false;
  const inflight = new Set();
  const cleanup = () => { if (cleaned || !wt) return; cleaned = true; removeScratchWorktree(wt); };
  // A killed run must not leave a checkout in /tmp and a registration `git
  // worktree prune` can never remove (⑯), nor suites running in its lanes.
  // `finally` covers the ordinary exits below; this covers the Ctrl-C a person
  // aims at a push and the runner's cancel. Deliberately NOT heavyGate's
  // `for (const sig of ['SIGTERM', …]) {` spelling — one set, one name
  // (OUTSIDE_SIGNALS), and the two mutation anchors stay distinct.
  for (const sig of OUTSIDE_SIGNALS) process.on(sig, () => {
    for (const c of inflight) { try { c.kill('SIGTERM'); } catch { } }
    if (isolate) { console.error(`\n[ci] ${sig} — cleaning up the scratch worktree for ${shortSha(sha)}`); cleanup(); }
    process.exit(143);
  });
  try {
    if (isolate) { wt = addScratchWorktree(sha, 'fast'); runRoot = wt; }
    const lanes = fastLaneCount();
    const sourceOf = (name) => { try { return fs.readFileSync(path.join(runRoot, 'scripts', name + '.mjs'), 'utf-8'); } catch { return ''; } };
    const plan = scheduleFastLanes(fast, { sourceOf });
    console.log(`release gate — FAST tier: build + ${fast.length} suites (heavy tier: ${SUITES.filter((s) => s.tier === 'heavy').length} suites, runs after the push)${isolate ? ` — ISOLATED worktree at ${shortSha(sha)}` : ''}`);
    if (!runBuild({ cwd: runRoot }).ok) { console.error('\n✗ build FAILED — release gate is RED, do not push\n'); return 1; }
    console.log(`[ci] ${lanes} parallel lane(s) over ${plan.parallel.length} suites (longest first), then 1 serial lane over ${plan.serial.length}: ${plan.serial.map((s) => s.name).join(', ')}`);
    const absent = [], timings = [];
    let red = null;
    const laneWorker = async (queue, lane) => {
      for (;;) {
        if (red) break;
        const s = queue.shift();
        if (!s) break;
        const r = await runSuiteAsync(s, { root: runRoot, absentIsSkip: !!isolate, sha, lane, inflight });
        if (red) r.lines = [`  · ${s.name} stopped [lane ${lane}] — ${red} is red`];   // SIGTERMed by another lane's red: not a verdict
        console.log(r.lines.join('\n'));
        // a suite may not leave a daemon behind (2.369.104) — swept after every suite, as the heavy lanes do
        try { await reapScratchOrphansAsync({}); } catch (e) { console.log(`  · scratch reaper skipped: ${e && e.message}`); }
        try { quietSweep(); } catch (e) { console.log(`  · dir sweep skipped: ${e && e.message}`); } // …nor its scratch dir, once nothing holds it (B-60d2)
        sweepUsageIndexDirs(); // …nor a usage index of a data/ it removed (design 011 lane 3)
        if (red) break;
        if (r.absent) { absent.push(s.name); continue; }
        if (!r.ok) {
          red = s.name;
          const others = [...inflight];
          for (const c of others) { try { c.kill('SIGTERM'); } catch { } }
          if (others.length) console.log(`[ci] stopping: ${s.name} is red — ${others.length} suite(s) in flight on the other lanes SIGTERMed, nothing new starts`);
          break;
        }
        timings.push({ name: s.name, ms: r.ms, lane: String(lane) });
      }
    };
    const tPar = Date.now();
    const parallelQ = [...plan.parallel];
    await Promise.all(Array.from({ length: Math.max(1, Math.min(lanes, parallelQ.length)) }, (_, i) => laneWorker(parallelQ, i + 1)));
    const parMs = Date.now() - tPar;
    if (!red && plan.serial.length) await laneWorker([...plan.serial], 'S');
    if (red) { console.error(`\n✗ ${red} — release gate is RED, do not push\n`); return 1; }
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
    const sum = timings.reduce((n, t) => n + t.ms, 0);
    console.log(`[ci] lanes: ${lanes} parallel (${Math.round(parMs / 1000)}s) + serial (${Math.round((Date.now() - tPar - parMs) / 1000)}s); suites summed ${Math.round(sum / 1000)}s = what a sequential tier would have taken`);
    for (const line of fastTimingReport(timings)) console.log(line);
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

async function heavyGate({ sha: wantSha, isolate, dir, only, dirtyOk, lock, lockWaitMs, pidFile, range, shard }) {
  const t0 = Date.now();
  markCiRun('heavy');
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
  console.log(`release gate — HEAVY tier${scoped ? '' : `: ${shard ? `shard ${shard.i}/${shard.n} of ` : ''}${heavy.length} suites`} for ${shortSha(sha)}${isolate ? ' (isolated worktree)' : ''}${scoped ? ` — impact scope ${range}: the suites are selected from the sources AT ${shortSha(sha)}, after checkout` : ''}`);
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
    if (shard) {
      // SHARDS: one slice of the tier, cut from the sources that RUN (the
      // serial group is read off them, as scheduleLanes reads it below)
      const srcAt = (name) => { try { return fs.readFileSync(path.join(runRoot, 'scripts', name + '.mjs'), 'utf-8'); } catch { return ''; } };
      const cut = shardPlan(all, shard.n, { sourceOf: srcAt });
      heavy = cut.shards[shard.i - 1];
      console.log(`[ci:heavy] shard ${shard.i}/${shard.n}: ${heavy.length} of ${all.length} heavy suites${cut.serial.length ? ` — the serial group (${cut.serial.join(', ')}) is shard 1's` : ''}`);
      if (!heavy.length) { console.error(`✗ shard ${shard.i}/${shard.n} holds no suite — an empty slice judges nothing`); return 2; }
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
        try { quietSweep(); } catch (e) { console.log(`  · dir sweep skipped: ${e && e.message}`); } // …nor its scratch dir, once nothing holds it (B-60d2)
        sweepUsageIndexDirs(); // …nor a usage index of a data/ it removed (design 011 lane 3)
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
      partial: only ? only.slice() : (shard ? heavy.map((s) => s.name) : undefined),
      shard: shard ? `${shard.i}/${shard.n}` : undefined,
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
    else if ((only || shard) && existing) noVerdict = `partial run — keeping the existing FULL ${existing.kind.toUpperCase()} marker for ${shortSha(sha)}`;
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
    console.log('\n' + verdict + (scope === 'affected' ? ` — AFFECTED scope: ${heavy.length} of ${all.length} heavy suites selected by ${range}; a FULL run is still owed once per 24 h` : '') + (shard ? ` — SHARD ${shard.i}/${shard.n} of the tier (${all.length} heavy suites over ${shard.n} shards)` : '') + (noVerdict ? ` — NO VERDICT WRITTEN (${noVerdict})` : ''));
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
  try { reapScratchOrphans({ log: (m) => console.error(m) }); } catch (e) { console.error(`[ci:heavy] scratch reaper skipped: ${e && e.message}`); }
  try { sweepDirsNow({ log: (m) => console.error(m) }); } catch (e) { console.error(`[ci:heavy] dir sweep skipped: ${e && e.message}`); } // B-60d2: the leaked dirs too // the tier starts on a box the last runs did not litter (2.369.104); a refused seam is said, never swallowed (verify r1 K7)
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

// `--heavy --shard i/n --dry-run`: the slice one matrix job runs, from THIS
// tree's table and sources — no lock, no build, no suite. Exit 1 when the split
// fails its census (then no listing can be trusted).
function shardDryRun({ i, n }) {
  const all = SUITES.filter((s) => s.tier === 'heavy');
  const sourceOf = (name) => { try { return fs.readFileSync(path.join(repo, 'scripts', name + '.mjs'), 'utf-8'); } catch { return ''; } };
  const { shards, serial } = shardPlan(all, n, { sourceOf });
  const problems = shardCensus(all, shards, serial);
  console.log(`heavy shard ${i}/${n}: ${shards[i - 1].length} of ${all.length} heavy suites${serial.length ? ` — the serial group (${serial.join(', ')}) is shard 1's` : ''}`);
  for (const s of shards[i - 1]) console.log('  ' + s.name);
  for (const p of problems) console.error('  ✗ ' + p);
  return problems.length ? 1 : 0;
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
  // THE TIER RULE over every fast row (the same judge test-ci-gate §2b asserts).
  for (const s of SUITES.filter((x) => x.tier === 'fast')) {
    let src = ''; try { src = fs.readFileSync(path.join(repo, 'scripts', s.name + '.mjs'), 'utf-8'); } catch { continue; } // a ghost is reported above
    const r = fastRuleFindings(s, src);
    if (r.problems.length) problems.push(`fast row ${s.name} breaks THE TIER RULE: ${r.problems.join('; ')}`);
  }
  console.log(`census: ${f.counted.disk} suites on disk = ${f.counted.fast} fast + ${f.counted.heavy} heavy + ${f.counted.excluded} excluded`);
  for (const p of problems) console.error('  ✗ ' + p);
  if (!problems.length) console.log('  ✓ every scripts/test-*.mjs is in exactly one tier or excluded with a reason, and every fast row obeys THE TIER RULE');
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
  // --shard=<i>/<n> (or --shard <i>/<n>): ONE slice of the heavy tier (SHARDS); a bad spec is a loud exit 2
  const shardArg = str('shard') !== null ? str('shard') : (argv.includes('--shard') ? (argv[argv.indexOf('--shard') + 1] || '') : null);
  const shard = shardArg === null ? null : parseShard(shardArg);
  if (shardArg !== null && !shard) { console.error(`✗ --shard wants <i>/<n> with 1 ≤ i ≤ n (got '${shardArg}')`); process.exit(2); }
  if (arg('reap')) { process.exit(reapByHand({ dryRun: !!arg('dry-run') })); }
  if (arg('census')) process.exit(census());
  if (arg('status')) process.exit(status({ dir, head }));
  if (arg('check-heavy')) process.exit(checkHeavy({ dir, head }));
  if (arg('heavy-launch') !== undefined) process.exit(heavyLaunch(str('heavy-launch') || argv[argv.indexOf('--heavy-launch') + 1], { dir, only, lock, lockWaitMs, range: rangeArg || undefined }));
  if (arg('heavy') || arg('heavy-affected')) {
    const affected = !!arg('affected') || !!arg('heavy-affected');
    if (affected && !rangeArg) { console.error('✗ --affected needs --range=<old>..<new> (or --range=<sha> for its whole unpublished range)'); process.exit(2); }
    if (shard && (only || affected)) { console.error('✗ --shard slices the FULL tier — it does not combine with --only or --affected'); process.exit(2); }
    if (shard && arg('dry-run')) process.exit(shardDryRun(shard));
    heavyGate({ sha: str('sha'), isolate: !!arg('isolate'), dir, only, dirtyOk: !!arg('dirty-ok'), lock, lockWaitMs, pidFile: str('pid-file') || undefined, range: affected ? rangeArg : undefined, shard })
      .then((code) => process.exit(code), (e) => { console.error('[ci:heavy] crashed: ' + (e && e.stack || e)); process.exit(1); });
    return;
  }
  // `--isolate [--sha=<x>]` gates the COMMIT rather than this working tree —
  // the hook uses it when a pushed ref's tip is not HEAD.
  fastGate({ sha: str('sha'), isolate: !!arg('isolate') })
    .then((code) => process.exit(code), (e) => { console.error('[ci] crashed: ' + (e && e.stack || e)); process.exit(1); });
}

// Only run when EXECUTED — test-architecture imports the tier table.
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) main(process.argv.slice(2));

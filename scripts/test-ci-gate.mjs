#!/usr/bin/env node
// THE RELEASE GATE'S OWN GATE (2026-09-07, B-4c5a — the fast/heavy split).
//
// The gate is now a machine with opinions: a tier table, a census, a detached
// background run, and a rule that BLOCKS a push based on git ancestry. Every
// one of those can be wrong in a way that is invisible (a census that cannot
// go red; a block rule that blocks forever; a hook that runs the two-minute
// tier before discovering it was going to refuse the push anyway; a detached
// child that inherits the hook's GIT_DIR and does `git worktree add` in
// somebody else's repository). So they are tested here, against REAL git
// history in throwaway repositories and against the REAL tracked hook file —
// never a mock of git and never a paraphrase of the hook.
//
// Sections: §1 census (+ negative controls) · §2 tier hygiene · §3 the block
// rule over real commits · §4 the hook's control flow end-to-end · §5 the git
// environment the detached child must NOT inherit (with the damage as the
// negative control) · §6 no FAST-tier suite claims a machine-global fixture,
// and every "no verdict" path says so up front and at the end (round 2) · §7 no
// literal date · §8 lanes / impact scope / full-tier clock (2026-09-15) · §9 the
// scratch-orphan reaper (2.369.104; lane H verify r1: candidacy is evidence,
// never a name — the agent-browser roots, the owned-shell control, `--reap`
// printing its victims, three mutant-copy controls) · §2b THE TIER RULE
// (B-f4cb, 2026-09-27: every fast row names its kind + a measured time < 10 s,
// and boots / drives / runs nothing its row does not allow — grep-derived,
// with controls) · §10 the launcher ONCE, for real, in a stub repository (the
// push-blocking pin test-ci-heavy-launch carried before it moved to heavy).
//
// SPLIT (lane fast-tier-ratchet, 2026-10-20): the one process ran 37 s — over THE TIER RULE's 10 s, and this LAW row stays
// fast — so the sections are now seven suites, each ≤ 10 s, their text unchanged: THIS file keeps §1 and §2 (§2b–§2g);
// scripts/test-ci-gate-push.mjs §3–§5 · test-ci-gate-tiers.mjs §6–§8 + §8d · test-ci-gate-shards.mjs §8b–§8c ·
// test-ci-gate-reaper.mjs §9–§10 · test-ci-gate-hang.mjs §11 · test-ci-gate-watchdog.mjs §12 · test-ci-gate-hook-env.mjs §A–§B
// (B-e381 r6: the push hook's own env, split from -push §4 and -tiers §8i; the HEAVY twins test-ci-gate-push-deep and
// test-ci-gate-tiers-deep run -push and -tiers whole with their deepest legs); what they share is
// scripts/ci-gate-kit.mjs.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { SUITES, EXCLUDED, censusFindings, listSuiteFiles, heavyBlocker, machineGlobalFixtures, defaultLockPath, killedFromOutside, OUTSIDE_SIGNALS, scratchOrphans, judgeScratch, liveScratchPaths, SCRATCH_ROOT_RE, REAP_NAMES, reapReport, reapByHand, scratchRootsOf, ROOT_ENV, argvScratchRoots, PRODUCT_ROOT_RE, FAST_DISQUALIFIERS, FAST_MAX_MS, fastRuleFindings, FAST_SUM_CAP_MS, FALSE_ROW_RATIO, falseFastRows, fastTimesRecord, fastTimesPath, judgeFastReadings, falseRowLine, stripComments } from './ci.mjs';
import { pathToFileURL } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { anchored, relayBroadcastJs } from './scratch.mjs';
import { callArgs } from './lib/check.mjs'; // B-1388: a helper's Nth argument (the swap census's argument scanner)
import { GIT_REDIRECTORS, gitEnvFrom } from './git-env.mjs';
import { REPO, GIT_ENV, ok, tmpDirs, mktmp, git, makeRepo, commit, STUB_SLICE, stubGateRepo, writeMarker, report } from './ci-gate-kit.mjs'; // the shared kit (lane fast-tier-ratchet: the gate is seven ≤ 10 s parts)
// B-54a9 (主开发 r2462): THE SECTION PROFILE — PRINTED, never judged. Each «\n§…» header this file prints opens a section; the
// end prints every section's own milliseconds (the process's start to the first header = the imports), the largest first, so
// the suite's cost is read by section, not guessed.
const PROFILE = [['(start → the first section: the imports)', 0]];
{ const log = console.log.bind(console); console.log = (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('\n§')) PROFILE.push([a[0].slice(1, 90), performance.now()]); return log(...a); }; }
// B-54a9 (主开发 r2572 (2)): THE HEAVY TWIN. The legs whose seconds are real children (§2f's stalled apt stubs, §2n's egress
// children) run only under CI_GATE_DEEP=1, which scripts/test-ci-gate-deep.mjs (a HEAVY row) sets before it runs this WHOLE file.
// Their tables stay here, and the fast run says, at each place, where they run.
const DEEP = process.env.CI_GATE_DEEP === '1';
const inTwin = (what) => console.log(`    (${what}: in the heavy twin test-ci-gate-deep — B-54a9)`);
const printProfile = () => {
  const marks = [...PROFILE, ['(end)', performance.now()]];
  const rows = marks.slice(0, -1).map(([name, t], k) => [name, Math.round(marks[k + 1][1] - t)]).sort((x, y) => y[1] - x[1]);
  console.log(`\nTHE SECTION PROFILE (B-54a9; printed, never judged): ${rows.length} part(s), ${Math.round(performance.now())} ms from the process's start`);
  for (const [name, ms] of rows) console.log(`  · ${String(ms).padStart(6)} ms  ${name}`);
};

try {
// ── §1 THE CENSUS ────────────────────────────────────────────────────────
console.log('\n§1 census');
{
  const disk = listSuiteFiles(REPO);
  const f = censusFindings(disk);
  ok(disk.length > 100, `${disk.length} scripts/test-*.mjs on disk (scope is non-vacuous)`);
  ok(!f.unclassified.length, `every suite is tiered or excluded (${f.unclassified.slice(0, 5).join(', ') || 'none missing'})`);
  ok(!f.ghosts.length && !f.inBoth.length && !f.duplicated.length && !f.badTier.length && !f.reasonless.length,
    'no ghosts / double listings / duplicates / bad tiers / reasonless entries');
  ok(f.counted.fast + f.counted.heavy + f.counted.excluded === f.counted.disk,
    `the three buckets EXACTLY partition the disk set (${f.counted.fast}+${f.counted.heavy}+${f.counted.excluded}=${f.counted.disk})`);
  // THIS suite must itself be in the census — a gate that forgets to gate
  // itself is the exact failure mode this file exists for.
  ok(SUITES.some((s) => s.name === 'test-ci-gate'), 'test-ci-gate is in a tier (the gate gates itself)');

  // NEGATIVE CONTROLS — an assert that cannot fail is not an assert.
  const nc1 = censusFindings([...disk, 'test-brand-new-and-unlisted']);
  ok(nc1.unclassified.includes('test-brand-new-and-unlisted'), 'NEG: a new unlisted suite is reported as unclassified');
  const nc2 = censusFindings(disk, [...SUITES, { name: 'test-not-on-disk', tier: 'heavy', why: 'chrome' }]);
  ok(nc2.ghosts.includes('test-not-on-disk'), 'NEG: a table entry with no file is reported as a ghost');
  const nc3 = censusFindings(disk, [...SUITES, { name: SUITES[0].name, tier: 'heavy', why: 'x' }]);
  ok(nc3.duplicated.includes(SUITES[0].name), 'NEG: a suite listed twice is reported');
  const nc4 = censusFindings(disk, [...SUITES.filter((s) => s.tier !== 'heavy'), { name: SUITES.find((s) => s.tier === 'heavy').name, tier: 'heavy' }]);
  ok(nc4.reasonless.length === 1, 'NEG: a heavy entry with no stated reason is reported');
  const nc5 = censusFindings(disk, SUITES, [...EXCLUDED, { name: SUITES[0].name, why: 'x' }]);
  ok(nc5.inBoth.includes(SUITES[0].name), 'NEG: a suite both tiered and excluded is reported');
}

// ── §2 TIER HYGIENE ──────────────────────────────────────────────────────
console.log('\n§2 tier hygiene');
{
  const fast = SUITES.filter((s) => s.tier === 'fast');
  const heavy = SUITES.filter((s) => s.tier === 'heavy');
  ok(fast.length >= 20 && heavy.length >= 20, `both tiers are real batteries (${fast.length} fast / ${heavy.length} heavy)`);
  ok(heavy.every((s) => /chrome|server|cli|binary|slow|adopted/.test(s.why || '')),
    'every heavy row names a category (chrome/server/cli/binary/slow/adopted)');
  ok(heavy.every((s) => /\d/.test(s.why || '')), 'every heavy row carries a measured number (tiering is a measurement, not an opinion)');
  // The documented exception: one real chat turn costs ~10s and real quota,
  // so by the rule it is heavy — it stays fast because it is the only proof in
  // the whole battery that a real turn works.
  ok(fast.some((s) => s.name === 'test-chat-e2e'), 'the ONE real haiku turn stays in the FAST tier (owner decision)');
  // A chrome suite in the fast tier would silently reintroduce the 70s+ cost
  // the split exists to remove.
  const chromeInFast = fast.filter((s) => /chrome/.test(s.why || ''));
  ok(!chromeInFast.length, `no chrome suite in the fast tier (${chromeInFast.map((s) => s.name).join(', ') || 'clean'})`);

  // §2b THE TIER RULE (B-f4cb, 2026-09-27 — ci.mjs, above the table). The fast
  // tier had grown to 184 suites / ~1050 s here and > 15 min on the runner, one
  // reasonable exception at a time, because nothing but a running total said
  // what belonged in it. Now a RULE does, and it is asserted: every fast row's
  // why begins with its KIND and carries its measured time (< FAST_MAX_MS
  // unless it is the named EXCEPTION), and the grep-derived disqualifiers —
  // a scratch server, a browser, a checkout, a real external program — hit
  // only what its row explicitly `allow`s, each allowance used.
  const src = (n) => { try { return fs.readFileSync(path.join(REPO, 'scripts', n + '.mjs'), 'utf-8'); } catch { return ''; } };
  const ruleBad = fast.map((s) => [s.name, fastRuleFindings(s, src(s.name))]).filter(([, r]) => r.problems.length);
  ok(!ruleBad.length, `every fast row obeys THE TIER RULE (${ruleBad.map(([n, r]) => `${n}: ${r.problems.join('; ')}`).join(' | ') || `${fast.length} rows clean`})`);
  const allowed = fast.filter((s) => (s.allow || []).length);
  ok(allowed.length > 0 && allowed.length <= 5 && allowed.every((s) => /^(LAW|EXCEPTION)\b/.test(s.why || '')),
    `the allowances are few and each on a named LAW / EXCEPTION row (${allowed.map((s) => `${s.name}[${s.allow.join(',')}]`).join(', ')})`);
  const exceptions = fast.filter((s) => /^EXCEPTION\b/.test(s.why || '')).map((s) => s.name);
  ok(exceptions.join() === 'test-chat-e2e', `there is ONE exception, the owner's real turn (${exceptions.join(', ') || 'none'})`);
  // B-5a57 (lane bl-scratch, 2026-11-17): THE ONE REAL TURN'S MISSING REPLY SAYS WHY — scripts/chat-e2e-why.mjs, read by that
  // row on a miss; its legs live HERE because the real turn runs almost nowhere (VS_NO_REAL_CLI skips it by name, the trains skip it)
  {
    const W = await import('./chat-e2e-why.mjs');
    const meta = JSON.stringify({ type: 'msg', op: 'meta', subtype: 'turn_complete' });
    const lim = W.whyNoReply({ frames: [meta], buffer: JSON.stringify({ type: 'result', subtype: 'success', is_error: true, num_turns: 1, result: "You've reached your Haiku limit · resets 3am" }) + '\n' });
    ok(lim.kind === 'limit' && lim.result?.subtype === 'success' && lim.result?.is_error === true && /Haiku limit/.test(lim.text), `B-5a57: the result record is read from the session's buffer (never the hub's turn_complete meta), and a limit in the CLI's own words is the account's: ${JSON.stringify(lim)}`);
    const metaOnly = W.whyNoReply({ frames: [meta] });
    ok(metaOnly.result === null && metaOnly.kind === 'none', `B-5a57: the hub's turn_complete meta is no result record (${JSON.stringify(metaOnly)})`);
    const OLD = /"is_error":\s*true|API Error|rate.?limit|overloaded|"status":\s*(429|529)|usage limit|credit balance/i;   // the release's classifier
    const banner = [JSON.stringify({ type: 'msg', op: 'create', role: 'system', text: "You've hit your limit · resets 5pm" })];
    ok(!banner.some((f) => OLD.test(f)) && W.whyNoReply({ frames: banner }).kind === 'limit', "B-5a57 CONTROL: the release's classifier misses «You've hit your limit» in a system message (a limit turned into a RED); the reader reads it with the product's parseLimitBanner");
    ok(W.classOf('OAuth token has expired') === 'auth' && W.classOf('{"type":"not_found_error","message":"model: claude-haiku-4-5-20251001"}') === 'model' && W.classOf('Overloaded') === 'api' && W.classOf('CANARY_GREEN') === null,
      'B-5a57: an expired token is auth, a model no longer served is model, an outage is api, anything else none');
    const tok = ['sk', 'ant', 'oat01', 'Q'.repeat(40)].join('-');   // a token shape, built at run time
    const m = W.maskText(`invalid x-api-key ${tok} for someone@example.invalid on claude-haiku-4-5-20251001`);
    ok(!m.includes('Q'.repeat(20)) && !m.includes('@') && m.includes('claude-haiku-4-5-20251001'), `B-5a57: the mask takes token shapes and addresses, never a model id: ${m}`);
    // B-5a57 cure (主开发 08:54Z): A SKIP IS NOT A GREEN AND ITS ROAD IS NARROW — only THIS turn's own failure skips
    const SID = 'sess-e2e-1', mk = (o) => JSON.stringify(o);
    const before = [mk({ type: 'created', sessionId: SID }), mk({ type: 'msg', sessionId: SID, op: 'create', message: { role: 'system', text: "You've hit your limit · resets 5pm" } })];   // an EARLIER turn's
    const planted = [...before, mk({ type: 'usage-update', text: "You've hit your limit · resets 3pm" }), mk({ type: 'msg', sessionId: 'sess-other-2', op: 'create', message: { role: 'system', text: 'API Error: 529 overloaded' } }), mk({ type: 'msg', sessionId: SID, op: 'meta', subtype: 'turn_complete' })];
    const red = W.skipVerdict({ frames: planted, buffer: '', sessionId: SID, from: before.length });
    ok(red.skip === false && red.own === 1, `B-5a57 cure: a planted break (no reply, no failure of its own) beside a usage broadcast's limit, another conversation's API error and an earlier turn's limit stays RED (${JSON.stringify({ skip: red.skip, own: red.own, kind: red.kind })})`);
    ok(planted.some((f) => OLD.test(f)), "B-5a57 cure CONTROL: the release's whole-frame classifier reads every frame — it would have skipped that break");
    const ownLimit = W.skipVerdict({ frames: [...planted, mk({ type: 'msg', sessionId: SID, op: 'create', message: { role: 'system', text: "You've hit your limit · resets 7pm" } })], sessionId: SID, from: before.length });
    const ownApi = W.skipVerdict({ frames: planted, sessionId: SID, from: before.length, buffer: mk({ type: 'result', subtype: 'success', is_error: true, result: 'API Error: 529 Overloaded' }) + '\n' });
    const bareErr = W.skipVerdict({ frames: planted, sessionId: SID, from: before.length, buffer: mk({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'spawn ENOENT' }) + '\n' });
    ok(ownLimit.skip && ownLimit.kind === 'limit' && ownApi.skip && ownApi.kind === 'api' && !bareErr.skip && W.skipVerdict({ frames: planted, sessionId: SID, from: before.length, otelApiErrors: 1 }).skip && !W.skipVerdict({ frames: planted, from: 0 }).skip,
      `B-5a57 cure: THIS turn's own limit frame skips (${ownLimit.kind}), its own buffer's API failure skips (${ownApi.kind}), the hub's api_error count skips; a bare is_error does not (${bareErr.kind}); no session id ⇒ nothing is its own`);
    // …and the CLI ANSWERED (its own result record: is_error false) ⇒ a lost reply is ours, RED — whatever the hub counted (a retried
    // 529, a background request) or a retry label of this session said (the reader's must, 09:2xZ)
    const retried = [...planted, mk({ type: 'msg', sessionId: SID, op: 'meta', subtype: 'streaming-label', text: 'API retrying (1/10, 529 overloaded)…' })];
    const answered = W.skipVerdict({ frames: retried, sessionId: SID, from: before.length, otelApiErrors: 1, buffer: mk({ type: 'result', subtype: 'success', is_error: false, num_turns: 1, result: 'CANARY_GREEN' }) + '\n' });
    ok(answered.skip === false && /succeeded/.test(answered.evidence), `B-5a57 cure: the CLI answered (a success record), the hub counted an api_error and a retry label said «overloaded» — still RED: the reply was lost on our side (${JSON.stringify({ skip: answered.skip, evidence: answered.evidence })})`);
    // the wiring: the real suite asks THIS verdict over THIS turn, counts every SKIP, and never prints ALL PASS over one
    const e2e = src('test-chat-e2e'), fromIdx = e2e.indexOf('const turnFrom = frames.length;'), sendIdx = e2e.indexOf("ws.send(JSON.stringify({ type: 'chat-input'");
    ok(e2e.includes('skipVerdict({ frames, buffer, sessionId: sid, from: turnFrom, otelApiErrors })') && fromIdx > 0 && fromIdx < sendIdx && !e2e.includes('frames.find((s) => /') && (e2e.match(/⚠ SKIP/g) || []).length === 1 && e2e.includes('else if (verdict.skip) skip(`') && e2e.includes("skipped ? `\\n${skipped} SKIPPED — not a pass"),
      'B-5a57 cure: test-chat-e2e asks skipVerdict over its own session from its prompt on, keeps no whole-frame classifier, counts every SKIP and never closes ALL PASS over one');
  }
  const measured = fast.map((s) => fastRuleFindings(s, '').measuredMs || 0);
  const budget = measured.reduce((a, b) => a + b, 0);
  ok(FAST_SUM_CAP_MS === 2610 * 1000, `the fast tier's sum cap is 2610 s (2026-11-26, int416: +1006 s UP by arithmetic — the hotfix's stated truth through list line 2290: 2609.990 s over 951 fast rows; 2026-11-26, int416: +1002 s UP by arithmetic — the hotfix's stated truth through list line 2287: 2605.090 s over 950 fast rows; 2026-11-26, int416: +1000 s UP by arithmetic — the hotfix's stated truth through list line 2284: 2603.690 s over 949 fast rows; 2026-11-26, int416: +999 s UP by arithmetic — the hotfix's stated truth through list line 2277: 2602.590 s over 949 fast rows; 2026-11-26, int416: +998 s UP by arithmetic — the hotfix's stated truth through list line 2215: 2601.017 s over 948 fast rows; 2026-11-26, int416: +993 s UP by arithmetic — the hotfix's stated truth through list line 2263: 2596.517 s over 947 fast rows; 2026-11-26, int416: +989 s UP by arithmetic — the hotfix's stated truth through list line 2258: 2592.217 s over 946 fast rows; 2026-11-26, int416: +986 s UP by arithmetic — the hotfix's stated truth through list line 2243: 2589.417 s over 946 fast rows; 2026-11-26, int416: +985 s UP by arithmetic — the hotfix's stated truth through list line 2238: 2588.717 s over 945 fast rows; 2026-11-26, int416: +982 s UP by arithmetic — the hotfix's stated truth through list line 2226: 2585.780 s over 945 fast rows; 2026-11-26, int416: +973 s UP by arithmetic — the hotfix's stated truth through list line 2225: 2576.080 s over 942 fast rows; 2026-11-26, int416: +970 s UP by arithmetic — the hotfix's stated truth through list line 2213: 2573.180 s over 942 fast rows; 2026-11-26, int416: +967 s UP by arithmetic — the hotfix's stated truth through list line 2211: 2570.380 s over 942 fast rows; 2026-11-26, int416: +964 s UP by arithmetic — the hotfix's stated truth through list line 2210: 2567.280 s over 941 fast rows; 2026-11-26, int416: +963 s UP by arithmetic — the hotfix's stated truth through list line 2209: 2566.580 s over 940 fast rows; 2026-11-26, int416: +961 s UP by arithmetic — the hotfix's stated truth through list line 2206: 2564.980 s over 939 fast rows; 2026-11-26, int416: +956 s UP by arithmetic — the hotfix's stated truth through list line 2192: 2559.280 s over 937 fast rows; 2026-11-26, int416: +955 s UP by arithmetic — the hotfix's stated truth through list line 2191: 2558.980 s over 936 fast rows; 2026-11-26, int416: +947 s UP by arithmetic — the hotfix's stated truth through list line 2190: 2550.980 s over 935 fast rows; 2026-11-26, int416: +946 s UP by arithmetic — the hotfix's stated truth through list line 2189: 2549.280 s over 935 fast rows; 2026-11-26, int416: +945 s UP by arithmetic — the hotfix's stated truth through list line 2183: 2548.670 s over 934 fast rows; 2026-11-26, int416: +948 s UP by arithmetic — the hotfix's stated truth through list line 2178: 2551.270 s over 934 fast rows; 2026-11-26, int416: +945 s UP by arithmetic — the hotfix's stated truth through list line 2171: 2548.300 s over 933 fast rows; 2026-11-26, int416: +944 s UP by arithmetic — the hotfix's stated truth through list line 2167: 2547.100 s over 932 fast rows; 2026-11-26, int416: +943 s UP by arithmetic — the hotfix's stated truth through list line 2166: 2546.800 s over 931 fast rows; 2026-11-26, int416: +942 s UP by arithmetic — the hotfix's stated truth through list line 2164: 2545.100 s over 931 fast rows; 2026-11-26, int416: +936 s UP by arithmetic — the hotfix's stated truth through list line 2160: 2539.200 s over 930 fast rows; 2026-11-26, int416: +930 s UP by arithmetic — the hotfix's stated truth through list line 2154: 2533.800 s over 930 fast rows; 2026-11-26, int416: +929 s UP by arithmetic — the hotfix's stated truth through list line 2151: 2532.716 s over 929 fast rows; 2026-11-26, int416: +928 s UP by arithmetic — the hotfix's stated truth through list line 2150: 2531.316 s over 929 fast rows; 2026-11-26, int416: +925 s UP by arithmetic — the hotfix's stated truth through list line 2149: 2528.816 s over 928 fast rows; 2026-11-26, int416: +908 s UP by arithmetic — the hotfix's stated truth through list line 2148: 2511.116 s over 925 fast rows; hotfix 2.369.421, lane paced-wake-retry: +2 s by arithmetic — test-claude-steer 0.6 → 2.3 s, the stated truth 2509.416 s; 2026-11-26, int416: +904 s UP by arithmetic — the hotfix's stated truth through list line 1065: 2507.716 s over 925 fast rows; 2026-11-25, int416: +903 s UP by arithmetic — the train 2.369.420 after bl-chat-b's three tests-only commits (test-store-read-three restated to its alone reading after its cure, 主开发 r4831): 2506.516 s over 925 fast rows; 2026-11-25, int416: +908 s UP by arithmetic — the train 2.369.420's table commit (two rows restated to their alone readings, 主开发 r4789): 2511.116 s over 925 fast rows; 2026-11-25, int416: +900 s UP by arithmetic — the hotfix's stated truth through list line 1058: 2503.403 s over 925 fast rows; 2026-11-25, int416: +906 s UP by arithmetic — the hotfix's stated truth through list line 1057: 2509.303 s over 923 fast rows; 2026-11-25, int416: +945 s UP by arithmetic — the hotfix's stated truth through list line 1051: 2548.403 s over 923 fast rows; 2026-11-25, int416: +942 s UP by arithmetic — the hotfix's stated truth through list line 1050: 2545.703 s over 922 fast rows; 2026-11-25, int416: +935 s UP by arithmetic — the hotfix's stated truth through list line 1047: 2538.903 s over 921 fast rows; 2026-11-25, int416: +937 s UP by arithmetic — the hotfix's stated truth through list line 1033: 2540.303 s over 921 fast rows; 2026-11-25, int416: +930 s UP by arithmetic — the hotfix's stated truth through list line 987: 2533.103 s over 920 fast rows; 2026-11-25, int416: +929 s UP by arithmetic — the hotfix's stated truth through list line 1029: 2532.403 s over 919 fast rows; 2026-11-25, int416: +931 s UP by arithmetic — the hotfix's stated truth through list line 1028: 2534.603 s over 919 fast rows; 2026-11-25, int416: +927 s UP by arithmetic — the hotfix's stated truth through list line 1026: 2530.503 s over 919 fast rows; 2026-11-25, int416: +920 s UP by arithmetic — the hotfix's stated truth through list line 1022: 2523.303 s over 918 fast rows; 2026-11-25, int416: +919 s UP by arithmetic — the hotfix's stated truth through list line 1016: 2522.208 s over 918 fast rows; 2026-11-25, int416: +916 s UP by arithmetic — the hotfix's stated truth through list line 1002: 2519.808 s over 918 fast rows; 2026-11-25, int416: +915 s UP by arithmetic — the hotfix's stated truth through list line 1004: 2518.608 s over 918 fast rows; 2026-11-25, int416: +914 s UP by arithmetic — the hotfix's stated truth through list line 1020: 2517.508 s over 918 fast rows; 2026-11-25, int416: +915 s UP by arithmetic — the hotfix's stated truth through list line 1013: 2518.508 s over 918 fast rows; 2026-11-25, int416: +912 s UP by arithmetic — the hotfix's stated truth through list line 1012: 2515.508 s over 916 fast rows; 2026-11-25, int416: +906 s UP by arithmetic — the hotfix's stated truth through list line 1008: 2509.208 s over 916 fast rows; 2026-11-25, int416: +893 s UP by arithmetic — the hotfix's stated truth through list line 988: 2496.908 s over 914 fast rows; 2026-11-25, int416: +892 s UP by arithmetic — the hotfix's stated truth through list line 959: 2495.708 s over 913 fast rows; 2026-11-25, int416: +891 s UP by arithmetic — the hotfix's stated truth through list line 955: 2494.808 s over 912 fast rows; 2026-11-25, int416: +886 s UP by arithmetic — the hotfix's stated truth through list line 954: 2489.208 s over 911 fast rows; 2026-11-25, int416: +885 s UP by arithmetic — the hotfix's stated truth through list line 944: 2488.408 s over 911 fast rows; 2026-11-25, int416: +882 s UP by arithmetic — the hotfix's stated truth through list line 941: 2485.408 s over 909 fast rows; 2026-11-25, int416: +878 s UP by arithmetic — the hotfix's stated truth through list line 928: 2481.908 s over 909 fast rows; 2026-11-25, int416: +877 s UP by arithmetic — the hotfix's stated truth through list line 927: 2480.008 s over 908 fast rows; 2026-11-25, int416: +875 s UP by arithmetic — the hotfix's stated truth through list line 888: 2478.408 s over 907 fast rows; 2026-11-25, int416: +868 s UP by arithmetic — the hotfix's stated truth through list line 886: 2471.308 s over 906 fast rows; 2026-11-25, int416: +867 s UP by arithmetic — the hotfix's stated truth through list line 750: 2470.508 s over 905 fast rows; 2026-11-24, int416: +865 s UP by arithmetic — the hotfix's stated truth through list line 883: 2468.608 s over 904 fast rows; 2026-11-24, int416: +866 s UP by arithmetic — the hotfix's stated truth through list line 881: 2469.008 s over 904 fast rows; 2026-11-24, int416: +863 s UP by arithmetic — the hotfix's stated truth through list line 757: 2466.508 s over 904 fast rows; 2026-11-24, int416: +862 s UP by arithmetic — the hotfix's stated truth through list line 782: 2465.608 s over 903 fast rows; 2026-11-24, int416: +857 s UP by arithmetic — the hotfix's stated truth through list line 615: 2460.608 s over 902 fast rows; 2026-11-24, int416: +894 s UP by arithmetic — the hotfix's stated truth through list line 882: 2497.078 s over 901 fast rows; 2026-11-24, int416: +893 s UP by arithmetic — the hotfix's stated truth through list line 823: 2496.578 s over 901 fast rows; 2026-11-24, int416: +889 s UP by arithmetic — the hotfix's stated truth through list line 835: 2492.578 s over 901 fast rows; 2026-11-24, int416: +888 s UP by arithmetic — the hotfix's stated truth through list line 894: 2491.978 s over 900 fast rows; 2026-11-24, int416: +882 s UP by arithmetic — the hotfix's stated truth through list line 913: 2485.978 s over 900 fast rows; 2026-11-24, int416: +880 s UP by arithmetic — the hotfix's stated truth through list line 864: 2483.278 s over 900 fast rows; 2026-11-24, int416: +876 s UP by arithmetic — the hotfix's stated truth through list line 891: 2479.578 s over 899 fast rows; 2026-11-24, int416: +871 s UP by arithmetic — the hotfix's stated truth through list line 841: 2474.781 s over 899 fast rows; 2026-11-24, int416: +866 s UP by arithmetic — the hotfix's stated truth through list line 806: 2469.181 s over 898 fast rows; 2026-11-24, int416: +946 s UP by arithmetic — the hotfix's stated truth through list line 872: 2549.181 s over 897 fast rows; 2026-11-24, int416: +945 s UP by arithmetic — the hotfix's stated truth through list line 858: 2548.781 s over 897 fast rows; 2026-11-24, int416: +937 s UP by arithmetic — the hotfix's stated truth through list line 857: 2540.381 s over 896 fast rows; 2026-11-24, int416: +932 s UP by arithmetic — the hotfix's stated truth through list line 852: 2535.281 s over 896 fast rows; 2026-11-24, int416: +927 s UP by arithmetic — the hotfix's stated truth through list line 851: 2530.281 s over 896 fast rows; 2026-11-24, int416: +923 s UP by arithmetic — the hotfix's stated truth through list line 708: 2526.381 s over 895 fast rows; 2026-11-24, int416: +920 s UP by arithmetic — the hotfix's stated truth through list line 785: 2523.281 s over 894 fast rows; 2026-11-24, int416: +912 s UP by arithmetic — the hotfix's stated truth through list line 816: 2515.181 s over 893 fast rows; 2026-11-24, int416: +910 s UP by arithmetic — the hotfix's stated truth through list line 761: 2513.481 s over 893 fast rows; 2026-11-24, int416: +901 s UP by arithmetic — the hotfix's stated truth through list line 867: 2504.481 s over 891 fast rows; 2026-11-24, lane bl-mail: +3 s UP by arithmetic — test-roster-per-pass restated 6.8 → 9.8 s alone: 2502.981 s over 891 fast rows; 2026-11-24, int416: +896 s UP by arithmetic — the hotfix's stated truth through list line 818: 2499.981 s over 891 fast rows; 2026-11-24, int416: +914 s UP by arithmetic — the hotfix's stated truth through list line 834: 2517.381 s over 890 fast rows; 2026-11-24, int416: +912 s UP by arithmetic — the hotfix's stated truth through list line 812: 2515.881 s over 889 fast rows; 2026-11-24, int416: +907 s UP by arithmetic — the hotfix's stated truth through list line 729: 2510.181 s over 888 fast rows; 2026-11-24, int416: +906 s UP by arithmetic — the hotfix's stated truth through list line 824: 2509.581 s over 887 fast rows; 2026-11-24, int416: +904 s UP by arithmetic — the hotfix's stated truth through list line 822: 2507.381 s over 887 fast rows; 2026-11-24, int416: +901 s UP by arithmetic — the hotfix's stated truth through list line 784: 2504.381 s over 887 fast rows; 2026-11-24, int416: +900 s UP by arithmetic — the hotfix's stated truth through list line 817: 2503.830 s over 887 fast rows; 2026-11-24, int416: +899 s UP by arithmetic — the hotfix's stated truth through list line 807: 2502.430 s over 886 fast rows; 2026-11-24, int416: +898 s UP by arithmetic — the hotfix's stated truth through list line 783: 2501.833 s over 885 fast rows; 2026-11-24, int416: +885 s UP by arithmetic — the hotfix's stated truth through list line 791: 2488.233 s over 883 fast rows; 2026-11-24, lane bl-machines-b, line 469 formed again on 2.369.418, r3584: +1 s UP by arithmetic — its row restated as taken; the stated truth 2486.633 s over 881 fast rows; 2026-11-24, int416: +882 s UP by arithmetic — the hotfix's stated truth through list line 787: 2485.833 s over 881 fast rows; 2026-11-24, int416: +883 s UP by arithmetic — the hotfix's stated truth through list line 776: 2486.933 s over 881 fast rows; 2026-11-24, int416: +882 s UP by arithmetic — the hotfix's stated truth through list line 769: 2485.699 s over 881 fast rows; 2026-11-24, int416: +873 s UP by arithmetic — the hotfix's stated truth through list line 778: 2476.999 s over 880 fast rows; 2026-11-24, int416: +887 s UP by arithmetic — the hotfix's stated truth through list line 766: 2490.299 s over 880 fast rows; 2026-11-24, int416: +882 s UP by arithmetic — the hotfix's stated truth through list line 765: 2485.799 s over 878 fast rows; 2026-11-24, int416: +880 s UP by arithmetic — the hotfix's stated truth through list line 773: 2483.099 s over 878 fast rows; 2026-11-24, int416: +879 s UP by arithmetic — the hotfix's stated truth through list line 771: 2482.499 s over 877 fast rows; 2026-11-24, int416: +878 s UP by arithmetic — the hotfix's stated truth through list line 760: 2481.299 s over 875 fast rows; 2026-11-24, int416: +882 s UP by arithmetic — the hotfix's stated truth through list line 758: 2485.199 s over 875 fast rows; 2026-11-24, int416: +883 s UP by arithmetic — the hotfix's stated truth through list line 754: 2486.399 s over 873 fast rows; 2026-11-24, int416: +903 s UP by arithmetic — the hotfix's stated truth through list line 752: 2506.399 s over 873 fast rows; 2026-11-24, int416: +914 s UP by arithmetic — the hotfix's stated truth through list line 668: 2517.599 s over 873 fast rows; 2026-11-24, int416: +909 s UP by arithmetic — the hotfix's stated truth through list line 696b: 2512.299 s over 873 fast rows; 2026-11-24, int416: +906 s UP by arithmetic — the hotfix's stated truth through list line 661: 2509.299 s over 873 fast rows; 2026-11-24, int416: +911 s UP by arithmetic — the hotfix's stated truth through list line 517: 2514.999 s over 873 fast rows; 2026-11-24, int416: +923 s UP by arithmetic — the hotfix's stated truth through list line 666: 2526.699 s over 873 fast rows; 2026-11-24, int416: +922 s UP by arithmetic — the hotfix's stated truth through list line 696: 2525.999 s over 872 fast rows; 2026-11-24, int416: +919 s UP by arithmetic — the hotfix's stated truth through list line 657: 2522.899 s over 872 fast rows; 2026-11-24, int416: +918 s UP by arithmetic — the hotfix's stated truth through list line 631: 2521.999 s over 871 fast rows; 2026-11-24, int416: +961 s UP by arithmetic — the hotfix's stated truth through list line 593: 2564.499 s over 871 fast rows; 2026-11-24, int416: +966 s UP by arithmetic — the hotfix's stated truth through list line 582: 2569.899 s over 871 fast rows; 2026-11-24, int416: +961 s UP by arithmetic — the hotfix's stated truth through list line 580: 2564.099 s over 870 fast rows; 2026-11-24, int416: +960 s UP by arithmetic — the hotfix's stated truth through list line 607: 2563.499 s over 869 fast rows; 2026-11-24, int416: +956 s UP by arithmetic — the hotfix's stated truth through list line 655: 2559.699 s over 868 fast rows; 2026-11-24, int416: +955 s UP by arithmetic — the hotfix's stated truth through list line 575: 2558.299 s over 868 fast rows; 2026-11-24, int416: +953 s UP by arithmetic — the hotfix's stated truth through list line 572: 2556.499 s over 868 fast rows; 2026-11-24, int416: +948 s UP by arithmetic — the hotfix's stated truth through list line 552: 2551.999 s over 868 fast rows; 2026-11-24, int416: +947 s UP by arithmetic — the hotfix's stated truth through list line 738: 2550.799 s over 868 fast rows; 2026-11-24, int416: +948 s UP by arithmetic — the hotfix's stated truth through list line 526: 2551.199 s over 867 fast rows; 2026-11-24, int416: +962 s UP by arithmetic — the hotfix's stated truth through list line 515: 2565.099 s over 867 fast rows; 2026-11-24, int416: +961 s UP by arithmetic — the hotfix's stated truth through list line 506: 2564.299 s over 867 fast rows; 2026-11-24, int416: +956 s UP by arithmetic — the hotfix's stated truth through list line 502: 2559.299 s over 866 fast rows; 2026-11-24, int416: +954 s UP by arithmetic — the hotfix's stated truth through list line 483: 2557.499 s over 865 fast rows; 2026-11-24, int416: +953 s UP by arithmetic — the hotfix's stated truth through list line 424: 2556.411 s over 863 fast rows; 2026-11-24, int416: +943 s UP by arithmetic — the hotfix's stated truth through list line 479: 2546.411 s over 862 fast rows; 2026-11-23, int416: +942 s UP by arithmetic — the hotfix's stated truth through list line 709: 2545.311 s over 861 fast rows; 2026-11-23, int416: +941 s UP by arithmetic — the hotfix's stated truth through list line 700: 2544.411 s over 861 fast rows; 2026-11-23, int416: +938 s UP by arithmetic — the hotfix's stated truth through list line 689: 2541.211 s over 858 fast rows; 2026-11-23, int416: +931 s UP by arithmetic — the hotfix's stated truth through list line 663: 2534.111 s over 858 fast rows; 2026-11-23, int416: +930 s UP by arithmetic — the hotfix's stated truth through list line 678: 2533.211 s over 857 fast rows; 2026-11-23, int416: +929 s UP by arithmetic — the hotfix's stated truth through list line 682: 2532.911 s over 857 fast rows; 2026-11-23, int416: +930 s UP by arithmetic — the hotfix's stated truth through list line 659: 2533.411 s over 857 fast rows; 2026-11-23, int416: +929 s UP by arithmetic — the hotfix's stated truth through list line 673: 2532.611 s over 856 fast rows; 2026-11-23, card-door-in-chat: +1 s UP by arithmetic — the hotfix trial's stated truth through list line 669 2524.711 s + test-content-store-reads' 0.4 s: 2525.111 s over 855 fast rows; 2026-11-23, int416: +921 s UP by arithmetic — the hotfix's stated truth through list line 669: 2524.711 s over 854 fast rows; 2026-11-23, int416: +918 s UP by arithmetic — the hotfix's stated truth through list line 621: 2521.411 s over 853 fast rows; 2026-11-23, int416: +916 s UP by arithmetic — the hotfix's stated truth through list line 625: 2519.911 s over 852 fast rows; 2026-11-23, bl-jobs B-f276 family unit 1: +1 s UP by ARITHMETIC (the new fast row test-store-read-three, 0.6 s measured alone) to the stated truth — 2518.111 s over 850 fast rows; 2519 = the next whole second above it; 2026-11-22, int416: +914 s UP by arithmetic — the block's stated truth through list line 382: 2517.511 s over 849 fast rows; 2026-11-22, int416: +909 s UP by arithmetic — the block's stated truth through list line 516: 2512.611 s over 848 fast rows; 2026-11-22, int416: +965 s UP by arithmetic — the block's stated truth through list line 497: 2568.717 s over 848 fast rows; 2026-11-22, int416: +963 s UP by arithmetic — the block's stated truth through list line 412: 2566.717 s over 848 fast rows; 2026-11-22, int416: +961 s UP by arithmetic — the block's stated truth through list line 416: 2564.717 s over 848 fast rows; 2026-11-22, int416: +960 s UP by arithmetic — the block's stated truth through list line 438: 2563.717 s over 847 fast rows; 2026-11-22, int416: +958 s UP by arithmetic — the block's stated truth through list line 495: 2561.917 s over 846 fast rows; 2026-11-22, int416: +965 s UP by arithmetic — the block's stated truth through list line 474: 2568.817 s over 846 fast rows; 2026-11-22, int416: +963 s UP by arithmetic — the block's stated truth through list line 484: 2566.517 s over 845 fast rows; 2026-11-22, int416: +961 s UP by arithmetic — the block's stated truth through list line 464: 2564.517 s over 844 fast rows; 2026-11-22, int416: +959 s UP by arithmetic — the block's stated truth through list line 486: 2562.517 s over 843 fast rows; 2026-11-22, int416: +989 s UP by arithmetic — the block's stated truth through list line 476: 2592.017 s over 843 fast rows; 2026-11-22, int416: +988 s UP by arithmetic — the block's stated truth through list line 439: 2591.017 s over 843 fast rows; 2026-11-22, int416: +977 s UP by arithmetic — the block's stated truth through list line 466: 2580.717 s over 843 fast rows; 2026-11-22, int416: +974 s UP by arithmetic — the block's stated truth through list line 429: 2577.217 s over 842 fast rows; 2026-11-22, int416: +973 s UP by arithmetic — the block's stated truth through list line 468: 2576.217 s over 841 fast rows; 2026-11-22, int416: +972 s UP by arithmetic — the block's stated truth through list line 459: 2575.917 s over 840 fast rows; 2026-11-22, int416: +981 s UP by arithmetic — the block's stated truth through list line 440: 2584.117 s over 840 fast rows; 2026-11-22, int416: +980 s UP by arithmetic — the block's stated truth through list line 443: 2583.017 s over 840 fast rows; 2026-11-22, int416: +979 s UP by arithmetic — the block's stated truth through list line 411: 2582.217 s over 840 fast rows; 2026-11-22, int416: +971 s UP by arithmetic — the block's stated truth through list line 414: 2574.917 s over 839 fast rows; 2026-11-22, int416: +974 s UP by arithmetic — the block's stated truth through list line 413: 2577.717 s over 839 fast rows; 2026-11-22, int416: +978 s UP by arithmetic — the block's stated truth through list line 307: 2581.917 s over 839 fast rows; 2026-11-22, int416: +972 s UP by arithmetic — the block's stated truth through list line 399: 2575.917 s over 836 fast rows; 2026-11-22, int416: +977 s UP by arithmetic — the block's stated truth through list line 385: 2580.717 s over 836 fast rows; 2026-11-22, int416: +976 s UP by arithmetic — the block's stated truth through list line 397: 2579.417 s over 836 fast rows; 2026-11-22, int416: +1001 s UP by arithmetic — the block's stated truth through list line 377: 2604.517 s over 836 fast rows; 2026-11-22, int416: +1003 s UP by arithmetic — the block's stated truth through list line 371: 2606.017 s over 836 fast rows; 2026-11-22, int416: +1002 s UP by arithmetic — the block's stated truth through list line 306: 2605.517 s over 836 fast rows; 2026-11-22, int416: +991 s UP by arithmetic — the block's stated truth through list line 305: 2594.017 s over 834 fast rows; 2026-11-22, int416: +990 s UP by arithmetic — the block's stated truth through list line 316: 2593.717 s over 833 fast rows; 2026-11-21, int416: +989 s UP by arithmetic — the block's stated truth through list line 287: 2592.417 s over 832 fast rows; 2026-11-21, int416: +984 s UP by arithmetic — the block's stated truth through list line 357: 2587.417 s over 831 fast rows; 2026-11-21, int416: +344 s UP by arithmetic — the block's stated truth through list line 331: 1947.825 s over 831 fast rows; 2026-11-21, int416: +340 s UP by arithmetic — the block's stated truth through list line 311: 1943.525 s over 831 fast rows; 2026-11-21, int416: +336 s UP by arithmetic — the block's stated truth through list line 330: 1939.525 s over 831 fast rows; 2026-11-21, int416: +333 s UP by arithmetic — the block's stated truth through list line 253: 1936.325 s over 830 fast rows; 2026-11-21, int416: +324 s UP by arithmetic — the block's stated truth through list line 303: 1927.325 s over 828 fast rows; 2026-11-21, int416: +322 s UP by arithmetic — the block's stated truth through list line 297: 1925.025 s over 827 fast rows; 2026-11-21, int416: +321 s UP by arithmetic — the block's stated truth through list line 284: 1924.525 s over 827 fast rows; 2026-11-21, int416: +320 s UP by arithmetic — the block's stated truth through list line 267: 1923.925 s over 826 fast rows; 2026-11-21, int416: +310 s UP by arithmetic — the block's stated truth through list line 273: 1913.025 s over 825 fast rows; 2026-11-21, int416: +308 s UP by arithmetic — the block's stated truth through list line 270: 1911.125 s over 824 fast rows; 2026-11-21, int416: +297 s UP by arithmetic — the block's stated truth through list line 104: 1900.525 s over 823 fast rows; 2026-11-21, int416: +296 s UP by arithmetic — the block's stated truth through list line 57: 1899.115 s over 821 fast rows; 2026-11-21, int416: +291 s UP by arithmetic — the block's stated truth through list line 238: 1894.115 s over 820 fast rows; 2026-11-21, int416: +286 s UP by arithmetic — the block's stated truth through list line 256: 1889.115 s over 819 fast rows; 2026-11-21, int416: +285 s UP by arithmetic — the block's stated truth through list line 254: 1888.444 s over 818 fast rows; 2026-11-21, int416: +283 s UP by arithmetic — the block's stated truth through list line 145: 1886.744 s over 818 fast rows; 2026-11-21, int416: +280 s UP by arithmetic — the block's stated truth through list line 55: 1883.044 s over 818 fast rows; 2026-11-21, int416: +278 s UP by arithmetic — the block's stated truth through list line 250: 1881.744 s over 818 fast rows; 2026-11-21, int416: +275 s UP by arithmetic — the block's stated truth through list line 119: 1878.144 s over 818 fast rows; 2026-11-21, int416: +273 s UP by arithmetic — the block's stated truth through list line 49: 1876.044 s over 817 fast rows; 2026-11-21, int416: +272 s UP by arithmetic — the block's stated truth through list line 247: 1875.744 s over 817 fast rows; 2026-11-21, int416: +269 s UP by arithmetic — the block's stated truth through list line 246: 1872.744 s over 816 fast rows; 2026-11-21, int416: +268 s UP by arithmetic — the block's stated truth through list line 241: 1871.244 s over 816 fast rows; 2026-11-21, int416: +262 s UP by arithmetic — the block's stated truth through list line 171: 1865.944 s over 816 fast rows; 2026-11-21, int416: +203 s UP by arithmetic — the block's stated truth through list line 146: 1806.090 s over 816 fast rows; 2026-11-21, int416: +201 s UP by arithmetic — the block's stated truth through list line 64: 1804.490 s over 815 fast rows; 2026-11-21, int416: +199 s UP by arithmetic — the block's stated truth through list line 228: 1802.400 s over 814 fast rows; 2026-11-21, int416: +194 s UP by arithmetic — the block's stated truth through list line 208: 1797.800 s over 813 fast rows; 2026-11-21, int416: +189 s UP by arithmetic — the block's stated truth through list line 167: 1792.400 s over 813 fast rows; 2026-11-21, int416: +188 s UP by arithmetic — the block's stated truth through list line 158: 1791.600 s over 812 fast rows; 2026-11-21, int416: +186 s UP by arithmetic — the block's stated truth through list line 206: 1789.200 s over 811 fast rows; 2026-11-21, int416: +185 s UP by arithmetic — the block's stated truth through list line 154: 1788.000 s over 810 fast rows; 2026-11-21, int416: +150 s UP by arithmetic — the block's stated truth through list line 80: 1753.500 s over 801 fast rows; 2026-11-21, int416: +149 s UP by arithmetic — the block's stated truth through list line 29: 1752.871 s over 801 fast rows; 2026-11-21, int416: +148 s UP by arithmetic — the block's stated truth through list line 217: 1751.471 s over 800 fast rows; 2026-11-21, int416: +147 s UP by arithmetic — the block's stated truth through list line 95: 1750.171 s over 799 fast rows; 2026-11-21, int416: +112 s UP by arithmetic — the block's stated truth through list line 54: 1715.371 s over 799 fast rows; 2026-11-21, int416: +105 s UP by arithmetic — the block's stated truth through list line 26: 1708.171 s over 797 fast rows; 2026-11-21, int416: +97 s UP by arithmetic — the block's stated truth through list line 61: 1700.171 s over 796 fast rows; 2026-11-21, int416: +95 s UP by arithmetic — the block's stated truth through list line 207: 1698.171 s over 795 fast rows; 2026-11-21, int416: +94 s UP by arithmetic — the block's stated truth through list line 141: 1697.571 s over 795 fast rows; 2026-11-21, int416: +91 s UP by arithmetic — the block's stated truth through list line 209: 1694.571 s over 794 fast rows; 2026-11-21, int416: +86 s UP by arithmetic — the block's stated truth through list line 140: 1689.971 s over 793 fast rows; 2026-11-21, int416: +79 s UP by arithmetic — the block's stated truth through list line 203: 1682.471 s over 792 fast rows; 2026-11-21, int416: +75 s UP by arithmetic — the block's stated truth through list line 189: 1678.971 s over 791 fast rows; 2026-11-21, int416: +72 s UP by arithmetic — the block's stated truth through list line 172: 1675.971 s over 789 fast rows; 2026-11-21, int416: +71 s UP by arithmetic — the block's stated truth through list line 169: 1674.271 s over 789 fast rows; 2026-11-21, int416: +69 s UP by arithmetic — the block's stated truth through list line 166: 1672.171 s over 788 fast rows; 2026-11-21, int416: +67 s UP by arithmetic — the block's stated truth through list line 156: 1670.571 s over 787 fast rows; 2026-11-21, int416: +66 s UP by arithmetic — the block's stated truth through list line 139: 1669.671 s over 785 fast rows; 2026-11-21, int416: +65 s UP by arithmetic — the block's stated truth through list line 135: 1668.971 s over 784 fast rows; 2026-11-21, int416: +64 s UP by arithmetic — the block's stated truth through list line 112: 1667.438 s over 783 fast rows; 2026-11-21, int416: +57 s UP by arithmetic — the block's stated truth through list line 101: 1660.438 s over 783 fast rows; 2026-11-21, int416: +56 s UP by arithmetic — the block's stated truth through list line 91: 1659.038 s over 783 fast rows; 2026-11-21, int416: +52 s UP by arithmetic — the block's stated truth through list line 89: 1655.438 s over 783 fast rows; 2026-11-21, int416: +49 s UP by arithmetic — the block's stated truth through list line 88: 1652.638 s over 783 fast rows; 2026-11-21, int416: +50 s UP by arithmetic — the block's stated truth through list line 87: 1653.438 s over 782 fast rows; 2026-11-21, int416: +49 s UP by arithmetic — the block's stated truth through list line 71: 1652.338 s over 782 fast rows; 2026-11-21, int416: +48 s UP by arithmetic — the block's stated truth through list line 68: 1651.738 s over 782 fast rows; 2026-11-21, int416: +44 s UP by arithmetic — the block's stated truth through list line 25: 1647.738 s over 779 fast rows; 2026-11-21, int416: +43 s UP by arithmetic — the block's stated truth through list line 19: 1646.938 s over 779 fast rows; 2026-11-21, int416: +39 s UP by arithmetic — the block's stated truth through list line 13: 1642.738 s over 778 fast rows; 2026-11-21, int416: +38 s UP by arithmetic — the block's stated truth through list line 4: 1641.238 s over 777 fast rows; 2026-11-21, int416: +35 s UP by arithmetic — the block's stated truth through list line 1: 1638.375 s over 776 fast rows; 2026-11-21, int416: +30 s UP by arithmetic — the block's stated truth through list line 121: 1633.575 s over 775 fast rows; 2026-11-21, hot415: +4 s UP by arithmetic — the hotfix 2.369.415's two new fast rows: test-lark-mentions 3.8 s + test-signin-held 0.5 s = 1603.617 s over 775 fast rows; 2026-11-20, int414: +3 s UP by arithmetic over the train's 1597 (bl-loop-a B-cd4b's follow restates test-boot-probes 7.0 → 9.1 s and test-tls-demux 2.6 → 3.5 s) — the merged stated truth of the picks so far: 1599.317 s over 773 fast rows; 2026-11-20, int414: +4 s UP by arithmetic over the train's 1593 (bl-mail B-dfa4 cut 4 restates test-sliced-walk 3.4 → 7.5 s) — the merged stated truth of the picks so far: 1596.317 s over 773 fast rows; 2026-11-20, int414: +2 s UP by arithmetic over the train's 1591 (bl-keys-misc B-360d adds the fast row test-jobs-gc-off-loop, stated 1.6 s) — the merged stated truth of the picks so far: 1592.217 s over 773 fast rows; 2026-11-20, int414: +1 s UP by arithmetic over the train's 1590 (bl-release B-9407 restates test-jobs-addressed 3.5 → 4.9 s) — the merged stated truth of the picks so far: 1590.617 s over 772 fast rows; 2026-11-20, int414: +5 s UP by arithmetic over the train's 1585 (bl-jobs B-54b7 restates test-notify-retry 5.2 → 5.6 s; lg-recovery B-299b restates test-artifacts-handover 0.11 → 4.4 s) — the merged stated truth of the picks so far: 1589.217 s over 772 fast rows; 2026-11-20, int414: +2 s UP by arithmetic over the train's 1583 (lg-leak-census restates test-ledger-dedup-law 0.45 → 2.2 s) — the merged stated truth of the picks so far: 1584.527 s over 772 fast rows; 2026-11-20, int414: +1 s UP by arithmetic over the train's 1582 (B-460d's remainder restates test-sysinfo-op 1.86 → 2.3 s) — the merged stated truth of the picks so far: 1582.277 s over 771 fast rows; 2026-11-20, int414: +1 s UP by arithmetic over the train's 1581 (B-8703 unit 1 restates test-needs-doors 5.9 → 6.2 s) — the merged stated truth of the picks so far: 1581.137 s over 770 fast rows; 2026-11-20, int414: +2 s UP by arithmetic over the train's 1579 (lane lg-store-writes r621 adds the fast row test-fd-close-census, stated 2.5 s) — the merged stated truth of the picks so far: 1580.837 s over 770 fast rows; 2026-11-20, int414: +2 s UP by arithmetic over the train's 1577 (B-dfa4 cut 3b restates test-store-writer-laws 8.0 → 9.0 s and test-sliced-walk 2.5 → 3.4 s) — the merged stated truth of the picks so far: 1578.337 s over 769 fast rows; 2026-11-20, int414: +11 s UP by arithmetic over the train's 1566 (B-147f adds the fast row test-agentd-stay, stated 8.6 s, and restates test-hub-start-failures 2.3 → 4.4 s) — the merged stated truth of the picks so far: 1576.437 s over 769 fast rows; 2026-11-20, int414: +1 s UP by arithmetic over the train's 1565 (B-37bc adds the fast row test-window-own-stamp, stated 1.6 s) — the merged stated truth of the picks so far: 1565.737 s over 768 fast rows; 2026-11-20, int414: +3 s UP by arithmetic over the train's 1562 (B-e674 unit 1 adds the fast row test-browser-front-tab, stated 2.3 s) — the merged stated truth of the picks so far: 1564.137 s over 767 fast rows; 2026-11-20, int414: +4 s UP by arithmetic over the train's 1558 (r406 adds the fast row test-ci-heavy-queue-window, stated 4.1 s) — the merged stated truth of the picks so far: 1561.837 s over 766 fast rows; 2026-11-20, int414: +2 s UP by arithmetic over the train's 1556 (B-225b adds the fast row test-store-held-page, stated 0.3 s; B-5278 unit 1 adds test-usage-walk-bounds, stated 2.0 s) — the merged stated truth of the picks so far: 1557.737 s over 765 fast rows; 2026-11-20, int414: +3 s UP by arithmetic over the train's 1553 (B-dfa4 cut 3 adds the fast row test-sliced-walk, stated 2.5 s) — the merged stated truth of the picks so far: 1555.437 s over 763 fast rows; 2026-11-20, int414: +5 s UP by arithmetic over the train's 1548 (B-ef1b restated test-vault-paste 1.7 → 6.0 s; B-3992 adds the fast row test-job-may-read, stated 0.8 s) — the merged stated truth of the picks so far: 1552.937 s over 762 fast rows; 2026-11-20, int414: +1 s UP by arithmetic over the train's 1547 (B-95fc adds the fast row test-peer-state, stated 1.0 s) — the merged stated truth of the picks so far: 1547.837 s over 761 fast rows (B-7ca1 restated test-stop-tree 8.6 → 9.2 s: +0.6 s, the cap holds at 1548); 2026-11-20, int414: +2 s UP by arithmetic over the train's 1545 (D8 adds the fast row test-answer-caps, stated 1.5 s) — the merged stated truth of the picks so far: 1546.237 s over 760 fast rows; 2026-11-20, int414: +1 s UP by arithmetic over the train's 1544 (B-44f3's remainder restated test-todos-held-census 3.1 → 4.4 s) — the merged stated truth of the picks so far: 1544.737 s over 759 fast rows; 2026-11-20, lane hub-loop-stalls B-23e5 moved onto the train: + test-safe-fs-path-memory 9.0 s by arithmetic over the train's 1534.437 — 1543.437 s; before: 2026-11-20, int414: +1 s UP by arithmetic over the train's 1534 (B-1ca5 restated test-channel-revisions 7.0 → 8.0 s) — the merged stated truth of the picks so far: 1534.437 s over 758 fast rows; 2026-11-20, int414: −1 s DOWN by arithmetic over the train's 1535 (B-d833 restated test-dir-complete 8.0 → 7.4 s) — the merged stated truth of the picks so far: 1533.437 s over 758 fast rows; 2026-11-20, B-acb9: +1 s UP by arithmetic over the train's 1534 — test-browser-profile-commands stated 0.1 s: 1534.037 s over 758 fast rows; 2026-11-20, B-24e2: +2 s UP by arithmetic over the train's 1532 — test-cli-level-scan stated 2.5 s: 1533.937 s over 757 fast rows; 2026-11-20, B-0248's stack: +6 s UP by arithmetic — test-store-writer-r4 restated 2 → 5 s, test-deferred-save-census new at 3 s: 1531.437 s over 756 rows; 2026-11-20, int414: +7 s UP by arithmetic — the merged stated truth of the picks so far: 1525.437 s over 755 fast rows; 2026-11-20, B-5a4d: +4 s UP by arithmetic — test-queue-putback restated 0.2 → 3.5 s, measured 3.4 s; 2026-11-19, int413: +69 s UP by arithmetic — the merged stated truth of the picks so far: 1518.937 s over 755 fast rows; 2026-11-19, int413: +62 s UP by arithmetic — the merged stated truth of the picks so far: 1511.937 s over 752 fast rows; 2026-11-19, int413: +61 s UP by arithmetic — the merged stated truth of the picks so far: 1510.537 s over 752 fast rows; 2026-11-19, int413: +60 s UP by arithmetic — the merged stated truth of the picks so far: 1509.037 s over 752 fast rows; 2026-11-19, int413: +58 s UP by arithmetic — the merged stated truth of the picks so far: 1507.637 s over 752 fast rows; 2026-11-19, int413: +55 s UP by arithmetic — the merged stated truth of the picks so far: 1504.237 s over 751 fast rows; 2026-11-19, int413: +54 s UP by arithmetic — the merged stated truth of the picks so far: 1503.937 s over 751 fast rows; 2026-11-19, int413: +50 s UP by arithmetic — the merged stated truth of the picks so far: 1499.287 s over 749 fast rows; 2026-11-20, .413, bl-tests-a on b7ab4738b: +7 s UP by arithmetic — test-dir-complete restated 3.4 → 8.5 s: 1494.087 s over 748 fast rows; 2026-11-19, B-af94 (bl-machines-a) moved onto the 2.369.413 checkpoint 2 candidate 3a207bf23: +2 s UP by arithmetic — the stated truth there, 1485.587 s over 747 fast rows, + its new fast row test-mount-error-words 2.1 s: 1487.687 s over 748 fast rows; 2026-11-19, int413: +36 s UP by arithmetic — the merged stated truth of the picks so far: 1485.587 s over 747 fast rows; 2026-11-19, .413, bl-tests-a: +1 s UP by arithmetic — B-0f3d's restated test-dir-complete over checkpoint 2 with B-08d5's row: 1481.537 s over 747 fast rows; 2026-11-19, int413: +31 s UP by arithmetic — the merged stated truth of the picks so far: 1480.137 s over 746 fast rows; 2026-11-19, int413: +13 s UP by arithmetic — the merged stated truth of the picks so far: 1462.921 s over 735 fast rows; 2026-11-19, lane bl-loop-a ckpt61 starter-emfile: + test-hub-start-failures 2.3 s by its measure (split out of test-hub-program-starts, whose row is the base's); the stated sum 1447.248 + 2.3 = 1449.548 s ⇒ 1450 by arithmetic. Before: 2026-11-19, int411: +195 s UP by arithmetic — the merged stated truth of the picks so far: 1447.248 s over 728 fast rows; 2026-11-19, int411: +190 s UP by arithmetic — the merged stated truth of the picks so far: 1442.098 s over 726 fast rows; 2026-11-18, int411: +182 s UP by arithmetic — the merged stated truth of the picks so far: 1434.178 s over 726 fast rows; 2026-11-18, int411: +181 s UP by arithmetic — the merged stated truth of the picks so far: 1430.678 s over 725 fast rows; 2026-11-18, int411: +175 s UP by arithmetic — the merged stated truth of the picks so far: 1424.658 s over 724 fast rows; 2026-11-18, int411: +167 s UP by arithmetic — the merged stated truth of the picks so far: 1416.258 s over 724 fast rows; 2026-11-18, int411: +165 s UP by arithmetic — the merged stated truth of the picks so far: 1414.858 s over 724 fast rows; 2026-11-18, int411: +163 s UP by arithmetic — the merged stated truth of the picks so far: 1412.688 s over 722 fast rows; 2026-11-18, int411: +151 s UP by arithmetic — the merged stated truth of the picks so far: 1400.688 s over 719 fast rows; 2026-11-18, int411: +150 s UP by arithmetic — the merged stated truth of the picks so far: 1399.588 s over 719 fast rows; 2026-11-18, int411: +147 s UP by arithmetic — the merged stated truth of the picks so far: 1396.088 s over 718 fast rows; 2026-11-18, int411: +145 s UP by arithmetic — the merged stated truth of the picks so far: 1394.844 s over 718 fast rows; 2026-11-18, int411: +142 s UP by arithmetic — the merged stated truth of the picks so far: 1391.944 s over 718 fast rows; 2026-11-18, int411: +145 s UP by arithmetic — the merged stated truth of the picks so far: 1394.344 s over 718 fast rows; 2026-11-18, int411: +115 s UP by arithmetic — the merged stated truth of the picks so far: 1364.344 s over 718 fast rows; 2026-11-18, int411: +109 s UP by arithmetic — the merged stated truth of the picks so far: 1358.444 s over 717 fast rows; 2026-11-18, lane gmail-connect-wall's restack moved onto 2.369.412's checkpoint b3ebb776e: +8 s UP by arithmetic — 1321.336 s over 694 + B-94d3 part one's 18 «-pins» rows 7.7 s + test-vault-otp-field 0.2 s = 1329.236 s over 713; 2026-11-18, int411: +72 s UP by arithmetic — the merged stated truth of the picks so far: 1321.336 s over 694 fast rows; 2026-11-18, int411: +69 s UP by arithmetic — the merged stated truth of the picks so far: 1318.936 s over 693 fast rows; 2026-11-18, int411: +66 s UP by arithmetic — the merged stated truth of the picks so far: 1315.106 s over 693 fast rows; 2026-11-18, int411: +65 s UP by arithmetic — the merged stated truth of the picks so far: 1314.806 s over 693 fast rows; 2026-11-18, int411: +64 s UP by arithmetic — the merged stated truth of the picks so far: 1313.406 s over 692 fast rows; 2026-11-18, int411: +55 s UP by arithmetic — the merged stated truth of the picks so far: 1304.106 s over 689 fast rows; 2026-11-18, int411: +52 s UP by arithmetic — the merged stated truth of the picks so far: 1301.406 s over 687 fast rows; 2026-11-18, int411: +38 s UP by arithmetic — the merged stated truth of the picks so far: 1287.796 s over 686 fast rows; 2026-11-18, int411: +22 s UP by arithmetic — the merged stated truth of the picks so far: 1271.675 s over 645 fast rows; 2026-11-18, int411: +15 s UP by arithmetic — the merged stated truth of the picks so far: 1264.620 s over 640 fast rows; 2026-11-18, int411: +8 s UP by arithmetic — the merged stated truth of the picks so far: 1257.720 s over 634 fast rows; 2026-11-18, int411: +7 s UP by arithmetic — the merged stated truth of the picks so far: 1256.220 s over 633 fast rows; 2026-11-18, bl-browser-b -restack-411: +2 s UP by arithmetic — test-browser-passkey restated 9.2 → 11.5 s with its named debt B-1d75, the stated sum 1253.520 → 1255.820 s over 633 fast rows; 2026-11-18, bl-browser-b B-b56d: +4 s UP by arithmetic — test-browser-prompts restated 1.7 → 5.9 s by its measured run, the stated sum 1249.320 → 1253.520 s over 633 fast rows; 2026-11-18, int410: +90 s UP by arithmetic — the merged stated truth of the picks so far: 1249.353 s over 634 fast rows; 2026-11-18, int410: +88 s UP by arithmetic — the merged stated truth of the picks so far: 1247.853 s over 634 fast rows; B-a2c9 (bl-ci 2026-11-18, restacked onto int410's block-8a checkpoint ececa0a1f): +51 s by arithmetic — the train's 1195.703 s over 635 fast rows + this unit's restatements (the eight read on the test machine put in the box's scale, test-stash-strip moved heavy, test-oat-mint 12.1 → 9.1: +49.850 s) = 1245.553 s over 634 fast rows + 0.5 s a later row of the stack states (test-ci-heavy-queue 8.4 → 8.9, B-88e5) = 1246.053 s; 1247 = the next whole second above it; before: 2026-11-18, int410: +36 s UP by arithmetic — the merged stated truth of the picks so far: 1195.553 s over 634 fast rows; 2026-11-18, int410: +30 s UP by arithmetic — the merged stated truth of the picks so far: 1189.353 s over 632 fast rows; 2026-11-18, int410: +28 s UP by arithmetic — the merged stated truth of the picks so far: 1187.953 s over 632 fast rows; 2026-11-18, int410: +22 s UP by arithmetic — the merged stated truth of the picks so far: 1181.720 s over 630 fast rows; 2026-11-18, int410: +13 s UP by arithmetic — the merged stated truth of the picks so far: 1172.281 s over 604 fast rows; 2026-11-18, the hotfix 2.369.409 «one ask per file per synchronous run»: +5 s UP by arithmetic — 1154.839 s over 599 + test-pool-pass-reads 4.4 s as measured = 1159.239 s over 600; 2026-11-17, the hotfix 2.369.408 «the X picture follows the tab on show» and its cure rounds: +5 s UP by arithmetic — 1149.839 s over 599, test-browser-picture 1.5 → 6.5 s = 1154.839 s; 2026-11-17, int407: +39 s UP by arithmetic — 1110.989 s over 591 rows + test-channel-store-loop-free 7.0 + test-channel-store-writer-laws 7.8 + test-agent-lock 0.9 + test-hub-boot 5.0 + test-separation-ratchets 4.0 + test-keeper-sweep-yields 6.1 + test-loop-census 5.6 + test-loop-day-report 0.3 (new) + test-store-write-census 6.5 → 8.6 + test-loop-hold 0.1 → 0.15 (restated) = 1149.839 s over 599; 2026-11-17, the channel store's .407 prep-mirror cure: +2 s UP by arithmetic — test-channel-store-writer-laws restated 5.6 → 7.8 s by its (k) legs = 1127.939 s over 593; 2026-11-17, channel-store-off-loop cure r1 moved onto 2.369.406: +5 s UP by arithmetic — 1120.139 s over 592 + the new row test-channel-store-writer-laws 5.6 s = 1125.739 s over 593; 2026-11-17, channel-store-off-loop c1 moved onto 2.369.406: +10 s UP by arithmetic — the release's 1110.989 s over 591 + test-channel-store-loop-free 7.0 s (new) + test-store-write-census 6.5 → 8.6 s = 1120.089 s over 592; 2026-11-16, int406: +10 s UP by arithmetic — the release's rows as stated, 1100.089 s over 588, + the three new fast rows of this train, each lane's own stated measurement: test-grants-read-lookup 6.7 s, test-reading-truth 0.6 s, test-resume-all-paced 3.6 s = 1110.989 s over 591 (each lane had raised the cap alone from 1100.089; the train sums the new rows once); 2026-11-16, lane grants-read-is-a-lookup for 2.369.406 on the release 2.369.405: +6 s UP by arithmetic — 70efb5e10's 1100.089 s over 588 + the new test-grants-read-lookup 6.7 s = 1106.789 s over 589; 2026-11-16, lane vault-login on the release 2.369.403: +9 s UP by arithmetic — the release's 1091.489 s + test-browser-login restated 1.0 → 9.6 s = 1100.089 s over 588; 2026-11-15, int403: +7 s UP by arithmetic — the train's rows as stated, 1085.689 s over 588 fast rows (2.369.402's 1084.219 s over 585 + the three units' own rows; vault-login is off this release), + test-oat-mint restated 9.1 → 12.1 s (+3.000; alone ×3: 12.05 / 12.12 / 12.16 s; its over names B-fe02) + test-csp-report restated 4.6 → 7.4 s (+2.800; alone ×3: 7.57 / 7.45 / 7.41 s) = 1091.489 s over 588; 2026-11-14, int402: +15 s UP by arithmetic — 2.369.401's rows as stated, 1069.280 s over 575, + the ten units' own rows and the train's (585): int402 +6.100 (test-suite-files-parse 4.100; test-user-state-bounds 7.800 → 9.800, law A's roads over 3 rounds), fable-52-cli-321 r16 +3.603 (test-status-bar-chips 0.197 → 2.900, test-fable-cap-pool-storm 1.400 → 2.300), ui-controls-and-bugs +1.600 (test-control-says-why 0.900, test-write-only-secrets 0.700), chat-attachments-persist +1.200 (test-chat-attachments 1.100, test-transcript-parity 1.300 → 1.400), machine-needs-at-pairing +1.200 (test-ffmpeg-install 0.510, test-machine-setup 0.440, test-machine-needs 0.250), queued-is-not-woke +0.600 (test-wait-watch), B-6ded +0.251 (test-usage-walk-parity 0.717 → 0.968), oat-add-door +0.200 (test-oat-add-door), chrome-157 +0.103 (test-cdp-census 0.117 → 0.220), artifacts-by-intent +0.082 (test-artifacts-intent 0.110 new, five rows restated −0.028); stream-recovery and the cpu-capture cure 0 = 1084.219 s; 2026-11-14, int402: +13 s UP by arithmetic — 2.369.401's rows as stated, 1069.280 s over 575, + the ten units' own rows and the train's (585): int402 +4.100 (test-suite-files-parse), fable-52-cli-321 r16 +3.603 (test-status-bar-chips 0.197 → 2.900, test-fable-cap-pool-storm 1.400 → 2.300), ui-controls-and-bugs +1.600 (test-control-says-why 0.900, test-write-only-secrets 0.700), chat-attachments-persist +1.200 (test-chat-attachments 1.100, test-transcript-parity 1.300 → 1.400), machine-needs-at-pairing +1.200 (test-ffmpeg-install 0.510, test-machine-setup 0.440, test-machine-needs 0.250), queued-is-not-woke +0.600 (test-wait-watch), B-6ded +0.251 (test-usage-walk-parity 0.717 → 0.968), oat-add-door +0.200 (test-oat-add-door), chrome-157 +0.103 (test-cdp-census 0.117 → 0.220), artifacts-by-intent +0.082 (test-artifacts-intent 0.110 new, five rows restated −0.028); stream-recovery and the cpu-capture cure 0 = 1082.219 s; 2026-11-13, fable-52-cli-321 r16 port onto 2.369.399: +3 s UP by arithmetic — test-fable-cap-pool-storm 1.4 → 2.3 + test-status-bar-chips 0.197 → 2.9 on the .399 rows' 1069.095 s over 574; before it, int399: +2 s UP by arithmetic — the .399 rows as stated: 1067.750 s (.398) + connection-notice-once A 0.070 (test-connection-notice) + machine-needs-at-pairing 0.025 (test-installed-apps 0.375 → 0.400 s by its own measurement) + the usage-walk pin 1.250 (test-ledger-readers-census) = 1069.095 s over 574 rows; pair-dialog-polish, file-preview-mount, the law 1 follow-up, k3-hours-units and job-logs-sweep K7 + K10 add none; 2026-11-12, int398: +2 s UP by arithmetic — the .398 rows as stated: 1065.600 s (.397) + mount-class-by-source 0.250 (test-fs-canary 6.7 → 6.95 s by its own measurement) + job-logs-sweep 0.100 (test-job-logs-sweep 0.1) + queued-is-not-woke law 1 1.300 (test-queued-wake 1.2, test-spend-paths 4.4 → 4.5) + reply-door-follows-enter 0.500 (test-reply-door 0.5) = 1067.750 s over 572 rows; the §30 cure, K2 / K3 / round 2, the Plugins modal close and the echo seam add none; 2026-11-12, int397: +62 s UP by arithmetic — the .397 rows as stated: 1003.125 s (.396) + the seam 5.075 (test-browser-passkey 4.8 → 9.2, test-freeze-probe 0.025 → 0.7) + usage-relearn-stepped 14.3 (test-usage-relearn-cap 8.2, test-usage-relearn-stepped 6.1) + hub-sync-holds 14.2 (test-hub-sync-holds 7.8, test-loop-child-census 3.0, test-update-clean 3.4) + ledger-boot-load 10.2 (test-ledger-boot-load 4.4, test-ledger-boot-fail 6.0, test-usage-relearn-cap 8.2 → 8.0 by its own measurement) + sidebar-echo-order 17.6 (test-user-state-bounds 7.8, test-user-state-echo 9.8) + account-reset-door 1.1 (test-account-reset-door, 0.95 then 1.1 by K1's own measurement) = 1065.600 s over 569 rows; the hub-loop-stalls test commit, passkey round 3 and oat-chip-icon add none (the float row left the train before the bump; sidebar-echo-order's keepalive commit restates no row); sidebar-echo-order's own 1021 on its base is superseded; 2026-11-12, lane sidebar-echo-order: +17 s UP by arithmetic on its own base — the .396 tree's 1003.125 s over 559 fast rows + test-user-state-echo 9.80 (new) + test-user-state-bounds 7.80 (new) = 1020.725 s over 561 fast rows; 2026-11-11, int396: +32 s UP by arithmetic — the .396 rows as stated: 971.295 s (.395) + hub-loop-stalls 16.5 (test-store-writer-laws 8.0, test-store-write-census 6.5, test-store-writer-r4 2.0) + the groups stack 9.23 (test-roster-per-pass 6.80, test-groups-sweep-on-change 1.65, test-membership-index 0.78) + usage B 6.1 (test-usage-ledger-walk 3.6 → 9.7) = 1003.125 s over 559 rows; window-close and the mkdir pin add none; 2026-11-11, int394: +1 s UP by arithmetic — the .393 tree's 970.325 s over 552 fast rows + test-vault-masker-once 0.80 (new, the vault masker built once per vault state) = 971.125 s over 553; 2026-11-11, int393: +1 s UP by arithmetic — the .392 tree's 969.165 s over 549 fast rows + test-cli-self-measure 0.76, test-cpu-capture 0.30, test-loop-hold 0.10 (new: cli-self-measure, hub-loop-stalls) = 970.325 s over 552 (fable-52-cli-321 left the train: its restated rows are not here); 2026-11-11, int392: +4 s UP by arithmetic — the .391 tree's 965.565 s over 548 fast rows + test-usage-ledger-walk 3.60 (new, the usage-ledger-walk hotfix, as stated: measured in a depth-1 copy, its archive legs a named SKIP) = 969.165 s over 549; 2026-11-10, int391: +4 s UP by arithmetic — the .390 tree's 961.375 s over 546 fast rows + test-agy-models-door 3.90 (new, agy-models) + test-still-press 0.29 (new, dialog-press) = 965.565 s over 548 fast rows; 2026-11-10, int390: +6 s UP by arithmetic — the .389 tree's 955.275 s over 544 fast rows + test-jobs-addressed 2.80 (new, jobs-addressed-push) + test-seen-marks +1.00, test-channel-groups +0.50, test-stash-strip +0.40 (restated, report-mark-on-ack) + test-claude-update-needs-nothing 0.70 (new, cli-update-needs-nothing) + test-vault-paste +0.70 (restated, login-request-card) = 961.375 s over 546 fast rows; 2026-11-10, int389: +12 s UP by arithmetic — the .388 tree's 943.27 s over 542 fast rows + test-ci-heavy-verdict 3.60 (new, ci-heavy-verdict r4) + test-ci-heavy-queue 8.40 (new, the queue) = 955.27 s over 544; 2026-11-09, int388: +6 s UP to the MERGED stated truth — the .388 tree's 943.28 s over 542 rows: the .387 base's 937.99 s + test-midturn-order 0.12 (new) + test-paced-wake-retry 4.20 (new) + test-path-linkify +0.53 + test-user-todos-layout +0.34 + test-channel-outbox +0.10 — each row its lane's full-speed measure; 938 s since 2026-11-06, int383: +10 s UP to the MERGED measured truth — the .383 tree's 937.56 s over 539 rows: the .382 base's 927.90 s + test-engine-distribution +8.80 + usage-two-rings' rows +0.42 + test-roster-row-fold +0.44; 928 s since 2026-11-06, int382: +6 s UP to the MERGED measured truth — the .382 tree's 927.90 s over 536 rows: the .381 base's 921.54 s + test-channel-outbox +0.70 + tailnet-names' rows +1.67 + phone-resume-keeps-layout's rows +4.00; 922 s since 2026-11-05, int381: +1 s UP to the MERGED measured truth — the .381 tree's 921.54 s over 534 rows: the .380 base's 920.14 s + test-layout-dup-storm restated +1.20 + test-channel-send-files restated +0.20; 921 s since 2026-11-05, int380: +1 s UP to the MERGED measured truth — the .380 tree's 920.14 s over 534 rows: the b7c910c3c base's 919.57 s + test-layout-dup-storm 0.40 (new, .379) + test-cache-warmth restated +0.02 + test-message-origin 0.14 (new); 920 s since 2026-11-02, int372: +1 s UP to the measured truth — the .372 picks' measured fast deltas on the .371 base's 918.31 s: test-agy-wall-signal 0.29 (new), test-browser-builds restated 9.1 → 9.5 (engine-spi-egress L1b) — each lane alone under 919, the train 919.00 s; 919 s since 2026-11-01, int370: +1 s UP to the measured truth — held-except-doors' measured fast delta on the .369 base's 917.69 s, the train 918.21 s; 918 s since 2026-10-31, int367: +4 s UP to the measured truth — the union of the .367 picks' measured fast deltas, +7.15 s on the .366 base's 910.54 s: vault-standing-request +3.00, passkey-browse-yourself +3.40, touch-chip-cause +0.75 — each lane alone under 914, the train 917.69 s; 914 s since 2026-10-27, int360: +4 s for the union of the .360 picks' measured new fast suites — 909.23 s on the .359 base + 3.42 s; 910 s since 2026-10-25, lane engine-distribution: +6 s for P4's measured legs — the restated sum 907 s; 904 s since 2026-10-20, lane fast-tier-ratchet: the honest restated sum 883.7 s + 20 s — UP to the truth from 640 s, DOWN by the speed-ups; 600 s by policy until 2.369.316, 480 s until 2.369.263) — moving it is a deliberate edit here (${FAST_SUM_CAP_MS / 1000} s)`);
  ok(budget < FAST_SUM_CAP_MS, `the fast tier's measured sum stays under ${FAST_SUM_CAP_MS / 1000} s (${Math.round(budget / 1000)} s over ${fast.length} suites — the rule's point, re-measured)`);
  // A ROW NEVER STATES UNDER A TENTH OF ITS READING (lane bl-release, 主开发 r1154, 2026-11-21). test-harness-spawn stated 184 ms
  // and read ~5.8 s on the test machine at every tip of the day: under the 10 s rule, so the false-row reader (≥ 10 s at ≥ ×1.5 —
  // ci.mjs falseFastRows) never saw it, and the sum above counted 0.2 s of it; eleven more rows were as far off (test-pool-auto
  // stated 2.0 s and read 20 s). scripts/fixtures/ci-fast-timings.json keeps ONE whole fast tier's per-suite readings from the test
  // machine (the larger of its two zones; its run named in the file): every fast row must state at least a tenth of its reading
  // there — red BY NAME with both numbers — and the readings must cover the table (a row without one is said; more than 5 % is red:
  // the file is refreshed from a newer whole tier). A tier's lanes run side by side, so a reading is a ceiling, never a statement
  // (a row is restated from readings ALONE). The EXCEPTION row is never judged. The readings are ONE DAY's: a suite that grows after
  // them is seen at the next refresh — the coverage leg forces one once more than 5 % of the rows have no reading.
  {
    const FAST_READS = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts', 'fixtures', 'ci-fast-timings.json'), 'utf-8'));
    const STATED_FLOOR = 0.1;
    const understated = (rows, reads) => rows.map((s) => ({ s, f: fastRuleFindings(s, ''), rd: reads[s.name] }))
      .filter((x) => x.f.kind !== 'EXCEPTION' && typeof x.rd === 'number' && x.f.measuredMs !== null && x.f.measuredMs < STATED_FLOOR * x.rd);
    const unreadOf = (rows, reads) => rows.filter((s) => typeof reads[s.name] !== 'number').map((s) => s.name);
    const covered = (rows, reads) => unreadOf(rows, reads).length <= Math.floor(rows.length * 0.05);   // at least 95 % of the rows read
    const unread = unreadOf(fast, FAST_READS.ms);
    const low = understated(fast, FAST_READS.ms);
    ok(low.length === 0, `every fast row states at least a tenth of its reading in one whole tier on the test machine (${FAST_READS.source}): ${low.map((x) => `${x.s.name} states ${x.f.measuredMs} ms, read ${x.rd} ms`).join('; ') || `${fast.length - unread.length} rows judged, none under`}`);
    ok(covered(fast, FAST_READS.ms), `…and those readings cover the table — ${unread.length} fast row(s) without one (at most 5 %): ${unread.join(', ') || 'none'}`);
    const twenty = Array.from({ length: 20 }, (_, i) => ({ name: `test-x-${i}`, tier: 'fast', why: 'in-process · 1 s' })), readsOf = (n) => Object.fromEntries(twenty.slice(0, n).map((s) => [s.name, 1000]));
    ok(covered(twenty, readsOf(19)) && !covered(twenty, readsOf(18)), 'CONTROL: 19 of 20 rows read (95 %) is covered, 18 of 20 is red');
    const planted = understated([{ name: 'test-x-under', tier: 'fast', why: 'in-process · 100 ms' }, { name: 'test-x-true', tier: 'fast', why: 'in-process · 300 ms' }, { name: 'test-x-exc', tier: 'fast', why: 'EXCEPTION · 1 ms' }], { 'test-x-under': 2000, 'test-x-true': 2000, 'test-x-exc': 99999 });
    ok(planted.length === 1 && planted[0].s.name === 'test-x-under', 'CONTROL: a planted row stating 100 ms that read 2 s is named; one stating 300 ms of 2 s and the EXCEPTION row are not');
  }
  // The census must be able to go red — every disqualifier through its own
  // shape, the non-shapes that must NOT trip it, and every why rule.
  // The shapes are ASSEMBLED from pieces so this file's own source does not
  // spell them — the census runs over this file too (its row allows only the
  // throwaway-repository checkout).
  const T = { vnc: ['vnc', 'Env'].join(''), onb: ['ONBOARDED', 'SOURCE'].join('_'), hl: '--' + 'headless=new', dbg: '--' + 'remote-debugging-port', wt: ['work', 'tree'].join(''),
    dt: ['dt', 'ach'].join(''), cv: ['command', '-v'].join(' '), cx: ['co', 'dex'].join(''), xs: ['startX', 'Server'].join('') };
  const hitsOf = (code) => fastRuleFindings({ why: 'PURE · 1 ms' }, code).hits.join();
  ok(hitsOf(`const srv = spawn(process.execPath, ['server.js'], { env: { ...process.env, ...(await ${T.vnc}()) } });`) === 'server', 'NEG: a server.js spawn (its §57 passport) is a server');
  ok(hitsOf(`execFileSync('git', ['-C', repo, '${T.wt}', 'add', '--detach', wt, 'HEAD']);`) === 'checkout', 'NEG: a git worktree add is a checkout');
  ok(hitsOf(`await page.evaluateOnNewDocument(${T.onb});`) === 'chrome' && hitsOf(`const c = spawn(CHROME, ['${T.hl}', '${T.dbg}=' + p]);`) === 'chrome',
    'NEG: a page suite (its §47 onboarded passport) and a hand-launched chrome are chrome');
  ok(hitsOf(`spawn('${T.dt}', ['-c', sock]);`) === 'binary' && hitsOf(`const w = execFileSync('sh', ['-c', '${T.cv} ${T.cx}']);`) === 'binary'
    && hitsOf(`await dm.openSession({ cmd: '${T.dt}', args: [] });`) === 'binary' && hitsOf(`await D.${T.xs}({ bin: 'Xvfb' });`) === 'binary',
    'NEG: a real program by name, a `command -v` probe for one, a cmd: field naming one and an X server started through desktop-display are binaries');
  ok(hitsOf(`// spawn(process.execPath, ['server.js'], { env: ${T.vnc}() }) — in a comment\n`) === ''
    && hitsOf(`const h = spawn(process.execPath, ['-e', FAKE_CHROME, '--', '${T.hl}']);`) === ''
    && hitsOf("execFileSync('git', ['ls-files', 'src', 'server.js']);") === '' && hitsOf('spawn(process.execPath, [wrapper, buf, meta, fakeCli]);') === '',
    'NON-HITS: a comment, a node FAKE handed --headless, a git ls-files naming server.js, our own wrapper under a stub CLI');
  const why = (w, extra = {}) => fastRuleFindings({ why: w, ...extra }, '').problems.join(' | ');
  ok(/names no kind/.test(why('fast · 1 ms')) && /no measured time/.test(why('PURE — no number')) && /≥ 10000 ms with no named debt/.test(why('in-process · 12.5 s'))
    && why('EXCEPTION (x) · 30 s — y') === '' && why('LAW money · 2.6 s') === '' && why('PURE · 40 ms') === '',
    'NEG: a kindless why, a missing time and a ≥ 10 s time with no over are red; an EXCEPTION may exceed the bound; the plain forms pass');
  // THE NAMED DEBT (lane fast-tier-ratchet, 主开发's ruling 2026-10-20): a ≥ 10 s PURE / in-process / LAW row stays fast only with
  // `over: '<why it is slow + its next-list item>'`, never on a row that boots / drives / runs anything — red both ways
  const DEBT = 'the suite folds 64 ledgers one worker at a time — next: run its deadline legs at once';
  ok(why('in-process · 12.5 s', { over: DEBT }) === '' && why('PURE · 25 s', { over: DEBT }) === '' && why('LAW money · 15 s', { over: DEBT }) === ''
    && /a paid debt: drop the over field/.test(why('in-process · 9.9 s', { over: DEBT })) && /names nothing/.test(why('in-process · 12 s', { over: 'slow' }))
    && /on the EXCEPTION row/.test(why('EXCEPTION (x) · 30 s', { over: DEBT })),
    'NEG: an over carries a ≥ 10 s row; an over under the bound (a paid debt), an over that names nothing and an over on the EXCEPTION are red');
  { const vSrc = `const srv = spawn(process.execPath, ['server.js'], { env: { ...process.env, ...(await ${['vnc', 'Env'].join('')}()) } });`;
    const r = fastRuleFindings({ why: 'in-process · 14 s', over: DEBT }, vSrc);
    ok(r.problems.some((p) => /heavy by THE TIER RULE, over or not/.test(p)), 'NEG: an over on a row that boots a server is red (a server / browser / binary row is heavy, over or not)', r.problems); }
  const slowRows = fast.filter((s) => { const f = fastRuleFindings(s, ''); return f.kind !== 'EXCEPTION' && f.measuredMs >= FAST_MAX_MS; }).map((s) => s.name).sort();
  const overRows = fast.filter((s) => s.over !== undefined).map((s) => s.name).sort();
  // the debt count's bound: 12 since lane fast-tier-ratchet (2026-10-20) — B-e601 r2 (the coordinator, 23:23Z): it STAYS 12; a row
  // over 10 s leaves (a heavy twin, or cut) before the bound moves
  // lane bl-loop-b (B-0248 (c), 主开发 r1092): 12 → 13 — r1092 made two false rows true (test-user-state-echo, test-user-state-bounds: over
  // 10 s at their base already) with their named debt (B-54a9), beside the census suite's; the bound moves by that order's arithmetic.
  // Its move onto the train 30b4e5093 (主开发 r1503): the train's 11 rows under its 12 + this unit's 3 = 14 — both sides' debts kept
  // int361 at the block 2.369.416's pick of line 171 (lane bl-release's false rows, 主开发 r1617): 14 → 16, the TRUE count of named debts on
  // the train with that line's two (test-ci-gate, test-store-write-census rows made true) — by arithmetic, every side's note kept
  // and at line 241's pick (lane artifacts-by-intent's leak-census row, 6.6 → 11.9 s RAW with its named debt B-b664, 主开发 r1627): 16 → 17
  // and lane bl-mail (B-360d unit 1, moved onto the train, 主开发 r1542 / r1765): 17 → 18 — test-sliced-walk restated 9.2 → 13.1 s by the
  // unit (the journal's per-update compare and the open's sliced warm-up under its legs) with its named debt (B-fbd6 item 7)
  // and B-23e5 line 262's follow (主开发 r1733 (7)): 17 → 18 — test-safe-fs-path-memory restated 9.0 → 13.0 s (its remainder's legs) with its named debt B-4b9a
  // THE BOUND IS THE TRUE COUNT, A RATCHET THAT ONLY GOES DOWN (主开发 r1531, lane bl-release's restating line, 2026-11-22): the
  // fast tier's false rows restated at what they read ALONE, each ≥ 10 s with its named debt (family B-7e49, the fast tier's time) —
  // 18 → 47 by that arithmetic (the train's 18 + this line's 29 new overs, after r2048's second readings), and 47 → 48 AT THE PICK (int416, 主开发 r2183: the
  // TRUE COUNT on the train: + test-safe-fs-path-memory, the one over the train took after this line's base, line 311's B-4b9a). Its first entry is PINNED below (a raise is a ruling's: it edits that pin with its words).
  // From here the count of named debts IS the bound (judged by COUNT, not by name): a NEW over is red until its line moves the
  // row heavy or cuts it; a cut that takes a row off the list is red until ITS OWN LINE appends the lower count to the ratchet; an
  // entry not below the one before it is red (a raise is a ruling's, never a line's arithmetic).
  const FAST_OVER_RATCHET = [48, 45, 44, 43, 40, 39, 31, 30, 29, 28, 27, 26, 25, 24, 22, 21, 20, 19, 18, 17, 16, 15, 12, 11];   // [r1531's true count at the pick, then each cut's lower count, in order] · 11: B-7e49 slice stopped-window-cooldown (lane card-door-in-chat s1126, 主开发 r4912) paid test-layout-stopped-window (its two real 1.1 s apply-cooldown waits run by hand: read alone 8.0 s, both zones) · 45: B-7e49 slice 3 (lane lg-recovery) paid test-channels-agent-cli (its CLI legs to a heavy twin), test-oat-identity (read alone 3.7 s), test-suite-files-parse (9.0 s) · 44: B-7e49 slice (lane bl-vault, 主开发 r2173) paid test-integration-registry (its .test( census cut: read alone 7.5 s) · 43: B-1d87's split (lane bl-chat-b, 主开发 r2342 / r2410) paid test-layout-dup-storm (its phone-resume rounds to the fast twin test-layout-dup-storm-phone: 6.8 / 7.3 s, each read alone) · 40: B-7e49 (lane lg-remote-hardening, 主开发 r2490) paid test-needs-doors (7.8 s), test-pool-auto (5.6 s) and test-harness-add-census (5.7 s), each restated as read ALONE on the first test machine, the tree unchanged · 39: B-4b9a (lane bl-machines-a, 主开发 r2545) paid test-safe-fs-path-memory (its seven pool scenes side by side: 5.9 / 6.1 s, read alone) · 31: the restating line 2 (lane bl-release, 主开发 r2751, line 516) struck eight overs by readings alone on the first test machine — the merged tree's own count at the pick (int361) · 30: B-7e49 (lane lg-remote-hardening, 主开发 r2490) paid test-device-key-pin (0.5 s: its real-agent legs moved verbatim to the heavy twin test-device-key-pin-real) · 29: B-7e49 (lane login-request-card, 主开发 r2535) paid test-browser-keeper (its launching legs to the heavy twin test-browser-keeper-launch) · 28: B-fbd6 item 7 (lane bl-mail, 2026-11-23) paid test-sliced-walk (13.1 → 7.4 s alone: the whole builds its legs compare with read once, or asked of one oracle engine a leg) · 27: B-7e49 (lane artifacts-by-intent, 主开发 r2460) paid test-ledger-rebuild (its ⑦ measurement to the heavy twin test-ledger-rebuild-measure: its seconds are its measure) · 26: test-paced-wake-retry's split (lane paced-wake-retry, 主开发 r2569) paid test-paced-wake-retry (its §12–§15 to the fast twin test-paced-wake-retry-rounds and its §B-f276 1a to the fast twin test-paced-wake-retry-held: 6.3 / 4.6 / 4.7 s, each read in the paired probe, both zones) · 25: B-7e49 (lane bl-vault, 主开发 r2347; moved onto the train r3509) paid test-agy-harness (its wrapper legs to the heavy twin test-agy-harness-wrappers) · 24: B-360d unit 1 (lane lg-providers, the go's line 754, 7eee01462) retired test-usage-index-owner with the shadow usage index it read — the train 2.369.418's cut (int361, by arithmetic) · 22: B-7e49 (lane lg-vault-stages) paid test-vault-law (8.6 s) and test-vault-job (9.6 s), each read alone in both zones · 21: B-7e49 r2522 (lane bl-tests-e) paid test-store-write-census (its running legs to the heavy twin test-store-write-census-scenes; 4.5 s alone) · 20: B-7e49 r2522 (lane bl-tests-e) paid test-user-state-bounds (its running legs to the heavy twin test-user-state-bounds-work; 2.7 s alone) · 19: B-7e49 r2522 (lane bl-tests-e) paid test-cache-bounds (its running legs to the heavy twin test-cache-bounds-walks; 1.1 s alone) · 18: B-7e49 r2522 (lane bl-tests-e) paid test-user-state-echo (its running legs to the heavy twin test-user-state-echo-rounds; 3.1 s alone) · 17: B-7e49 (lane bl-tests-chrome, 主开发 r2466 / r2527; formed again on the second pick tip of 2.369.419, a570e01a8, r3990) paid test-desktop-small (its census controls judge the planted file alone: read alone 1.1 s on the first machine) · 16: B-7e49 (lane bl-tests-chrome, 主开发 r2466 / r2527; formed again on the second pick tip of 2.369.419, a570e01a8, r3990) paid test-browser-builds (its keeper legs to the heavy twin test-browser-builds-keeper: read alone 0.13 s on the first machine) · 15: B-7e49 (lane artifacts-by-intent, 主开发 r3761) paid test-fs-canary (§7, §8 and §9 — holds real children fill and what rides their wrapper — to the heavy twin test-fs-canary-holds; restated from the paired reading alone) · 12: B-7e49 (lane artifacts-by-intent, 主开发 r3761 / r4660) struck three overs by their readings ALONE on the first machine, no leg moved: test-channels-census-pace 6.71 s, test-usage-ledger-walk 7.85 s, test-channel-drain 6.84 s
  const overBoundFindings = (count, ratchet) => {
    const bound = ratchet[ratchet.length - 1], out = [];
    if (ratchet.some((b, i) => i > 0 && b >= ratchet[i - 1])) out.push(`the ratchet does not go down: ${ratchet.join(' → ')}`);
    if (count > bound) out.push(`${count} named debts over the bound ${bound}: a new over waits for its row to move heavy or be cut`);
    if (count < bound) out.push(`${count} named debts under the bound ${bound}: the cut's own line appends ${count} to FAST_OVER_RATCHET`);
    return out;
  };
  ok(overBoundFindings(FAST_OVER_RATCHET[0], [FAST_OVER_RATCHET[0]]).length === 0 && /over the bound/.test(overBoundFindings(FAST_OVER_RATCHET[0] + 1, [FAST_OVER_RATCHET[0]]).join())
    && /appends/.test(overBoundFindings(FAST_OVER_RATCHET[0] - 1, [FAST_OVER_RATCHET[0]]).join()) && /does not go down/.test(overBoundFindings(FAST_OVER_RATCHET[0] - 1, [FAST_OVER_RATCHET[0], FAST_OVER_RATCHET[0] - 2, FAST_OVER_RATCHET[0] - 1]).join())
    && /does not go down/.test(overBoundFindings(FAST_OVER_RATCHET[0] - 3, [FAST_OVER_RATCHET[0], FAST_OVER_RATCHET[0] - 2, FAST_OVER_RATCHET[0] - 1, FAST_OVER_RATCHET[0] - 3]).join()) && /does not go down/.test(overBoundFindings(FAST_OVER_RATCHET[0] - 2, [FAST_OVER_RATCHET[0], FAST_OVER_RATCHET[0] - 2, FAST_OVER_RATCHET[0] - 2]).join())
    && overBoundFindings(FAST_OVER_RATCHET[0] - 2, [FAST_OVER_RATCHET[0], FAST_OVER_RATCHET[0] - 2]).length === 0,
    'CONTROLS: the bound on the count is green, a lowered ratchet on its count is green; one over too many, one under (a cut not yet appended), a ratchet that rises at its end, in its middle, or stays level are each red');
  ok(FAST_OVER_RATCHET[0] === 48, `the ratchet's first entry is r1531's true count at the train's pick, 48 (the line's 47 + the train's test-safe-fs-path-memory; a raise is a ruling's: its words edit this pin)`);
  ok(JSON.stringify(slowRows) === JSON.stringify(overRows) && overBoundFindings(overRows.length, FAST_OVER_RATCHET).length === 0,
    `the over-list == the fast rows ≥ 10 s by their stated time (${overRows.length}: ${overRows.join(', ') || 'none'}) — no silent slow row, no paid debt kept; the bound ON the true count (${overBoundFindings(overRows.length, FAST_OVER_RATCHET).join('; ') || FAST_OVER_RATCHET.join(' → ')})`);
  for (const s of fast.filter((x) => x.over !== undefined)) console.log(`      over · ${s.name} · ${(fastRuleFindings(s, '').measuredMs / 1000).toFixed(1)} s · ${s.over}`);
  // MEASURED AGAINST STATED (B-eedd): the rule above judges the STATED time, so a whole green tier records its readings
  // (<git dir>/ci-fast-times.json, fastTimesPath) and a row READ ≥ 10 s at ≥ ×1.5 its statement in BOTH newest whole tiers is a false
  // row (the coordinator's ruling, 2026-11-15) — the push gate SAYS it (a warning: its verdict may not depend on load) and
  // `ci.mjs --false-rows` is the red. One tier never judges, nor does the box's ×1.3 thermal reading.
  { const R = (name, why, over) => ({ name, tier: 'fast', why, ...(over ? { over } : {}) }), rd = (f) => fs.readFileSync(path.join(REPO, f), 'utf-8');
    const rows = [R('grew', 'in-process · 6.6 s'), R('grew-b', 'in-process · 9.5 s'), R('thermal', 'in-process · 8 s'), R('under', 'PURE · 0.6 s'),
      R('once', 'in-process · 6 s'), R('chat', 'EXCEPTION (x) · 10 s'), R('debt', 'in-process · 12.1 s', DEBT), R('debt-grew', 'in-process · 12.1 s', DEBT)];
    const tier = (sha, ms) => ({ sha, at: 1, ms });
    const t1 = tier('b', { grew: 12600, 'grew-b': 14900, thermal: 10400, under: 9900, chat: 40000, debt: 15000, 'debt-grew': 18200 });
    const t2 = tier('a', { grew: 10000, 'grew-b': 14800, thermal: 10400, under: 10800, once: 20000, chat: 40000, debt: 15000, 'debt-grew': 18200 });
    const rec = fastTimesRecord(fastTimesRecord(null, t2), t1);
    const names = falseFastRows(rows, rec).map((f) => f.name).join();
    ok(names === 'grew,grew-b,debt-grew', `a row read ≥ 10 s at ≥ ×${FALSE_ROW_RATIO} its statement in both newest whole tiers is a FALSE ROW — over its statement, over its debt (${names || 'none'})`);
    ok(falseFastRows(rows, fastTimesRecord(null, t1)).length === 0, 'NEG: one whole tier never judges (one hot tier is not a false row)');
    ok(!names.split(',').some((n) => ['thermal', 'under', 'once', 'chat', 'debt'].includes(n)), 'NEG: the ×1.3 thermal reading, a reading under 10 s in one tier, a row one tier did not read, the EXCEPTION and a debt read inside ×1.5 are not false rows');
    const f = falseFastRows(rows, rec).find((x) => x.name === 'grew');
    ok(f && f.statedMs === 6600 && f.readMs.join() === '12600,10000', `a false row names its statement and both readings, newest first (${JSON.stringify(f)})`);
    const kept = [1, 2, 3, 4, 5, 6].reduce((r, i) => fastTimesRecord(r, tier(String(i), {})), { tiers: [null, { sha: 'x' }] });
    ok(kept.v === 1 && kept.tiers.map((t) => t.sha).join() === '6,5,4,3', `the record keeps the four newest whole tiers, newest first, a malformed old tier dropped (${kept.tiers.map((t) => t.sha).join()})`);
    ok(falseFastRows(rows, { tiers: [{ ...t1, host: 'h1' }, { ...t2, host: 'h2' }] }, { host: 'h1' }).length === 0 && falseFastRows(rows, { tiers: [{ ...t1, host: 'h1' }, { ...t2, host: 'h1' }] }, { host: 'h1' }).length === 3,
      'NEG: tiers read on ANOTHER host never judge this one (the statements are one machine\'s scale)');
    // THE RECORD lives in the checkout's GIT DIR (a scratch repository with no .gitignore stays CLEAN — test-ci-heavy-launch's fast
    // tier earns its green marker there), and the judge is driven for real: a planted tier + this one, the Actions runner refused
    const G = mktmp('readings'); git(G, ['init', '-q']); git(G, ['-c', 'user.email=g@t.local', '-c', 'user.name=g', 'commit', '-q', '--allow-empty', '-m', 'root']);
    const recFile = fastTimesPath(G), tim = [{ name: 'grew', ms: 12600 }, { name: 'thermal', ms: 10400 }];
    ok(recFile && recFile.startsWith(path.join(fs.realpathSync(G), '.git') + path.sep) && recFile.endsWith('ci-fast-times.json'), `the record is <git dir>/ci-fast-times.json (${recFile && path.relative(G, recFile)})`);
    fs.writeFileSync(recFile, JSON.stringify(fastTimesRecord(null, { ...t2, host: 'hx' })));
    const fr = judgeFastReadings(rows, tim, 'c'.repeat(40), { env: {}, file: recFile, host: 'hx', load0: 3.1 });
    const recd = JSON.parse(fs.readFileSync(recFile, 'utf-8')), porcelain = git(G, ['status', '--porcelain']);
    ok(fr.map((x) => x.name).join() === 'grew' && recd.tiers.length === 2 && recd.tiers[0].host === 'hx' && recd.tiers[0].load0 === 3.1 && recd.tiers[0].ms.grew === 12600 && porcelain === '' && !fs.readdirSync(path.dirname(recFile)).some((x) => x.endsWith('.tmp')),
      `judgeFastReadings: the tier joins the record (host, load, readings) and its false rows come back (${fr.map((x) => x.name).join() || 'none'}); the work tree stays clean (status «${porcelain}»), no temp file left`);
    const fa = path.join(mktmp('readings-gh'), 'r.json');
    ok(judgeFastReadings(rows, tim, 'c'.repeat(40), { env: { GITHUB_ACTIONS: 'true' }, file: fa, host: 'hx' }).length === 0 && !fs.existsSync(fa)
      && judgeFastReadings(rows, tim, 'c'.repeat(40), { env: { VIBESPACE_CI_REMOTE_RUN: '1' }, file: fa, host: 'hx' }).length === 0 && !fs.existsSync(fa),
      'off this box (the Actions runner, a remote run) nothing is recorded or judged');
    ok(/^FALSE ROW: grew states 6\.6 s and read 12\.6 s \/ 10\.0 s .* measure it alone on the test machine and restate it in the box's scale/.test(falseRowLine(falseFastRows(rows, rec)[0])),
      'the false row names its statement, both readings and the ruling\'s road (alone on the test machine, the box\'s scale)');
    // WIRING over the source WITH ITS COMMENTS STRIPPED (a commented-out call is no call): a whole IN-PLACE tier only, before ALL
    // GREEN, a WARNING — THE VERDICT MAY NOT DEPEND ON LOAD — and the red is the --false-rows verb
    const ci = stripComments(rd('scripts/ci.mjs'));
    const gate = ci.slice(ci.indexOf('async function fastGate('), ci.indexOf('function writeGreenMarker('));
    const judged = gate.indexOf('judgeFastReadings(fast, timings, sha, { load0: l0 })'), green = gate.indexOf('ALL GREEN — fast gate');
    ok(judged > 0 && judged < green && /if \(!absent\.length && !isolate && !part\) \{[^\n]*\n\s*const falseRows = judgeFastReadings/.test(gate) && /console\.log\(`\[ci\] WARNING: \$\{falseRowLine\(f\)\}/.test(gate) && !/falseRows\.length\) \{[^}]*return 1/.test(gate),
      'WIRING: the fast tier judges its readings after a WHOLE in-place tier, before ALL GREEN, and SAYS each false row — it never reds the push on them (the verdict may not depend on load)');
    const verb = ci.slice(ci.indexOf('function falseRowsVerb('), ci.indexOf('/**\n * THE FAST TIER.') > 0 ? ci.indexOf('/**\n * THE FAST TIER.') : ci.indexOf('async function fastGate('));
    ok(/if \(arg\('false-rows'\)\) return exitFlushed\(falseRowsVerb\(\)\);/.test(ci) && /return rows\.length \? 1 : 0;/.test(verb) && /if \(mine < 2\)[^\n]*return 2; \}/.test(verb),
      'WIRING: `ci.mjs --false-rows` is the red — exit 1 naming the false rows of this host\'s two newest whole tiers, 2 when fewer than two are recorded'); }
  ok(/only a LAW or an EXCEPTION/.test(why('PURE · 1 ms', { allow: ['binary'] })) && /dead allowance/.test(why('LAW architecture · 1 ms', { allow: ['binary'] })),
    'NEG: an allowance on a PURE row, and an allowance nothing needs, are red');
  // …and over REAL suites the rule moved out: each is caught by the shape it moved for.
  for (const [n, key] of [['test-client-boot', 'chrome'], ['test-restore-smoke', 'server'], ['test-restore-smoke', 'checkout'], ['test-agentd-session', 'binary'], ['test-desktop-display', 'binary']]) {
    const r = fastRuleFindings({ why: 'in-process · 1 ms' }, src(n));
    ok(r.hits.includes(key) && r.problems.length > 0, `CONTROL: ${n} as a fast row would be red — ${key} (${r.hits.join(',') || 'no hit'})`);
  }
  ok(FAST_DISQUALIFIERS.map((d) => d.key).join() === 'server,checkout,chrome,binary' && FAST_MAX_MS === 10000, 'the four disqualifiers and the 10 s bound are the ones the rule names');
  ok(EXCLUDED.every((e) => (e.why || '').length > 15), 'every EXCLUDED entry gives a real reason, not a shrug');

  // WIRING. A tier table nobody invokes is documentation. These pins live HERE
  // and not in test-architecture §43 on purpose: §43 runs inside `npm run
  // build`, and several browser suites build a PARTIAL COPY of the tree
  // (test-window-menu copies src+public+server.js+scripts onto a HEAD
  // checkout), so a build-time assert that reads package.json or .github fails
  // there for reasons unrelated to the code under test — measured, that pin
  // turned test-window-menu into a 300 s timeout.
  const read = (f) => { try { return fs.readFileSync(path.join(REPO, f), 'utf-8'); } catch { return ''; } };
  const hook = read('scripts/git-hooks/pre-push');
  const wf = read('.github/workflows/ci.yml');
  const pkg = read('package.json');
  ok(hook.includes('--check-heavy') && hook.includes('--heavy-launch'),
    'the tracked pre-push hook checks the heavy verdict AND launches the heavy tier');
  ok(hook.indexOf('node scripts/ci.mjs --check-heavy --head=') > 0 && hook.indexOf('node scripts/ci.mjs --check-heavy --head=') < hook.indexOf('node scripts/ci.mjs $kg ||') && hook.indexOf('node scripts/ci.mjs $kg ||') > 0,
    'the hook asks for the heavy verdict BEFORE it spends the fast tier');
  ok(/node scripts\/ci\.mjs --fast-part=\$\{\{ matrix\.part \}\}\/2 --keep-going\s*$/m.test(wf) && wf.includes('node scripts/ci.mjs --heavy'),
    'the Actions mirror runs BOTH tiers (the fast tier as its parts, each to its end: --keep-going names every red — B-d24c)');
  // THE FAST TIER IN PARTS (B-7353): the hosted fast job is a matrix of parts, each a cut of the tier by the rows' stated times
  { const C = await import('./ci.mjs');
    const fp = C.workflowFastPartsAt(wf), tierRows = fast;
    // r117: with a node axis the fail-log artifact carries the major too — four jobs, four names
    const perJob = fp && fp.nodes && fp.nodes.length > 1 ? /ci-fast-fail-logs-\$\{\{ github\.sha \}\}-\$\{\{ matrix\.part \}\}-node\$\{\{ matrix\.node \}\}/ : /ci-fast-fail-logs-\$\{\{ github\.sha \}\}-\$\{\{ matrix\.part \}\}/;
    ok(fp && fp.n === 2 && fp.slots.join() === '1,2' && /name: fast \$\{\{ matrix\.part \}\}\/2/.test(wf) && perJob.test(wf),
      `ci.yml's fast job is a matrix of ${fp ? fp.n : '?'} parts${fp && fp.nodes ? ` × Node ${fp.nodes.join(' / ')}` : ''}, named fast i/n (another major: fast i/n node <major>), its fail logs one artifact per job (two jobs cannot share an artifact name)`);
    const srcOf = (n) => { try { return fs.readFileSync(path.join(REPO, 'scripts', n + '.mjs'), 'utf-8'); } catch { return ''; } };
    const plan = C.fastPartPlan(tierRows, 2, { sourceOf: srcOf });
    const lastRows = C.FAST_SERIAL.filter((r) => r.last).map((r) => r.name), all = plan.parts.flat().map((x) => x.name).filter((n) => !lastRows.includes(n));
    ok(all.length === tierRows.length - lastRows.length && new Set(all).size === all.length && plan.parts.every((x) => x.length),
      `the ${plan.parts.length} parts run the ${tierRows.length - lastRows.length} other fast suites each exactly once (${plan.parts.map((x) => x.length).join(' + ')})`);
    ok(lastRows.length > 0 && plan.last.join() === lastRows.join() && plan.parts.every((p) => lastRows.every((n) => p.filter((x) => x.name === n).length === 1))
      && plan.parts.every((p) => { const o = C.scheduleFastLanes(p, { sourceOf: srcOf }).serial.map((x) => x.name); return o.slice(-lastRows.length).join() === lastRows.join(); }),
      `the \`last\` rows (${lastRows.join(', ')}) run ONCE in EVERY part, at its very end — each part's runner sweeps the litter of its own suites`);
    ok(plan.serial.length > 0 && plan.serial.every((n) => plan.parts[0].some((x) => x.name === n)), `the serial lane's ${plan.serial.length} suites run whole in part 1 (${plan.serial.join(', ')})`);
    ok(Math.max(...plan.loads) / Math.min(...plan.loads) < 1.1, `LPT over the stated times balances them: ${plan.loads.map((x) => Math.round(x / 1000)).join(' / ')} s (max/min < 1.1)`);
    const flip = C.fastPartPlan([...tierRows].reverse(), 2, { sourceOf: srcOf }), sig = (p) => p.parts.map((x) => x.map((y) => y.name).sort().join()).join('|');
    ok(sig(flip) === sig(plan), 'the SAME table gives the SAME cut in every job — not a function of the table order');
    const ci = read('scripts/ci.mjs'), gate = ci.slice(ci.indexOf('async function fastGate('), ci.indexOf('function writeGreenMarker('));
    ok(/if \(part\) fast = fastPartPlan\(tier, part\.n, \{ sourceOf \}\)\.parts\[part\.i - 1\];/.test(gate) && /if \(!absent\.length && !isolate && !part\)/.test(gate) && /else if \(part\) console\.log\(`\[ci\] green marker not written/.test(gate),
      'WIRING: a part runs its own cut; it records no readings and writes no green marker (neither is the whole tier)'); }
  ok(/"ci:heavy"\s*:/.test(pkg) && /"ci:status"\s*:/.test(pkg), 'package.json exposes ci:heavy + ci:status');
  // `npm run ci:heavy` is the command the block message tells a blocked
  // developer to run, so it has to be able to WRITE the marker that clears the
  // block. In place it can only do that on a clean tree; --isolate always can
  // (round 2: the manual path used to run 16 minutes and then refuse silently).
  ok(/"ci:heavy"\s*:\s*"[^"]*--isolate/.test(pkg), 'ci:heavy runs ISOLATED, so the recovery command always earns a marker');
  ok(read('.gitignore').includes('data/ci-heavy'), 'the marker directory is gitignored');
}

// ── §2e NO FAST SUITE ASSERTS A WALL-CLOCK BOUND ON ITS OWN RUN (lane mirror-flake-hardening, 2.369.270) ──
// rel269's mirror (run 38549333465) went red on test-enter-census's `< 3 s` — 4335 ms on ubuntu-latest — and the fast
// tier stopped on it. scripts/wall-clock-census.mjs reads every fast suite with acorn and classifies each comparison of a
// measured span (wait / lower / guard / control / LITERAL): a LITERAL upper bound under 1 s is RED; one of ≥ 1 s is held
// only by the per-suite ratchet scripts/fixtures/wall-clock-baseline.json, which only falls. A cost claim is a census of
// the work or a ratio against a control in the same run (scripts/cost-ratio.mjs — CPU time); a wait is the mechanism's
// constant or the evidence it ended for its reason. Lane wall-clock-ratchet-down (2.369.271): THE RATCHET IS AT 0 — the
// 30 held bounds became evidence / stamps read between two marks / relative bounds, and the census also reads a span
// the PRODUCT (or a child script) measured and returned, through a tuple, a helper's parameter, a Map / Set.
// ── THE ONE PASS (主开发 r2572 (5), row B-54a9, lane bl-tests-a, 2026-11-22). Four sections parse every script with acorn: §2e (the
// wall-clock census over the fast tier), §2k (old page-target loops), §2m (old app waits) and §2p (last-read waits). Measured alone,
// they were 17.5 + 3.3 + 1.7 + 3.1 s of a 36 s run. Each script under scripts/ is now READ ONCE and PARSED AT MOST ONCE here; its
// tree goes to all four and is dropped before the next file (a run's worth of trees is never held). The tree is the census's own
// strict parse (wall-clock-census PARSE_OPTIONS, locations on). The three that also accept a top-level `return` get a lenient
// parse only for a file the strict one refuses, so each gets the tree or the error its own parse gave. The census goes LAST on each
// tree, since its walk writes a parent link into every node (the other three write nothing). Each section reads its own results
// below, in its own order, and falls back to its own parse for a file the pass did not see.
let ONE_PASS = null;
const ONE_PASS_GUARD = 'THE ONE PASS: this tree was already walked by the census (its parent links are on it) — a helper never reads it';
const onePass = async () => {
  const t0 = performance.now(), acorn = createRequire(import.meta.url)('acorn');
  const WC = await import('./wall-clock-census.mjs');
  const { oldPageLoops } = await import('./cdp-page-target.mjs'), { oldAppWaits } = await import('./cdp-page-load.mjs'), { lastReadWaits } = await import('./last-read-waits.mjs');
  const LENIENT_KEYS = ['ecmaVersion', 'sourceType', 'allowHashBang', 'allowAwaitOutsideFunction', 'allowReturnOutsideFunction', 'locations'];
  const lenientAsk = (o) => !!o && o.ecmaVersion === 'latest' && o.sourceType === 'module' && o.allowHashBang === true && o.allowAwaitOutsideFunction === true && o.allowReturnOutsideFunction === true && Object.keys(o).every((k) => LENIENT_KEYS.includes(k));
  const treeOf = (text) => {   // one file's parse, made at the first ask, at most once each way
    let strict = null, strictErr = null, lenient = null, lenientErr = null, s = false, l = false;
    const getStrict = () => { if (!s) { s = true; try { strict = acorn.parse(text, WC.PARSE_OPTIONS); } catch (e) { strictErr = e; } } return !strictErr; };
    return {
      parses: () => (s ? 1 : 0) + (l ? 1 : 0),
      strict: (src) => { if (src !== text) return acorn.parse(src, WC.PARSE_OPTIONS); if (!getStrict()) throw strictErr; return strict; },
      acorn: { parse: (src, o) => {
        if (src !== text || !lenientAsk(o)) return acorn.parse(src, o);   // a page's own code a suite ships, a planted text: its own parse
        // THE GUARD (主开发 r3135 (4)): the census's walk writes a parent link into every node, the root's included; a helper never reads
        // such a tree (its walk would follow the link back up): refused BY NAME, so the helper says it could not read the file
        if (getStrict() && Object.prototype.hasOwnProperty.call(strict, '_p')) throw new Error(ONE_PASS_GUARD);
        if (getStrict()) return strict;
        if (!l) { l = true; try { lenient = acorn.parse(text, { ...WC.PARSE_OPTIONS, allowReturnOutsideFunction: true }); } catch (e) { lenientErr = e; } }
        if (lenientErr) throw lenientErr;
        return lenient;
      } },
    };
  };
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? (x.name === 'node_modules' ? [] : walk(path.join(d, x.name))) : /\.(mjs|js|cjs)$/.test(x.name) ? [path.join(d, x.name)] : []));
  const files = walk(path.join(REPO, 'scripts'));
  const fastAt = new Map(SUITES.filter((r) => r.tier === 'fast').map((r) => [path.join(REPO, 'scripts', r.name + '.mjs'), r]));
  const suiteAt = new Set(SUITES.map((r) => path.join(REPO, 'scripts', r.name + '.mjs')));
  // ONE FILE'S ROAD (the pass and its controls run the same one): the three helpers on the shared tree, then the census LAST
  const perFile = (text, { suite = false, row = null } = {}) => {
    const one = treeOf(text), out = { pageLoops: oldPageLoops(text, one.acorn), appWaits: oldAppWaits(text, one.acorn) };
    if (suite) out.lastReads = lastReadWaits(text, one.acorn);
    if (row) out.census = WC.censusRow(row, text, one.strict);   // LAST: its walk writes a parent link into every node
    out.parses = one.parses();
    return out;
  };
  const pageLoops = new Map(), appWaits = new Map(), lastReads = new Map(), census = new Map();
  let parses = 0;
  for (const f of files) {
    const row = fastAt.get(f), r = perFile(fs.readFileSync(f, 'utf8'), { suite: suiteAt.has(f), row });
    pageLoops.set(f, r.pageLoops); appWaits.set(f, r.appWaits);
    if (r.lastReads) lastReads.set(f, r.lastReads);
    if (r.census) census.set(row.name, r.census);
    parses += r.parses;
  }
  console.log(`  (THE ONE PASS, r2572 (5): ${files.length} scripts read once, ${parses} parse(s) for §2e · §2k · §2m · §2p, ${Math.round(performance.now() - t0)} ms; printed, never judged)`);
  return { pageLoops, appWaits, lastReads, census, perFile, treeOf, WC };
};
console.log('\n§2e no fast suite asserts a wall-clock bound on its own run');
{
  const WC = await import('./wall-clock-census.mjs');
  ONE_PASS = await onePass();
  // censusOver's own loop over the tier (fast rows, in order; an unreadable file skipped), each row from THE ONE PASS
  const suites = [];
  for (const r of SUITES) {
    if (r.tier !== 'fast') continue;
    const got = ONE_PASS.census.get(r.name);
    if (got) { suites.push(got); continue; }
    let src; try { src = fs.readFileSync(path.join(REPO, 'scripts', r.name + '.mjs'), 'utf8'); } catch { continue; }
    suites.push(WC.censusRow(r, src));
  }
  const baseline = JSON.parse(fs.readFileSync(WC.BASELINE, 'utf-8'));
  const v = WC.ratchetVerdict(suites, baseline);
  const by = {};
  for (const x of suites) for (const f of x.findings) by[f.kind] = (by[f.kind] || 0) + 1;
  const held = suites.flatMap((x) => x.findings.filter((f) => f.kind === 'LITERAL').map((f) => `${x.name}:${f.line} ${f.text}`));
  console.log(`    ${suites.length} fast suites · ${Object.entries(by).map(([k, n]) => `${n} ${k}`).join(' · ')}`);
  for (const h of held) console.log('      held by the ratchet: ' + h);
  const nFast = SUITES.filter((r) => r.tier === 'fast').length;
  ok(suites.length === nFast && nFast > 300, `the census read every fast suite (${suites.length} of ${nFast})`);
  // THE FIXED POINT'S KINDS (主开发 r3135 (1)): every node kind the body of the census's fixed point acts on is one of WC.FLOW_KINDS,
  // and each of those is acted on — read from the module's own text (the body between its loop over `kin` and flow's return), where
  // each kind is spelled `n.type === '<kind>'` (any other spelling of n.type there is red too). A branch on an eighth kind is RED here,
  // never dead; the CONTROL plants one in a copy of the text.
  {
    const kindsActedOn = (src) => {
      const a0 = src.indexOf('for (const n of kin) {'), b0 = a0 < 0 ? -1 : src.indexOf('  return { all, isSpan, spanFields };', a0);
      if (a0 < 0 || b0 < 0) return null;
      const body = src.slice(a0, b0), eq = [...body.matchAll(/\bn\.type === '(\w+)'/g)].map((m) => m[1]);
      return { kinds: [...new Set(eq)], otherSpellings: (body.match(/\bn\.type\b/g) || []).length - eq.length };
    };
    const wcSrc = fs.readFileSync(path.join(REPO, 'scripts', 'wall-clock-census.mjs'), 'utf8');
    const got = kindsActedOn(wcSrc), K = WC.FLOW_KINDS;
    const extra = got ? got.kinds.filter((k) => !K.includes(k)) : null, unused = got ? K.filter((k) => !got.kinds.includes(k)) : null;
    const plantSrc = wcSrc.replace('for (const n of kin) {\n', "for (const n of kin) {\n      if (n.type === 'ForInStatement') spans.add('planted');\n");
    const plant = kindsActedOn(plantSrc);
    ok(!!got && !extra.length && !unused.length && got.otherSpellings === 0 && plantSrc !== wcSrc && !!plant && plant.kinds.includes('ForInStatement') && !K.includes('ForInStatement'),
      `THE FIXED POINT'S KINDS (r3135 (1)): the census's fixed point acts on exactly its ${K.length} listed kinds (${got ? got.kinds.join(', ') : 'the body not found'})${extra && extra.length ? ' — NOT LISTED: ' + extra.join(', ') : ''}${unused && unused.length ? ' — listed, never acted on: ' + unused.join(', ') : ''}${got && got.otherSpellings ? ' — ' + got.otherSpellings + ' other spelling(s) of n.type' : ''}; CONTROL: a branch planted on an eighth kind (ForInStatement) is seen`);
  }
  // THE ONE PASS'S GUARD (主开发 r3135 (4)): a helper never reads a tree the census already walked — planted the WRONG way round (the census
  // first, on a text with a clock), the helper's ask is REFUSED by name, so its section says it could not read that file
  {
    const t = "const t0 = Date.now();\nif (Date.now() - t0 > 5) console.log('x');\n";
    const one = ONE_PASS.treeOf(t);
    const row = WC.censusRow({ name: 'planted-guard', tier: 'fast' }, t, one.strict);   // the census FIRST: its walk links every node
    let refused = null;
    try { one.acorn.parse(t, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true, allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true, locations: true }); } catch (e) { refused = e.message; }
    ok(Array.isArray(row.findings) && refused === ONE_PASS_GUARD, `THE ONE PASS'S GUARD (r3135 (4)): a tree the census walked is never handed to a helper — the census first, then a helper's ask: ${refused ? 'refused by name' : 'NOT refused'}`);
  }
  ok(!v.problems.length, `no literal wall-clock bound under ${WC.LITERAL_FLOOR_MS} ms in a fast suite; the ≥ ${WC.LITERAL_FLOOR_MS} ms ones are the ratchet's (${held.length} in ${Object.keys(baseline).length} suites, only falling)${v.problems.length ? ' — ' + v.problems.join(' | ') : ''}`);
  ok(!held.length && !Object.keys(baseline).length, `THE RATCHET IS AT 0 (lane wall-clock-ratchet-down): no literal wall-clock bound held in any fast suite, the baseline empty — the next one is a NEW one, RED (${held.length} held, ${Object.keys(baseline).length} baseline rows)`);
  // THE RATIO (lane cpu-ratio-controls): no fast suite judges a growth on the clock — one measurement at two input sizes compared
  // through a factor (test-channel-facts' CPU-time growth legs were the last; test-exit-run's hrtime family is heavy, planted below)
  const growthRatios = suites.flatMap((x) => x.findings.filter((f) => f.kind === 'RATIO').map((f) => `${x.name}:${f.line} ${f.text}`));
  ok(!growthRatios.length && (by.RATIO || 0) === 0, `NO GROWTH RATIO ON THE CLOCK in a fast suite (lane cpu-ratio-controls): a complexity claim is a COUNT (scripts/work-meter.mjs; its backtrack charge for a regex) — ${growthRatios.length} found, the next one is RED${growthRatios.length ? ': ' + growthRatios.join(' | ') : ''}`);
  // PLANTS: every spelling of the class is LITERAL; every legitimate form is classified out of it
  const kinds = (src) => WC.wallClockFindings(src).map((f) => f.kind).join(',');
  // two spans measured in the run: a control and the thing judged against it
  const TWO = 'const t = performance.now(); a(); const ctl = performance.now() - t; const u = performance.now(); b(); const fix = performance.now() - u; ';
  const RED = {
    'Date.now() delta': "const t0 = Date.now(); run(); ok('fast', Date.now() - t0 < 3000);",
    'performance.now() span variable': "const t = performance.now(); run(); const ms = performance.now() - t; ok('fast', ms < 500);",
    'hrtime.bigint span': "const t = process.hrtime.bigint(); run(); const ms = Number(process.hrtime.bigint() - t) / 1e6; ok(ms < 100);",
    'an if-test failure (`if (ms > N) bad`)': "const t = performance.now(); run(); const ms = performance.now() - t; if (ms > 1500) bad.push('slow');",
    'a const used only as the bound': "const BUDGET_MS = 250; const t = Date.now(); run(); ok(Date.now() - t < BUDGET_MS);",
    'a const handed only to a watchdog timer': "const BUDGET_MS = 250; setTimeout(kill, BUDGET_MS + 1500); const t = Date.now(); run(); ok(Date.now() - t < BUDGET_MS);",
    'an object field': "const t0 = Date.now(); const r = { ms: Date.now() - t0 }; ok(r.ms < 50);",
    'a helper that returns a span': "const timeIt = (fn) => { const t = performance.now(); fn(); return performance.now() - t; }; ok(timeIt(run) < 100);",
    'a negated flag (`!(ms < B)`)': "const t = Date.now(); run(); const over = !(Date.now() - t < 1500); ok(!over);",
    'a .filter of violators': "const t = performance.now(); const times = [performance.now() - t]; const slow = times.filter((ms) => ms > 800); ok(!slow.length);",
    // lane oat-loop-gap-bound (.270): the spellings test-oat-materialize F13's `r13.maxGap < 50` hid behind
    "a helper's coerced field (F13: `maxGap: +maxGap.toFixed(1)`)": "const f13 = async () => { let maxGap = 0, last = performance.now(); const tick = () => { const t = performance.now(); maxGap = Math.max(maxGap, t - last); last = t; }; tick(); return { maxGap: +maxGap.toFixed(1) }; }; const r13 = await f13(); ok(r13.maxGap < 50, 'stall');",
    'a sum across a loop (`total += span`)': "let total = 0; for (const x of xs) { const t = performance.now(); run(x); total += performance.now() - t; } ok(total < 500);",
    'the max of spans pushed across a loop (`Math.max(...gaps)`)': "const gaps = []; let last = Date.now(); const iv = setInterval(() => { const now = Date.now(); gaps.push(now - last); last = now; }, 5); await work(); clearInterval(iv); const worst = Math.max(...gaps, 0); ok(worst < 250);",
    'an element of a sorted span array': "const ms = []; for (const x of xs) { const t = Date.now(); run(x); ms.push(Date.now() - t); } ms.sort((a, b) => a - b); ok(ms[ms.length - 1] < 300);",
    'a destructured span field': "const timed = () => { const t = Date.now(); run(); return { ms: Date.now() - t }; }; const { ms } = timed(); ok(ms < 200);",
    "process.hrtime(t0)'s [s, ns]": "const t = process.hrtime(); run(); const [s, ns] = process.hrtime(t); ok(s * 1e3 + ns / 1e6 < 100);",
    // lane wall-clock-ratchet-down (.271): the BLIND spellings the census header named
    'a span inside a tuple (`[n, msOf(fn)]`)': "const msOf = (fn) => { const t = performance.now(); fn(); return performance.now() - t; }; const rows = fns.map((fn) => [fn.name, msOf(fn)]); ok(!rows.filter(([, ms]) => ms > 800).length);",
    "a span handed to a helper's parameter": "const fast = (ms, what) => ok(ms < 500, what); const t = Date.now(); run(); fast(Date.now() - t, 'run');",
    'a span in a Map (`m.set(k, span)`, `m.get(k)`)': "const by = new Map(); const t = Date.now(); run(); by.set('run', Date.now() - t); ok(by.get('run') < 300);",
    'a span in a Set, spread': "const s = new Set(); const t = Date.now(); run(); s.add(Date.now() - t); ok(Math.max(...s) < 300);",
    'a clock function (`const now = () => Date.now()`)': "const now = () => Date.now(); const t0 = now(); run(); ok(now() - t0 < 300);",
    'a for-of over an array of spans': "const times = []; for (const x of xs) { const t = Date.now(); run(x); times.push(Date.now() - t); } for (const ms of times) ok(ms < 300);",
    // lane reconnect-storm-band (.272): THE BAND — a bound relative to a control that adds a literal number of ms
    'a control plus a literal band (test-reconnect-storm (d) before .272)': TWO + 'const lband = Math.max(ctl * 0.25, 25); ok(fix <= ctl + lband);',
    'a control plus a bare literal': TWO + 'ok(fix <= ctl + 50);',
    'a literal floor under a scaled control': TWO + 'ok(fix <= Math.max(ctl * 1.25, 50));',
    'the band on the left (`ctl + 25 >= fix`)': TWO + 'ok(ctl + 25 >= fix);',
    'a band in an if-test failure': TWO + "if (fix > ctl + 40) bad.push('slow');",
    'a literal ms × an environment factor': "const slack = process.env.CI ? 4 : 1; const t = Date.now(); run(); ok(Date.now() - t < 250 * slack);",
    'a literal ms per item (× a count)': 'const t = Date.now(); run(rows); ok(Date.now() - t < 50 * rows.length);',
  };
  const OUT = {
    wait: ["const t0 = Date.now(); while (Date.now() - t0 < 5000 && !done()) await sleep(50);", 'wait'],
    'a poll deadline in a timer callback': ["const t0 = Date.now(); const iv = setInterval(() => { if (Date.now() - t0 > 20000) { clearInterval(iv); reject(new Error('timeout')); } }, 50);", 'wait'],
    'a lower bound': ["const t0 = Date.now(); await hold(); ok(Date.now() - t0 >= 600);", 'lower'],
    "the mechanism's constant × slack": ["const t0 = Date.now(); await probe(); ok(Date.now() - t0 < 2 * DP.DUP_PROBE_MS + 500);", 'control'],
    'a const the suite hands the fake': ["const HOLD = 300; fake.holdMs = HOLD; const t0 = Date.now(); await fake.run(); ok(Date.now() - t0 < 3 * HOLD);", 'control'],
    'a control measured in the run': ["const t = performance.now(); a(); const ta = performance.now() - t; const u = performance.now(); b(); const tb = performance.now() - u; ok(tb < 4 * ta);", 'control'],
    'a noise-floor conjunct': ["const t = performance.now(); a(); const ta = performance.now() - t; if (ta > 10 && other > 2.5) bad.push('x');", 'guard'],
    // lane reconnect-storm-band: the look-alikes of a band — the control scaled (a ratio), a band made of the control
    // itself, the mechanism's constant as the band, a band on a LOWER bound
    'K × the control': [TWO + 'ok(fix <= 2 * ctl);', 'control'],
    'a relative band (`ctl + ctl * 0.25`)': [TWO + 'ok(fix <= ctl + ctl * 0.25);', 'control'],
    "the mechanism's constant as the band": [TWO + 'const SLOT_MS = 250; prod.slotMs = SLOT_MS; ok(fix <= ctl + SLOT_MS);', 'control'],
    'a band on a lower bound': [TWO + 'ok(fix >= ctl + 50);', 'lower'],
    'a timestamp plus a number (a deadline, never a band)': ["const NOW = Date.now(); const T0 = NOW - 3 * 86400e3; const r = { at: Date.now() - 5 }; ok(Number(r.at) < T0 + 1000);", 'control'],
    "F13's form since .270 (a stall against a control loop of the same length)": ["const f13 = async () => { let maxGap = 0, last = performance.now(); const tick = () => { const t = performance.now(); maxGap = Math.max(maxGap, t - last); last = t; }; tick(); const ctl = performance.now() - last; return { maxGap: +maxGap.toFixed(1), ctlGap: +ctl.toFixed(1) }; }; const r13 = await f13(); ok(r13.maxGap <= 3 * r13.ctlGap);", 'control'],
  };
  const redWrong = Object.entries(RED).filter(([, src]) => kinds(src) !== 'LITERAL').map(([n, src]) => `${n} → ${kinds(src) || 'not seen'}`);
  const outWrong = Object.entries(OUT).filter(([, [src, want]]) => kinds(src) !== want).map(([n, [src, want]]) => `${n} → ${kinds(src) || 'not seen'} (want ${want})`);
  ok(!redWrong.length, `PLANTS: ${Object.keys(RED).length} spellings of an absolute wall-clock bound are each LITERAL${redWrong.length ? ' — WRONG: ' + redWrong.join(' | ') : ''}`);
  ok(!outWrong.length, `PLANTS: ${Object.keys(OUT).length} legitimate forms are classified out of it (wait / lower / control / guard)${outWrong.length ? ' — WRONG: ' + outWrong.join(' | ') : ''}`);
  ok(kinds("const t = performance.now(); a(); const x = performance.now() - t; const u = performance.now(); b(); const y = performance.now() - u; ok(y / x <= 2.5);") === '', 'a ratio of two DIFFERENT measurements (a fix against its control) is dimensionless — no finding (relative by construction; one measurement at two sizes is THE RATIO below)');
  // THE RATIO (lane cpu-ratio-controls): every spelling of a growth judged on the clock is RATIO — the bestOf family's
  // `b / a <= 16`, a literal multiplier, a quadratic control's lower bound behind a noise floor, a named ratio, an if-test,
  // cost-ratio.mjs's growth() on CPU time; a ratio of two different measurements, the same call twice, a COUNT are not
  const HR = 'const timeOf = (n, k = 1) => { let b = Infinity; for (let i = 0; i < k; i++) { const t0 = process.hrtime.bigint(); run(n); b = Math.min(b, Number(process.hrtime.bigint() - t0) / 1e6); } return b; }; ';
  const PN = 'const timeOf = (x) => { const t = performance.now(); run(x); return performance.now() - t; }; ';
  const RATIO_RED = {
    "the bestOf family (test-exit-run before .273: `b / a <= 16` at ×8 input)": HR + 'const a = timeOf(8192, 3), b = timeOf(65536, 3); ok(b <= 1e9 || b / a <= 16);',
    'a literal multiplier (`b < 16 * a`)': PN + 'const a = timeOf(1024), b = timeOf(8192); ok(b < 16 * a);',
    "a quadratic CONTROL's lower bound behind a noise floor (`b / Math.max(0.05, a) >= 12`)": HR + 'const a = timeOf(8192, 3), b = timeOf(65536); ok(b / Math.max(0.05, a) >= 12);',
    'a floor and a scale on the small side (test-channel-thread before .209)': HR + 'const a = timeOf(64 * 1024), b = timeOf(512 * 1024); ok(b < Math.max(5, a) * 16);',
    'a ratio bound to a name': PN + 'const small = timeOf(4096), big = timeOf(32768); const r = big / small; ok(r <= 8.5);',
    'a ratio in an if-test failure': PN + "const a = timeOf(4096), b = timeOf(32768); if (b / a > 10) bad.push('superlinear');",
    "cost-ratio.mjs's growth() on CPU time (test-channel-facts before .273)": "import { growth } from './cost-ratio.mjs'; const g = growth((x) => run(x), small, big, { inner: 50 }); ok(g.ratio <= 24);",
    "growth()'s ratio as a quadratic control's lower bound": "import { growth } from './cost-ratio.mjs'; const gQ = growth(q, small, big, { inner: 1 }); ok(gQ.ratio > 24 && other);",
  };
  const RATIO_OUT = {
    'one helper over two DIFFERENT inputs at one size (a hostile text against a plain one)': [PN + 'const a = timeOf(plain), b = timeOf(hostile); ok(b <= 40 * a);', 'control'],
    'the same call twice (a determinism read)': [PN + 'const a = timeOf(8192), b = timeOf(8192); ok(b <= 2 * a);', 'control'],
    'a COUNT at two sizes (the work meter in a child)': ["const v = judgeInChild({ module, run, mk, n: 8192, kind: 'linear', backtracks: true, opts: { factor: 8 } }); ok(v.ok && v.r <= 8.8);", ''],
    "growth()'s other fields (a printed cost)": ["import { growth } from './cost-ratio.mjs'; const g = growth(f, small, big); console.log(g.smallMs, g.bigMs); ok(typeof g.bigMs === 'number');", ''],
  };
  const ratioWrong = Object.entries(RATIO_RED).filter(([, src]) => !kinds(src).split(',').includes('RATIO')).map(([n, src]) => `${n} → ${kinds(src) || 'not seen'}`);
  const ratioOutWrong = Object.entries(RATIO_OUT).filter(([, [src, want]]) => kinds(src) !== want).map(([n, [src, want]]) => `${n} → ${kinds(src) || 'not seen'} (want ${want || 'no finding'})`);
  ok(!ratioWrong.length, `PLANTS: ${Object.keys(RATIO_RED).length} spellings of a growth judged on the clock are each RATIO${ratioWrong.length ? ' — WRONG: ' + ratioWrong.join(' | ') : ''}`);
  ok(!ratioOutWrong.length, `PLANTS: ${Object.keys(RATIO_OUT).length} look-alikes are not (two different measurements, the same call twice, a count, growth()'s printed fields)${ratioOutWrong.length ? ' — WRONG: ' + ratioOutWrong.join(' | ') : ''}`);
  ok(kinds("const t0 = performance.now(); await sweep(); const took = performance.now() - t0; const until = performance.now() + took; while (performance.now() < until) await tick();") === '', 'a mark plus a span is a DEADLINE (a control loop as long as the sweep), not a span — no finding');
  // THE PRODUCT'S CLOCK (lane wall-clock-ratchet-down): a duration the product module the suite LOADS fills from a clock
  // (`ms: Date.now() - t0`, `{ fsMs, loopMs }` off a worker), or a child script prints (python `time.monotonic()`), is a
  // span on what the suite got back from a call — and only there: a module the suite hands its own `now`, an object the
  // suite built itself (a fake timer's `{ fn, ms }`), a module it reads as TEXT for a pin, are no source
  const MODS = {
    'src/server/tls.js': "function runChild(cmd) { const t0 = Date.now(); return new Promise((r) => r({ code: 0, ms: Date.now() - t0 })); } module.exports = { runChild };",
    'src/server/canary.js': "function create({ now = () => Date.now() } = {}) { return { async tick() { const sentAt = now(); const r = await post(); const gotAt = now(); const fsMs = Math.max(0, r.fsMs); const loopMs = gotAt - r.doneAt; return { fsMs, loopMs }; } }; } const w = 'canary-worker.js';",
    'src/server/canary-worker.js': "const startAt = Date.now(); const doneAt = Date.now(); post({ startAt, doneAt, fsMs: doneAt - startAt });",
    'scripts/fixtures/probe.py': "t = time.monotonic()\nout['ms'] = round((time.monotonic() - t) * 1000)\n",
  };
  const readPlant = (rel) => (rel in MODS ? MODS[rel] : null);
  const pkinds = (src) => WC.wallClockFindings(src, { fields: WC.productSpanFields(src, readPlant) }).map((f) => f.kind).join(',');
  const PRED = {
    "a product-returned field (tls.js runChild's `ms`)": "const TLS = require('../src/server/tls.js'); const t = await TLS.runChild('x'); ok(t.code === 0 && t.ms < 5000);",
    "a product field forwarded off its worker (the canary's `fsMs`)": "const C = require(path.join(REPO, 'src/server/canary.js')); const r = await C.create().tick(); ok(r.fsMs < 100);",
    "the product's own clock default (`now = () => Date.now()`)": "const C = require(path.join(REPO, 'src/server/canary.js')); const r = await C.create().tick(); ok(r.loopMs < 100);",
    "a child's JSON (secret-probe.py's `ms`)": "const PROBE = path.join(ROOT, 'scripts/fixtures/probe.py'); const r = JSON.parse(spawnSync('python3', [PROBE]).stdout); ok(r.ms < 3000);",
  };
  const POUT = {
    'a module the suite hands its own clock': "const C = require(path.join(REPO, 'src/server/canary.js')); let clock = 0; const r = await C.create({ now: () => clock }).tick(); ok(r.loopMs < 100);",
    "the suite's own object with the field's name (a fake timer)": "const TLS = require('../src/server/tls.js'); const caught = []; global.setTimeout = (fn, ms) => { caught.push({ fn, ms }); }; const t = await TLS.runChild('x'); ok(caught.filter((c) => c.ms > 60e3).length === 0);",
    'a module read as TEXT for a pin': "const src = read('src/server/tls.js'); const t = parse(src); ok(t.ms < 5000);",
  };
  const pWrong = Object.entries(PRED).filter(([, src]) => pkinds(src) !== 'LITERAL').map(([n, src]) => `${n} → ${pkinds(src) || 'not seen'}`);
  const poWrong = Object.entries(POUT).filter(([, src]) => pkinds(src) !== '').map(([n, src]) => `${n} → ${pkinds(src)}`);
  ok(!pWrong.length, `PLANTS: ${Object.keys(PRED).length} durations the PRODUCT or a child measured are each LITERAL${pWrong.length ? ' — WRONG: ' + pWrong.join(' | ') : ''}`);
  ok(!poWrong.length, `PLANTS: ${Object.keys(POUT).length} look-alikes are no finding (the suite's own clock handed in, its own fake-timer object, a module read as text)${poWrong.length ? ' — WRONG: ' + poWrong.join(' | ') : ''}`);
  // THE RATCHET AT 0: a ≥ 1 s literal bound anywhere is a NEW one, a sub-second one is RED by the floor, a baseline
  // above the truth and a baseline name that is no fast suite say "lower it" — each RED
  const plantSuite = (name, src) => [...suites.filter((x) => x.name !== name), { name, findings: WC.wallClockFindings(src, { fields: WC.productSpanFields(src) }) }];
  const lazySrc = fs.readFileSync(path.join(REPO, 'scripts', 'test-lazy.mjs'), 'utf-8');
  const pNew = WC.ratchetVerdict(plantSuite('test-lazy', lazySrc + "\nconst tP = Date.now(); ok(Date.now() - tP < 4000, 'planted');\n"), baseline).problems;
  const pSub = WC.ratchetVerdict(plantSuite('test-lazy', lazySrc + "\nconst tP = Date.now(); ok(Date.now() - tP < 200, 'planted');\n"), baseline).problems;
  const pHigh = WC.ratchetVerdict(suites, { ...baseline, 'test-lazy': 1 }).problems;
  const pGone = WC.ratchetVerdict(suites, { ...baseline, 'test-no-such-suite': 1 }).problems;
  ok(pNew.some((p) => p.startsWith('test-lazy') && /a NEW one/.test(p)) && pSub.some((p) => /test-lazy:\d+ asserts .* under 1000 ms/.test(p)) && pHigh.some((p) => p.startsWith('test-lazy') && /lower it/.test(p)) && pGone.some((p) => /test-no-such-suite/.test(p)),
    'CONTROLS: a 4 s bound planted in test-lazy is a NEW one, a 200 ms one is RED by the floor, a baseline above the truth and a baseline name that is no fast suite say "lower it" — all RED');
  // …and a GROWTH RATIO planted in the same copy is RED by the census (lane cpu-ratio-controls): no baseline holds one
  const pRatio = WC.ratchetVerdict(plantSuite('test-lazy', lazySrc + "\nconst tR = (n) => { const t0 = performance.now(); for (let i = 0; i < n; i++); return performance.now() - t0; }; const rA = tR(1e5), rB = tR(8e5); ok(rB / rA <= 16, 'planted');\n"), baseline).problems;
  ok(pRatio.some((p) => /^test-lazy:\d+ judges rB \/ rA <= 16 — one measurement at two input sizes/.test(p)), `CONTROL: a growth ratio planted in test-lazy (\`rB / rA <= 16\` over one timer at two sizes) is RED (${pRatio.filter((p) => p.startsWith('test-lazy')).length} problem)`, pRatio);
  // THE 30 THEMSELVES: rel270's copy of every suite the ratchet held reads RED against today's empty baseline (a
  // depth-1 checkout has no 25cd69aef: SKIP, said) — and its fs-canary / tls-pass / app-display-secrets (the product's
  // clock, unseen before) read RED with them
  const HELD270 = ['test-agentd-upgrade-loop', 'test-app-display-secrets', 'test-app-display-session-census', 'test-app-manifest', 'test-auto-resume', 'test-boot-phase', 'test-browser-disk', 'test-browser-display', 'test-browser-passkey', 'test-ci-gate', 'test-codex-0153', 'test-codex-pool', 'test-design-routes', 'test-dial-link-kept', 'test-egress-fence', 'test-key-file-law', 'test-mount-argv', 'test-notify-retry', 'test-opencode-serve', 'test-parked-ask-inbox', 'test-quota-source', 'test-raw-filename', 'test-usage-index-owner', 'test-vfs-cache-place', 'test-window-binding-model'];
  let rel270 = null;
  try { rel270 = Object.fromEntries([...HELD270, 'test-fs-canary', 'test-tls-pass'].map((n) => [n, git(REPO, ['show', `25cd69aef:scripts/${n}.mjs`])])); } catch { rel270 = null; }
  if (rel270 === null) console.log('    SKIP: 25cd69aef is not in this checkout (a depth-1 clone) — the ratchet-at-0 control needs rel270');
  else {
    const red = (n) => WC.ratchetVerdict(plantSuite(n, rel270[n]), baseline).problems.filter((p) => p.startsWith(n));
    const notRed = HELD270.filter((n) => !red(n).some((p) => /a NEW one/.test(p)));
    const canary = red('test-fs-canary'), tls = red('test-tls-pass');
    ok(!notRed.length && canary.length === 4 && canary.every((p) => /r\.(?:fs|loop)Ms < \d+/.test(p)) && tls.some((p) => /t\.ms < 5000/.test(p)),
      `CONTROL: rel270's copies read RED here — every one of the ${HELD270.length} suites the ratchet held (a NEW one each), test-fs-canary's 4 bounds on the canary's own fsMs / loopMs, test-tls-pass's \`t.ms < 5000\`${notRed.length ? ' — NOT RED: ' + notRed.join(', ') : ''} (${canary.length} + ${tls.length})`);
  }
  // THE INCIDENT ITSELF: rel269's test-enter-census reads RED here (a depth-1 checkout has no d419156bd: SKIP, said)
  let rel269 = null;
  try { rel269 = git(REPO, ['show', 'd419156bd:scripts/test-enter-census.mjs']); } catch { rel269 = null; }
  if (rel269 === null) console.log('    SKIP: d419156bd is not in this checkout (a depth-1 clone) — the incident control needs rel269');
  else {
    const pInc = WC.ratchetVerdict(plantSuite('test-enter-census', rel269), baseline).problems;
    ok(pInc.some((p) => p.startsWith('test-enter-census') && /ms < 3000/.test(p)), `CONTROL: rel269's test-enter-census (\`ms < 3000\`, the mirror's 4335 ms red) reads RED here (${pInc.filter((p) => p.startsWith('test-enter-census')).length} problem)`);
  }
  // THE SECOND INCIDENT (lane oat-loop-gap-bound): .270's candidate (run 38560509611) went red on test-oat-materialize
  // F13's `r13.maxGap < 50` — 59.4 ms on ubuntu-latest — a span this census could not see through the helper's
  // `maxGap: +maxGap.toFixed(1)`; that suite at a7321ff0e reads RED here, today's (a stall against a control) does not.
  // B-874f (lane bl-tests-e): a7321ff0e is a lane commit master never held — the leg ran only where that branch was fetched (the
  // push gate) and SKIPPED everywhere else. The 24 lines it asserts on are FROZEN once in scripts/fixtures/off-master/ and read
  // here on every checkout, the runner's depth-1 clone too.
  const a7321 = fs.readFileSync(path.join(REPO, 'scripts/fixtures/off-master/a7321ff0e-oat-materialize-f13.txt'), 'utf8');
  const pF13 = WC.ratchetVerdict(plantSuite('test-oat-materialize', a7321), baseline).problems.filter((p) => p.startsWith('test-oat-materialize'));
  ok(pF13.length === 1 && /r13\.maxGap < 50/.test(pF13[0]), `CONTROL: a7321ff0e's test-oat-materialize F13 (\`r13.maxGap < 50\`, the 59.4 ms red — frozen) reads RED here (${pF13.length} problem${pF13.length === 1 ? '' : 's'})`);
  // THE THIRD INCIDENT (lane reconnect-storm-band): .271's heavy shard 6/6 went red on test-reconnect-storm (d), `fix ≤
  // control + max(25 %, 25 ms)` on the server's loop delay — 61 vs 31 and 60 vs 25 on ubuntu-latest — a bound relative to
  // a control that ADDS a literal band. That suite is HEAVY (this census reads the fast tier) and its loop figures come
  // off the server's preload log under names that carry no unit (`loopMax`, `gapMax`, `visP95`): planted with those names
  // read as the durations they are, rel270's copy reads RED on (d)'s two banded legs and on (b)'s `+ 50`; today's holds none
  const STORM_FIELDS = ['loopMax', 'gapMax', 'visP95'];
  const stormNow = WC.wallClockFindings(fs.readFileSync(path.join(REPO, 'scripts', 'test-reconnect-storm.mjs'), 'utf-8'), { fields: STORM_FIELDS });
  ok(!stormNow.some((f) => f.kind === 'LITERAL') && stormNow.some((f) => f.kind === 'control'), `today's test-reconnect-storm, planted the same way, holds no literal band — (b) is a ratio to the control (${stormNow.map((f) => `${f.kind} :${f.line}`).join(' · ')})`);
  let storm270 = null;
  try { storm270 = git(REPO, ['show', '25cd69aef:scripts/test-reconnect-storm.mjs']); } catch { storm270 = null; }
  if (storm270 === null) console.log('    SKIP: 25cd69aef is not in this checkout (a depth-1 clone) — the reconnect-storm (d) control needs rel270');
  else {
    const pS = WC.ratchetVerdict([...suites, { name: 'test-reconnect-storm', findings: WC.wallClockFindings(storm270, { fields: STORM_FIELDS }) }], baseline).problems.filter((p) => p.startsWith('test-reconnect-storm'));
    ok(pS.length === 3 && [/F\.loopMax <= C\.loopMax \+ lband/, /F\.gapMax <= Math\.max\(C\.gapMax \+ band, 50\)/, /F\.visP95 <= C\.visP95 \+ 50/].every((re) => pS.some((p) => re.test(p) && /under 1000 ms/.test(p))),
      `CONTROL: 25cd69aef's test-reconnect-storm, planted, reads RED on (d)'s loop-delay and srv-loop-gap-ms bands and on (b)'s \`+ 50\` (${pS.length} problems)`);
  }
  // THE FOURTH AND FIFTH (lane cpu-ratio-controls, B-923c + B-e83c): rel271's test-exit-run — HEAVY, so planted — judged the
  // secret-shape regexes by hrtime ratios at ×4 / ×8 input (red 1 in 5 beside 32 spinners), and rel271's test-channel-facts its
  // decoder and V1 by CPU-time growth (its quadratic control read 17 × for 64 × beside a 12-wide fast tier): both read RED on
  // every growth leg here; today's copies hold none (a COUNT each)
  const exitNow = WC.wallClockFindings(fs.readFileSync(path.join(REPO, 'scripts', 'test-exit-run.mjs'), 'utf-8'));
  ok(!exitNow.some((f) => f.kind === 'RATIO'), `today's test-exit-run, planted, holds no growth ratio — its legs are counts (${exitNow.filter((f) => f.kind === 'RATIO').length} RATIO)`);
  let rel271 = null;
  try { rel271 = { exit: git(REPO, ['show', 'f57d1cbe9:scripts/test-exit-run.mjs']), facts: git(REPO, ['show', 'f57d1cbe9:scripts/test-channel-facts.mjs']) }; } catch { rel271 = null; }
  if (rel271 === null) console.log('    SKIP: f57d1cbe9 is not in this checkout (a depth-1 clone) — the clock-ratio controls need rel271');
  else {
    const pE = WC.ratchetVerdict([...suites, { name: 'test-exit-run', findings: WC.wallClockFindings(rel271.exit) }], baseline).problems.filter((p) => p.startsWith('test-exit-run:') && /a growth ratio/.test(p));
    const pF = WC.ratchetVerdict(plantSuite('test-channel-facts', rel271.facts), baseline).problems.filter((p) => p.startsWith('test-channel-facts:'));
    ok(pE.length === 10 && pE.filter((p) => /b \/ a <= (?:8|16)\b/.test(p)).length === 4 && pE.filter((p) => /b \/ Math\.max\(0\.05, a\) >= 12/.test(p)).length === 6
      && pF.length === 5 && ['gB.ratio <= 4', 'gWalk.ratio > 4', 'gW1.ratio <= 24', 'gW2.ratio <= 24', 'gQ.ratio > 24'].every((t) => pF.some((p) => p.includes(t))),
      `CONTROL: f57d1cbe9's test-exit-run, planted, reads RATIO on its 4 linear legs and 6 quadratic controls (${pE.length}); its test-channel-facts on V1 and the decoder's 5 growth reads (${pF.length})`);
  }
}

// ── shared by §2g and §2h: a red names what it saw; a workflow's jobs → steps, line-based (no YAML parser in this tree) ──
const okd = (c, n, d) => ok(c, c || !d ? n : `${n}\n      ${String(d).trim().split('\n').join('\n      ')}`);
// a step is a `- ` item under a `steps:` key, up to the next item at its indent; each job's step list also carries the
// job's key (`job`) and its own timeout-minutes (`bound`), read between the job's key line and its `steps:`
const jobsOf = (text) => {
  const lines = text.split('\n'), jobs = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)steps:\s*$/.exec(lines[i]);
    if (!m) continue;
    const steps = [];
    let at = -1;
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j], ind = l.length - l.trimStart().length, note = !l.trim() || /^\s*#/.test(l);
      if (!note && ind <= m[1].length) break;
      if (!note && /^\s*- /.test(l) && (at < 0 || ind === at)) { at = ind; steps.push([l.slice(0, ind) + '  ' + l.slice(ind + 2)]); continue; }
      if (steps.length) steps[steps.length - 1].push(l);
    }
    let h = i - 1;
    while (h > 0 && !new RegExp(`^ {${Math.max(0, m[1].length - 2)}}[\\w-]+:\\s*$`).test(lines[h])) h--;
    const jobBound = lines.slice(h + 1, i).map((l) => new RegExp(`^ {${m[1].length}}timeout-minutes:\\s*(\\S+)`).exec(l)).find(Boolean);
    jobs.push(Object.assign(steps.map((ls) => {
      const ind = ls[0].length - ls[0].trimStart().length, key = (k) => ls.findIndex((l) => new RegExp(`^ {${ind}}${k}:`).test(l));
      const val = (k) => { const at = key(k); return at < 0 ? null : ls[at].slice(ind + k.length + 1).trim(); };
      const r = key('run');
      let run = r < 0 ? null : ls[r].slice(ind + 'run:'.length).trim();
      if (r >= 0 && /^[|>][-+]?$/.test(run)) { // a block scalar: every line deeper than its key (a `#` line too), then the next key
        const body = [];
        for (const l of ls.slice(r + 1)) { if (l.trim() && l.length - l.trimStart().length <= ind) break; body.push(l); }
        const cut = Math.min(...body.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length));
        run = body.map((l) => l.slice(cut)).join('\n').trim();
      }
      const bound = val('timeout-minutes');
      return { text: ls.filter((l) => l.trim() && !/^\s*#/.test(l)).join('\n'), run, uses: key('uses') >= 0, cont: key('continue-on-error') >= 0,
        action: val('uses'), bound: bound === null ? null : Number(bound), label: val('name') || val('uses') || (run || '').split('\n')[0] };
    }), { job: (/^\s*([\w-]+):/.exec(lines[h]) || [])[1] || '?', bound: jobBound ? Number(jobBound[1]) : null }));
  }
  return jobs;
};

// ── §2f THE MIRROR'S ONE APT DOOR (lane mirror-flake-hardening: rel269's heavy 2/4 died in `apt-get update`, exit 100,
// on packages.microsoft.com — a repository the runner ships and we never install from — answering only over IPv6) ──
console.log('\n§2f ci.yml installs through scripts/ci-apt.sh (a repository we do not need never fails a job)');
{
  const wf = fs.readFileSync(path.join(REPO, '.github', 'workflows', 'ci.yml'), 'utf-8');
  const runs = wf.split('\n').filter((l) => /^\s*run:/.test(l));
  const bare = runs.filter((l) => /\bapt(?:-get)?\b/.test(l) && !/scripts\/ci-apt\.sh/.test(l));
  const door = runs.filter((l) => /scripts\/ci-apt\.sh/.test(l));
  ok(!bare.length && door.length >= 2, `every apt step in ci.yml goes through scripts/ci-apt.sh (${door.length} steps${bare.length ? '; BARE: ' + bare.map((l) => l.trim()).join(' | ') : ''})`);
  const sh = fs.readFileSync(path.join(REPO, 'scripts', 'ci-apt.sh'), 'utf-8');
  ok(/Acquire::ForceIPv4=true/.test(sh) && /--no-install-recommends/.test(sh), 'the door speaks IPv4 and installs only the packages named');
  ok(/-o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30/.test(sh) && /timeout -k \d+ "\$b" \$SUDO/.test(sh) && /^BOUND=\$\{CI_APT_BOUND:-80\}$/m.test(sh) && /^FIRST=\$\{CI_APT_UPDATE_BOUND:-\$\{CI_APT_BOUND:-40\}\}$/m.test(sh),
    'the door is BOUNDED (lane ci-cjk-fonts): a stalled connection gives up after 30 s, every apt call runs under `timeout` (80 s, sized for dtach)');
  // the selection over a fixture sources.list.d: the runner's microsoft lists moved aside (printed), ubuntu.sources kept
  const dir = path.join(mktmp('apt'), 'sources.list.d');
  fs.mkdirSync(dir, { recursive: true });
  // B-4a3b: every run here keeps the second mirror's list in a scratch file (never the runner's /tmp default) and reads a fixture release
  const aptState = path.join(path.dirname(dir), 'second-mirror.list'), osRel = path.join(path.dirname(dir), 'os-release');
  fs.writeFileSync(osRel, 'NAME="Ubuntu"\nVERSION_CODENAME=noble\n');
  const AENV = { CI_APT_STATE: aptState, CI_APT_OS_RELEASE: osRel, CI_APT_PAUSE: '0.1' };   // r3181's small: the paused retry's pause, short here
  fs.writeFileSync(path.join(dir, 'ubuntu.sources'), 'Types: deb\nURIs: mirror+file:/etc/apt/apt-mirrors.txt\nSuites: noble noble-updates\nComponents: main universe\n');
  fs.writeFileSync(path.join(dir, 'microsoft-prod.list'), 'deb [arch=amd64,armhf,arm64] https://packages.microsoft.com/ubuntu/24.04/prod noble main\n');
  fs.writeFileSync(path.join(dir, 'azure-cli.sources'), 'Types: deb\nURIs: https://packages.microsoft.com/repos/azure-cli/\nSuites: noble\n');
  const r = spawnSync('bash', [path.join(REPO, 'scripts', 'ci-apt.sh'), 'dtach'], { encoding: 'utf-8', env: { PATH: process.env.PATH, CI_APT_SOURCES_DIR: dir, CI_APT_SUDO: '', CI_APT_ECHO: '1' , ...AENV } });
  const left = fs.readdirSync(dir).sort().join(), aside = fs.existsSync(dir + '.off') ? fs.readdirSync(dir + '.off').sort().join() : '';
  ok(r.status === 0 && left === 'ubuntu.sources' && aside === 'azure-cli.sources,microsoft-prod.list' && /moved aside microsoft-prod\.list — https:\/\/packages\.microsoft\.com/.test(r.stdout) && /kept ubuntu\.sources/.test(r.stdout),
    `the runner's packages.microsoft.com lists are moved aside BY NAME, the Ubuntu archive kept (left: ${left}; aside: ${aside})`);
  const OPTS = '-o Acquire::ForceIPv4=true -o Acquire::Retries=3 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30';
  okd(r.stdout.includes(`\ntimeout 40 apt-get ${OPTS} --error-on=any update\nci-apt: the index is the runner's mirror's\n`) && r.stdout.endsWith(`timeout 80 apt-get ${OPTS} install -y --no-install-recommends dtach\n`), 'then update + install of exactly the named package, IPv4 forced, each call bounded', r.stdout);
  const noUpd = spawnSync('bash', [path.join(REPO, 'scripts', 'ci-apt.sh'), '--no-update', 'dtach'], { encoding: 'utf-8', env: { PATH: process.env.PATH, CI_APT_SOURCES_DIR: dir, CI_APT_SUDO: '', CI_APT_ECHO: '1', CI_APT_BOUND: '200' , ...AENV } });
  ok(noUpd.status === 0 && !/ update\n/.test(noUpd.stdout) && /^timeout 200 apt-get .* install -y --no-install-recommends dtach$/m.test(noUpd.stdout), '--no-update installs on the index the first step fetched; CI_APT_BOUND sizes the bound for a larger package');
  if (!DEEP) inTwin('the stalled-mirror, second-mirror and install-retry legs over stub apt-gets (each bound is a real wait)');
  else {
  // the bound itself, over a stub apt-get that never answers (a stalled mirror): the call is killed, the step red BY NAME
  const stub = path.join(mktmp('aptstub'), 'bin');
  fs.mkdirSync(stub);
  fs.writeFileSync(path.join(stub, 'apt-get'), '#!/bin/bash\nexec sleep 30\n', { mode: 0o755 });
  const hung = spawnSync('bash', [path.join(REPO, 'scripts', 'ci-apt.sh'), 'dtach'], { encoding: 'utf-8', env: { PATH: `${stub}:${process.env.PATH}`, CI_APT_SOURCES_DIR: dir, CI_APT_SUDO: '', CI_APT_BOUND: '0.3' , ...AENV } });
  okd(hung.status === 124 && (hung.stderr.match(/^::warning::ci-apt: apt-get … update passed its 0\.3 s bound \(a stalled mirror\)$/gm) || []).length === 2 && (hung.stderr.match(/^::error::ci-apt: apt-get … update passed its 0\.3 s bound \(a stalled mirror\)$/gm) || []).length === 1
    && /ONCE more against http:\/\/archive\.ubuntu\.com\/ubuntu/.test(hung.stdout) && /the second mirror's update failed — once more in 0\.1 s/.test(hung.stdout) && !/install -y/.test(hung.stdout + hung.stderr),
    `an apt call past its bound is killed; a stalled update is tried ONCE more on the second mirror and once more after a pause (two warnings), and when that stalls too the step goes red naming it — the install never starts (exit ${hung.status})`, hung.stdout + hung.stderr);
  // r3181's small (the release mirror run 45164852385: «Install dtach», the second mirror's update past its 80 s bound): the second mirror
  // stalls ONCE — the paused third try serves, the install reads that index, no red
  { const twice = path.join(mktmp('apttwice'), 'bin'), log = path.join(path.dirname(twice), 'argv.log');
    fs.mkdirSync(twice);
    fs.writeFileSync(path.join(twice, 'apt-get'), '#!/bin/bash\necho "$*" >> "$APT_STUB_LOG"\n[ "$(wc -l < "$APT_STUB_LOG")" -le 2 ] && exec sleep 30\nexit 0\n', { mode: 0o755 });
    const tw = spawnSync('bash', [path.join(REPO, 'scripts', 'ci-apt.sh'), 'dtach'], { encoding: 'utf-8', env: { PATH: `${twice}:${process.env.PATH}`, CI_APT_SOURCES_DIR: dir, CI_APT_SUDO: '', CI_APT_BOUND: '0.5', APT_STUB_LOG: log, ...AENV } });
    const calls = fs.readFileSync(log, 'utf-8').trim().split('\n'), alt = `-o Dir::Etc::sourcelist=${aptState} -o Dir::Etc::sourceparts=-`;
    okd(tw.status === 0 && calls.length === 4 && calls[1].endsWith(`${alt} --error-on=any update`) && calls[2].endsWith(`${alt} --error-on=any update`) && calls[3].includes(alt) && / install -y --no-install-recommends dtach$/.test(calls[3])
      && (tw.stderr.match(/^::warning::ci-apt: apt-get … update passed its 0\.5 s bound/gm) || []).length === 2 && !/::error::/.test(tw.stderr) && /once more in 0\.1 s/.test(tw.stdout),
      `the second mirror stalling once: the update goes once more after the pause and serves; the install reads that index, no red (exit ${tw.status}, ${calls.length} calls)`, tw.stdout + tw.stderr + calls.join('\n'));
    const yml2 = fs.readFileSync(path.join(REPO, '.github', 'workflows', 'ci.yml'), 'utf-8');
    ok((yml2.match(/        run: bash scripts\/ci-apt\.sh dtach\n {8}# 7 \([^\n]*380 s\n {8}timeout-minutes: 7\n/g) || []).length === 2, 'both dtach steps are bounded at 7 min, the worst path with the paused try (40 + 80 + 20 + 80 + 80 + 80 = 380 s) inside it');
  }
  // B-4a3b THE SECOND MIRROR: the runner's mirror stalls on the FIRST call only (10-31: three jobs red at SETUP, exit 124)
  { const once = path.join(mktmp('aptonce'), 'bin'), log = path.join(path.dirname(once), 'argv.log');
    fs.mkdirSync(once);
    fs.writeFileSync(path.join(once, 'apt-get'), '#!/bin/bash\necho "$*" >> "$APT_STUB_LOG"\n[ "$(wc -l < "$APT_STUB_LOG")" -eq 1 ] && exec sleep 30\nexit 0\n', { mode: 0o755 });
    const env = { PATH: `${once}:${process.env.PATH}`, CI_APT_SOURCES_DIR: dir, CI_APT_SUDO: '', CI_APT_BOUND: '0.5', APT_STUB_LOG: log, ...AENV };
    const rr = spawnSync('bash', [path.join(REPO, 'scripts', 'ci-apt.sh'), 'dtach'], { encoding: 'utf-8', env });
    const calls = fs.readFileSync(log, 'utf-8').trim().split('\n'), alt = `-o Dir::Etc::sourcelist=${aptState} -o Dir::Etc::sourceparts=-`;
    okd(rr.status === 0 && calls.length === 3 && / --error-on=any update$/.test(calls[0]) && !calls[0].includes('sourcelist') && calls[1].endsWith(`${alt} --error-on=any update`) && calls[2].includes(alt) && / install -y --no-install-recommends dtach$/.test(calls[2])
      && /^::warning::ci-apt: apt-get … update passed its 0\.5 s bound/m.test(rr.stderr) && !/::error::/.test(rr.stderr) && /ONCE more against http:\/\/archive\.ubuntu\.com\/ubuntu \(noble main universe\)/.test(rr.stdout),
      `a stalled first update is a WARNING, the second mirror's update serves, and the install reads THAT index (exit ${rr.status}, ${calls.length} calls)`, rr.stdout + rr.stderr + calls.join('\n'));
    const K = '[signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg]';
    ok(fs.readFileSync(aptState, 'utf-8') === `deb ${K} http://archive.ubuntu.com/ubuntu noble main universe\ndeb ${K} http://archive.ubuntu.com/ubuntu noble-updates main universe\n`,
      'the second mirror\'s list: the runner\'s release (main + universe, the release and its -updates), signed by the archive keyring, every source part off');
    // a mirror that FAILS FAST (exit 100, no stall) is a failed update too — warned with its exit code, then the second mirror
    const fastFail = path.join(mktmp('aptfail'), 'bin'), logF = path.join(path.dirname(fastFail), 'argv.log');
    fs.mkdirSync(fastFail);
    fs.writeFileSync(path.join(fastFail, 'apt-get'), '#!/bin/bash\necho "$*" >> "$APT_STUB_LOG"\n[ "$(wc -l < "$APT_STUB_LOG")" -eq 1 ] && exit 100\nexit 0\n', { mode: 0o755 });
    const ff = spawnSync('bash', [path.join(REPO, 'scripts', 'ci-apt.sh'), 'dtach'], { encoding: 'utf-8', env: { ...env, PATH: `${fastFail}:${process.env.PATH}`, APT_STUB_LOG: logF } });
    ok(ff.status === 0 && /^::warning::ci-apt: apt-get … update failed \(exit 100\)$/m.test(ff.stderr) && /ONCE more against/.test(ff.stdout) && fs.readFileSync(logF, 'utf-8').trim().split('\n').length === 3,
      'a mirror that FAILS FAST (exit 100) is warned with its exit code and the second mirror serves — not only a stall');
    // THE INSTALL'S ONE MORE TRY (B-3f60: hosted run 44202852228's «Install zsh» — the install's fetch past its bound after a green
    // update): a stub apt-get that answers each call by a plan (ok / stall / fail), one call per line of its log
    const plan = path.join(mktmp('aptplan'), 'bin'); fs.mkdirSync(plan);
    fs.writeFileSync(path.join(plan, 'apt-get'), '#!/bin/bash\necho "$*" >> "$APT_STUB_LOG"\nn=$(wc -l < "$APT_STUB_LOG"); a=$(echo "$APT_PLAN" | cut -d, -f"$n")\n[ "$a" = stall ] && exec sleep 30\n[ "$a" = fail ] && exit 100\nexit 0\n', { mode: 0o755 });
    const planned = (args, p, extra = {}) => { const lg = path.join(mktmp('aptplanlog'), 'argv.log'); fs.writeFileSync(lg, '');
      const st = path.join(path.dirname(lg), 'second.list'); if (extra.second) fs.writeFileSync(st, 'deb [signed-by=/k] http://second.example/ubuntu noble main\n');
      const r = spawnSync('bash', [path.join(REPO, 'scripts', 'ci-apt.sh'), ...args], { encoding: 'utf-8', env: { PATH: `${plan}:${process.env.PATH}`, CI_APT_SOURCES_DIR: dir, CI_APT_SUDO: '', CI_APT_BOUND: '0.5', APT_STUB_LOG: lg, APT_PLAN: p, CI_APT_STATE: st, CI_APT_OS_RELEASE: osRel } });
      return { r, calls: fs.readFileSync(lg, 'utf-8').trim().split('\n'), st }; };
    const i1 = planned(['zsh'], 'ok,stall,ok,ok');
    ok(i1.r.status === 0 && i1.calls.length === 4 && /install -y --no-install-recommends zsh$/.test(i1.calls[1]) && !i1.calls[1].includes('sourcelist') && /sourceparts=- --error-on=any update$/.test(i1.calls[2]) && /sourcelist=.* install -y --no-install-recommends zsh$/.test(i1.calls[3])
      && /^::warning::ci-apt: apt-get … zsh passed its 0\.5 s bound/m.test(i1.r.stderr) && !/::error::/.test(i1.r.stderr),
      `an install that STALLS after a green update goes ONCE more on the second mirror — its own update, then the install (B-3f60; ${i1.calls.length} calls)`, i1.r.stdout + i1.r.stderr + i1.calls.join('\n'));
    const i2 = planned(['--no-update', 'zsh'], 'fail,ok', { second: true });
    ok(i2.r.status === 0 && i2.calls.length === 2 && i2.calls.every((c) => c.includes('sourcelist=') && / install -y --no-install-recommends zsh$/.test(c)) && /ONCE more on the same index/.test(i2.r.stdout),
      'an install on an index that IS the second mirror\'s already goes ONCE more on that same index');
    const i3 = planned(['--no-update', 'zsh'], 'fail,ok,fail');   // the install fails, the second mirror's update answers, its install fails too
    ok(i3.r.status !== 0 && i3.calls.length === 3 && /^::error::ci-apt: apt-get … zsh failed \(exit 100\)$/m.test(i3.r.stderr),
      `an install that fails on BOTH mirrors is a red that names it — no third install (exit ${i3.r.status}, ${i3.calls.length} calls)`);
    const later = spawnSync('bash', [path.join(REPO, 'scripts', 'ci-apt.sh'), '--no-update', 'zsh'], { encoding: 'utf-8', env });
    const c2 = fs.readFileSync(log, 'utf-8').trim().split('\n');
    ok(later.status === 0 && c2.length === 4 && c2[3].includes(alt) && / install -y --no-install-recommends zsh$/.test(c2[3]) && /the index is the second mirror's/.test(later.stdout),
      'a later --no-update step installs from the SAME index (the second mirror\'s list kept for the job)');
    const log2 = path.join(path.dirname(once), 'argv2.log');
    fs.writeFileSync(log2, 'an earlier call\n'); // the stub stalls only on its log's first line: this time the runner's mirror answers
    const fresh = spawnSync('bash', [path.join(REPO, 'scripts', 'ci-apt.sh'), 'dtach'], { encoding: 'utf-8', env: { ...env, APT_STUB_LOG: log2 } });
    const c3 = fs.readFileSync(log2, 'utf-8').trim().split('\n').slice(1);
    ok(fresh.status === 0 && c3.length === 2 && !fs.existsSync(aptState) && !c3.some((l) => l.includes('sourcelist')) && !/second mirror/.test(fresh.stdout),
      'an update that the runner\'s mirror answers clears an earlier job\'s second-mirror list (the index is decided anew)'); }
  }
  // THE TWIN ITSELF (B-54a9, 主开发 r2572 (2)): a HEAVY row that runs this whole file at depth
  { const twin = SUITES.find((r) => r.name === 'test-ci-gate-deep'); let src = ''; try { src = fs.readFileSync(path.join(REPO, 'scripts', 'test-ci-gate-deep.mjs'), 'utf8'); } catch { /* none */ }
    ok(!!twin && twin.tier === 'heavy' && /\nprocess\.env\.CI_GATE_DEEP = '1';\nawait import\('\.\/test-ci-gate\.mjs'\);\n/.test(src) && ['scripts/ci-apt.sh', 'scripts/egress-sampler.cjs'].every((f) => (twin.reads || []).includes(f)),
      `the heavy twin test-ci-gate-deep exists (a HEAVY row reading scripts/ci-apt.sh and scripts/egress-sampler.cjs) and runs this whole file with CI_GATE_DEEP=1 — §2f's stub legs and §2n's egress children run there`); }
}

// ── §2g AN INSTALL MAY BE RETRIED, A SUITE NEVER (lane ci-npm-retry, B-fa5e: .330's heavy 6/6 — run 39462417012 — died in
// `npm ci` on a registry reset mid-download, «npm error network read ECONNRESET», exit 152; npm's own fetch-retries
// covers a request only until its headers) ──
// Every npm install in every workflow goes through scripts/ci-npm.sh (3 fresh attempts, 20 s apart, a ::warning:: each);
// every job that runs scripts/ci.mjs installs through the door's `ci` form first; a step that names scripts/ci.mjs is
// ONE plain `node scripts/ci.mjs …` line, once per job — no loop, no `||`, no retry action, no second `if: failure()`
// run, no continue-on-error. Read line-based (no YAML parser in this tree — the lane read the same jobs / steps / run
// values with the `yaml` package); the controls are mutant copies of ci.yml.
console.log('\n§2g an install may be retried (scripts/ci-npm.sh), a suite never');
{
  const WF_DIR = path.join(REPO, '.github', 'workflows');
  // B-28b1: the claude install names the tree's pin by its ONE reader — since r1682 READ IN ITS OWN ASSIGNMENT,
  // `pin="$(node scripts/ci-claude.mjs pin)" && bash scripts/ci-npm.sh install -g "@anthropic-ai/claude-code@$pin"`: the door's one form
  // with a command in it. The read INSIDE an argument (`…@$(node scripts/ci-claude.mjs pin)`) is RED by name: a failed read does not
  // stop the step, and npm installs the registry's newest under the pin's name.
  const DOOR = /^(?:bash scripts\/ci-npm\.sh (?:ci|install -g(?: [@\w./-]+)+)|pin="\$\(node scripts\/ci-claude\.mjs pin\)" && bash scripts\/ci-npm\.sh install -g "@anthropic-ai\/claude-code@\$pin")$/;
  const PIN_IN_ARG = /(?<!\bpin=")\$\(node scripts\/ci-claude\.mjs pin\)/;   // any read of the pin but its own assignment's
  const INSTALL = /\bnpm\s+(?:ci|i|install|add)\b/;
  const SUITE_LINE = /^node scripts\/ci\.mjs(?: [^;&|<>`()\n]*)?$/;
  const verdictOf = (files) => {
    const bad = [];
    let doorSteps = 0, suiteSteps = 0;
    for (const [name, text] of files) {
      for (const [k, steps] of jobsOf(text).entries()) {
        let ciAt = -1, suites = 0;
        for (const [s, st] of steps.entries()) {
          const run = st.run ?? '';
          if (PIN_IN_ARG.test(run)) bad.push(`${name} job ${k + 1}: the pin read inside an argument (a failed read installs the registry's newest): ${run.split('\n')[0].trim()}`);
          if (DOOR.test(run)) { doorSteps++; if (/ ci$/.test(run) && ciAt < 0) ciAt = s; } else if (INSTALL.test(st.text)) bad.push(`${name} job ${k + 1}: an install outside the door: ${(st.run ?? st.text).split('\n')[0].trim()}`);
          if (!/scripts\/ci\.mjs/.test(st.text)) continue;
          suites++; suiteSteps++;
          const bare = run.replace(/\$\{\{[^}]*\}\}/g, 'X');
          if (st.uses || st.cont || !SUITE_LINE.test(bare)) bad.push(`${name} job ${k + 1}: a suite step that is not ONE plain line: ${st.text.trim().split('\n').map((l) => l.trim()).join(' ⏎ ')}`);
          if (ciAt < 0) bad.push(`${name} job ${k + 1}: scripts/ci.mjs with no \`scripts/ci-npm.sh ci\` before it`);
        }
        if (suites > 1) bad.push(`${name} job ${k + 1}: scripts/ci.mjs runs in ${suites} steps (a second run is a retry)`);
      }
    }
    return { bad, doorSteps, suiteSteps };
  };
  const files = fs.readdirSync(WF_DIR).filter((f) => /\.ya?ml$/.test(f)).sort().map((f) => [f, fs.readFileSync(path.join(WF_DIR, f), 'utf-8')]);
  const v = verdictOf(files);
  ok(files.length >= 3 && files.reduce((n, [, t]) => n + jobsOf(t).length, 0) >= 4, `the walk reads every workflow (${files.map(([f]) => f).join(', ')}) and every job's steps`);
  okd(!v.bad.length && v.doorSteps === 5 && v.suiteSteps === 2,
    `every npm install goes through scripts/ci-npm.sh (${v.doorSteps} steps: the pinned claude CLI + npm ci in fast and heavy, and the look-ahead's newest — B-28b1) and both scripts/ci.mjs steps are one plain line, once per job, after the door's npm ci (${v.suiteSteps})`, v.bad.join('\n'));
  // the controls: mutant copies of ci.yml, each RED for its own reason
  const ci = files.find(([f]) => f === 'ci.yml')[1];
  const FAST_RUN = '      - run: node scripts/ci.mjs --fast-part=${{ matrix.part }}/2 --keep-going\n', HEAVY_RUN = /( {6}- run: )(node scripts\/ci\.mjs --heavy [^\n]*)/;
  const MUTANTS = [
    ['the fast job\'s npm ci bare again', (t) => t.replace('run: bash scripts/ci-npm.sh ci', 'run: npm ci'), /an install outside the door: npm ci$/m],
    ['the claude CLI installed bare', (t) => t.replace('run: bash scripts/ci-npm.sh install -g', 'run: npm i -g'), /an install outside the door: npm i -g @anthropic-ai\/claude-code/],
    // stale-pins: kept — the 96a0db36d form of the pin step, rebuilt for this control (r1682)
    ['the pin read inside an argument (the 96a0db36d form)', (t) => t.replace('run: pin="$(node scripts/ci-claude.mjs pin)" && bash scripts/ci-npm.sh install -g "@anthropic-ai/claude-code@$pin"', 'run: bash scripts/ci-npm.sh install -g @anthropic-ai/claude-code@$(node scripts/ci-claude.mjs pin)'), /the pin read inside an argument \(a failed read installs the registry's newest\): bash scripts\/ci-npm\.sh install -g @anthropic-ai\/claude-code@\$\(node/],
    ['an `npm install` fallback after the door', (t) => t.replace('run: bash scripts/ci-npm.sh ci', 'run: bash scripts/ci-npm.sh ci || npm install'), /an install outside the door: bash scripts\/ci-npm\.sh ci \|\| npm install/],
    ['ci.mjs in a for loop', (t) => t.replace(FAST_RUN, '      - run: for i in 1 2 3; do node scripts/ci.mjs && break; sleep 20; done\n'), /not ONE plain line: run: for i in 1 2 3/],
    ['the heavy shard run twice by ||', (t) => t.replace(HEAVY_RUN, '$1$2 || $2'), /not ONE plain line: run: node scripts\/ci\.mjs --heavy .* \|\| node/],
    ['an until loop in a run block', (t) => t.replace(FAST_RUN, '      - run: |\n          until node scripts/ci.mjs; do sleep 20; done\n'), /not ONE plain line: run: \| ⏎ until node scripts\/ci\.mjs/],
    ['a retry action around ci.mjs', (t) => t.replace(FAST_RUN, '      - uses: nick-fields/retry@v3\n        with:\n          max_attempts: 3\n          command: node scripts/ci.mjs\n'), /not ONE plain line: uses: nick-fields\/retry@v3/],
    ['a second ci.mjs step if: failure()', (t) => t.replace(FAST_RUN, FAST_RUN + '        env:\n          VIBESPACE_CI_OAT: x\n      - if: failure()\n        run: node scripts/ci.mjs\n'), /job 1: scripts\/ci\.mjs runs in 2 steps/],
    ['continue-on-error on the suite step', (t) => t.replace(FAST_RUN, FAST_RUN + '        continue-on-error: true\n'), /not ONE plain line: run: node scripts\/ci\.mjs --fast-part=\$\{\{ matrix\.part \}\}\/2 --keep-going ⏎ continue-on-error: true/],
    ['ci.mjs handed to the door', (t) => t.replace(FAST_RUN, '      - run: bash scripts/ci-npm.sh node scripts/ci.mjs\n'), /not ONE plain line: run: bash scripts\/ci-npm\.sh node scripts\/ci\.mjs/],
    ['the door\'s npm ci moved after ci.mjs', (t) => t.replace(/( {6}- name: npm ci \(3 attempts on a registry blip\)\n(?: {8}.*\n)+)( {6}- run: node scripts\/ci\.mjs --fast-part=[^\n]*\n)/, '$2$1'), /job 1: scripts\/ci\.mjs with no `scripts\/ci-npm\.sh ci` before it/],
  ];
  const reds = MUTANTS.map(([label, edit, why]) => {
    const t = edit(ci), mv = verdictOf(files.map(([f, x]) => [f, f === 'ci.yml' ? t : x]));
    return { label, applied: t !== ci, red: mv.bad.some((b) => why.test(b)), bad: mv.bad };
  });
  const missed = reds.filter((r) => !r.applied || !r.red);
  okd(!missed.length, `CONTROL: ${reds.length} mutant copies of ci.yml each go RED for their own reason (${reds.map((r) => r.label).join(' · ')})`,
    missed.map((r) => `${r.label}: ${r.applied ? 'GREEN — ' + JSON.stringify(r.bad) : 'the edit did not apply'}`).join('\n'));

  // THE DOOR ITSELF over a stub npm + a stub sleep (each records its argv): attempts, the pause, the exit code, the refusals
  const dir = mktmp('npm'), bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'npm'), '#!/bin/bash\necho "$*" >> "$STUB/npm.log"\nn=$(( $(cat "$STUB/n" 2>/dev/null || echo 0) + 1 )); echo $n > "$STUB/n"\nif [ "$n" -le "${STUB_FAILS:-0}" ]; then echo "npm error network read ECONNRESET" >&2; exit "${STUB_CODE:-152}"; fi\n', { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'sleep'), '#!/bin/bash\necho "$*" >> "$STUB/sleep.log"\n', { mode: 0o755 });
  const door = (args, fails, code) => {
    for (const f of ['npm.log', 'sleep.log', 'n']) fs.rmSync(path.join(dir, f), { force: true });
    const r = spawnSync('bash', [path.join(REPO, 'scripts', 'ci-npm.sh'), ...args], { encoding: 'utf-8', env: { PATH: `${bin}:${process.env.PATH}`, STUB: dir, STUB_FAILS: String(fails), STUB_CODE: String(code ?? 152) } });
    const rd = (f) => { try { return fs.readFileSync(path.join(dir, f), 'utf-8').trim().split('\n').filter(Boolean); } catch { return []; } };
    return { status: r.status, out: r.stdout + r.stderr, npm: rd('npm.log'), sleep: rd('sleep.log') };
  };
  const KNOBS = '--fetch-retries=5 --fetch-retry-mintimeout=2000 --fetch-retry-maxtimeout=60000';
  const twoBlips = door(['ci'], 2);
  okd(twoBlips.status === 0 && twoBlips.npm.length === 3 && twoBlips.npm.every((a) => a === `ci ${KNOBS}`) && twoBlips.sleep.join() === '20,20'
    && ['1/3', '2/3', '3/3'].every((n) => twoBlips.out.includes(`install attempt ${n}: npm ci ${KNOBS}`)) && (twoBlips.out.match(/^::warning::install attempt [12]\/3 failed \(npm exit 152\)/gm) || []).length === 2,
  'two blips then a clean install: three FRESH `npm ci` (npm\'s fetch-retry knobs on each, never an `npm install`), «install attempt N/3», a 20 s pause and a ::warning:: between, green', twoBlips.out);
  const down = door(['ci'], 9);
  okd(down.status === 152 && down.npm.length === 3 && down.sleep.join() === '20,20' && /^::error::install failed 3 times \(npm exit 152\)/m.test(down.out),
    `a registry that stays down: exactly 3 attempts, no pause after the third, the step RED with npm's own exit code (${down.status})`, down.out);
  const clean = door(['ci'], 0), other = door(['ci'], 9, 1);
  ok(clean.status === 0 && clean.npm.length === 1 && !clean.sleep.length && other.status === 1, 'a clean install is one attempt and no pause; npm\'s exit code is the step\'s (1 stays 1)');
  const cli = door(['install', '-g', '@anthropic-ai/claude-code'], 1);
  okd(cli.status === 0 && cli.npm.length === 2 && cli.npm.every((a) => a === `install -g ${KNOBS} @anthropic-ai/claude-code`), 'the claude CLI\'s global install takes the same door', cli.npm.join(' | '));
  const refused = [[], ['install'], ['install', '-g'], ['ci', '--legacy-peer-deps'], ['i'], ['node', 'scripts/ci.mjs']].map((a) => ({ a, r: door(a, 0) }));
  ok(refused.every(({ r }) => r.status === 2 && !r.npm.length && /usage: ci-npm\.sh ci \| install -g/.test(r.out)),
    `the door runs only \`npm ci\` or a global install — a local \`npm install\`, extra flags or anything else is refused before npm runs (${refused.map(({ a, r }) => `[${a.join(' ')}] ${r.status}`).join(', ')})`);
}
// ── §2h EVERY SETUP STEP IS BOUNDED, THE FONTS HAVE ONE ROAD (lane ci-cjk-fonts, 2.369.346: .345's master mirror was
// CANCELLED at 45 min — heavy 4/6 sat 21 min in `apt install fonts-noto-cjk`, the azure mirror serving 61 MB at 45.8 kB/s,
// and 4 of the branch run's 6 shards spent 11–21 min there) ──
// Every ci.yml job carries its own timeout-minutes and every step but its suite step one under it (the suite step's
// bound is its job's): a stall is a red that names its step. The heavy tier's zh / ja fonts come from ONE road — ONE plain
// `bash scripts/ci-fonts.sh --system` step, bounded ≤ 6 min, an actions/cache of its dir in front keyed on that file (the
// pins), a stalled restore a miss — and never from apt, in any step, in any form (no fallback: a second road hides the
// first one's failure). ci-fonts.sh pins its tag and a sha256 per file, bounds curl, and is run here over a fixture (a
// file:// base serving the wrong bytes: red by name, nothing installed). The controls are mutant copies of both files.
console.log('\n§2h every setup step is bounded; the fonts have one road (scripts/ci-fonts.sh, cached, pinned)');
{
  const FONTS_SH = path.join(REPO, 'scripts', 'ci-fonts.sh'), CACHE_DIR = '~/.local/share/fonts/noto-cjk';
  const verdictOf = (yml, sh) => {
    const bad = [], jobs = jobsOf(yml);
    let bounded = 0, roads = 0;
    for (const steps of jobs) {
      if (!(steps.bound > 0)) bad.push(`job ${steps.job}: no timeout-minutes of its own`);
      for (const st of steps) {
        if (/fonts-noto-cjk/.test(st.run || '')) bad.push(`job ${steps.job}: fonts through apt: ${st.run.split('\n')[0]}`);
        if (/scripts\/ci\.mjs/.test(st.text)) continue; // the suite step: its job's bound is its bound
        if (!(st.bound > 0)) bad.push(`job ${steps.job}: «${st.label}» has no timeout-minutes`);
        else if (st.bound >= steps.bound) bad.push(`job ${steps.job}: «${st.label}» is bounded at ${st.bound}, not under its job's ${steps.bound}`);
        else bounded++;
      }
      const suite = steps.findIndex((st) => /^node scripts\/ci\.mjs --heavy\b/.test(st.run || ''));
      if (suite < 0) continue; // only the heavy tier drives the chrome suites that measure zh / ja text
      const road = steps.findIndex((st) => /scripts\/ci-fonts\.sh/.test(st.run || ''));
      if (road < 0) { bad.push(`job ${steps.job}: runs the heavy tier with no scripts/ci-fonts.sh step`); continue; }
      roads++;
      const r = steps[road], cache = steps.findIndex((st) => /^actions\/cache@v\d+$/.test(st.action || '') && new RegExp(`^\\s*path:\\s*${CACHE_DIR.replace(/[.]/g, '\\.')}\\s*$`, 'm').test(st.text));
      if (r.run !== 'bash scripts/ci-fonts.sh --system' || r.cont || r.uses) bad.push(`job ${steps.job}: the fonts step is not ONE plain \`bash scripts/ci-fonts.sh --system\`: ${r.text.split('\n').map((l) => l.trim()).join(' ⏎ ')}`);
      if (!(r.bound > 0 && r.bound <= 6)) bad.push(`job ${steps.job}: the fonts step's bound is ${r.bound} (≤ 6 min)`);
      if (road > suite) bad.push(`job ${steps.job}: the fonts step runs after the suites`);
      if (cache < 0) { bad.push(`job ${steps.job}: no actions/cache of ${CACHE_DIR} in front of the fonts step`); continue; }
      const c = steps[cache], key = (/^\s*key:\s*(.+)$/m.exec(c.text) || [])[1] || '', seg = Number((/SEGMENT_DOWNLOAD_TIMEOUT_MINS:\s*(\d+)/.exec(c.text) || [])[1]);
      if (cache > road) bad.push(`job ${steps.job}: the fonts cache comes after the fonts step`);
      if (!key.includes("hashFiles('scripts/ci-fonts.sh')")) bad.push(`job ${steps.job}: the fonts cache is not keyed on scripts/ci-fonts.sh (the pins): key ${key}`);
      if (/^\s*restore-keys:/m.test(c.text)) bad.push(`job ${steps.job}: the fonts cache has restore-keys (another pin set's files)`);
      if (!(seg > 0 && seg < c.bound)) bad.push(`job ${steps.job}: a stalled fonts-cache restore is no miss before the step's bound (SEGMENT_DOWNLOAD_TIMEOUT_MINS ${seg || 'unset'}, bound ${c.bound})`);
    }
    if (!roads) bad.push('no job takes the fonts road');
    // ci-fonts.sh: a tag, a 64-hex sha256 on every PINS entry (the two Sans TTCs at least), curl bounded, no apt anywhere
    const code = sh.replace(/^\s*#.*$/gm, '');
    const tag = (/^TAG=(\S+)$/m.exec(code) || [])[1];
    const entries = ((/^PINS=\(\n([\s\S]*?)\n\)$/m.exec(code) || [])[1] || '').split('\n').filter((l) => l.trim());
    const pins = entries.map((l) => /^\s*'([0-9a-f]{64}) ((?:Sans|Serif)\/OTC\/Noto(?:Sans|Serif)CJK-(?:Regular|Bold)\.ttc)'$/.exec(l)).filter(Boolean).map((m) => m[2]);
    if (!tag) bad.push('ci-fonts.sh pins no tag');
    for (const f of ['Sans/OTC/NotoSansCJK-Regular.ttc', 'Sans/OTC/NotoSansCJK-Bold.ttc']) if (!pins.includes(f)) bad.push(`ci-fonts.sh pins no sha256 for ${f}`);
    if (entries.length !== pins.length) bad.push(`ci-fonts.sh: ${entries.length - pins.length} PINS entr${entries.length - pins.length === 1 ? 'y' : 'ies'} without a 64-hex sha256`);
    if (!/\bBASE=\$\{CI_FONTS_BASE:-https:\/\/raw\.githubusercontent\.com\/notofonts\/noto-cjk\/\$TAG\}/.test(code)) bad.push('ci-fonts.sh does not fetch from the pinned tag');
    if (!/^dir=\$\{CI_FONTS_DIR:-\$HOME\/\.local\/share\/fonts\/noto-cjk\}$/m.test(code)) bad.push(`ci-fonts.sh installs somewhere the cache (${CACHE_DIR}) does not keep`);
    if (!/curl [^\n]*--retry 5 [^\n]*--max-time \d+/.test(code)) bad.push('ci-fonts.sh: curl is not bounded (--retry 5 … --max-time)');
    if (/\bapt(?:-get)?\b|ci-apt/.test(code)) bad.push('ci-fonts.sh: an apt road inside the fonts road');
    return { bad, bounded, roads, pins, tag };
  };
  const yml = fs.readFileSync(path.join(REPO, '.github', 'workflows', 'ci.yml'), 'utf-8'), sh = fs.readFileSync(FONTS_SH, 'utf-8');
  const v = verdictOf(yml, sh);
  okd(!v.bad.length && v.bounded >= 14 && v.roads === 1 && v.pins.length === 4,
    `every ci.yml job and every setup step is bounded (${v.bounded} steps; the 2 suite steps by their job), the heavy job takes ONE fonts road — a cache keyed on scripts/ci-fonts.sh in front, ≤ 6 min, no apt — and ci-fonts.sh pins ${v.tag} + a sha256 per file (${v.pins.length})`, v.bad.join('\n'));
  // the controls: mutant copies of ci.yml and ci-fonts.sh, each RED for its own reason
  const FONTS_RUN = '        run: bash scripts/ci-fonts.sh --system\n';
  const STEP = (head) => `( {6}- name: ${head}[^\\n]*\\n(?: {8}.*\\n)+)`;
  const MUTANTS = [
    ['the fonts back on apt', 'yml', (t) => t.replace('run: bash scripts/ci-fonts.sh --system', 'run: bash scripts/ci-apt.sh --no-update fonts-noto-cjk'), /fonts through apt: bash scripts\/ci-apt\.sh --no-update fonts-noto-cjk/],
    ['an apt fallback after the road', 'yml', (t) => t.replace('run: bash scripts/ci-fonts.sh --system', 'run: bash scripts/ci-fonts.sh --system || bash scripts/ci-apt.sh fonts-noto-cjk'), /fonts through apt: bash scripts\/ci-fonts\.sh --system \|\| bash scripts\/ci-apt\.sh fonts-noto-cjk/],
    ['the road without --system (one HOME\'s fonts)', 'yml', (t) => t.replace(FONTS_RUN, '        run: bash scripts/ci-fonts.sh\n'), /the fonts step is not ONE plain `bash scripts\/ci-fonts\.sh --system`: name: Install CJK fonts .* ⏎ run: bash scripts\/ci-fonts\.sh ⏎/],
    ['the road continue-on-error', 'yml', (t) => t.replace(FONTS_RUN, FONTS_RUN + '        continue-on-error: true\n'), /the fonts step is not ONE plain .* ⏎ continue-on-error: true/],
    ['the cache step gone', 'yml', (t) => t.replace(new RegExp(STEP('Cache the pinned CJK fonts')), ''), /no actions\/cache of ~\/\.local\/share\/fonts\/noto-cjk in front of the fonts step/],
    ['the cache after the road', 'yml', (t) => t.replace(new RegExp(STEP('Cache the pinned CJK fonts') + STEP('Install CJK fonts')), '$2$1'), /the fonts cache comes after the fonts step/],
    ['the cache keyed on a constant', 'yml', (t) => t.replace("key: noto-cjk-${{ hashFiles('scripts/ci-fonts.sh') }}", 'key: noto-cjk-v1'), /the fonts cache is not keyed on scripts\/ci-fonts\.sh \(the pins\): key noto-cjk-v1/],
    ['restore-keys on the cache', 'yml', (t) => t.replace("          key: noto-cjk-${{ hashFiles('scripts/ci-fonts.sh') }}\n", "          key: noto-cjk-${{ hashFiles('scripts/ci-fonts.sh') }}\n          restore-keys: noto-cjk-\n"), /the fonts cache has restore-keys/],
    ['a cache restore that may stall to its bound', 'yml', (t) => t.replace(new RegExp(STEP('Cache the pinned CJK fonts')), (m) => m.replace('          SEGMENT_DOWNLOAD_TIMEOUT_MINS: 2\n', '')), /a stalled fonts-cache restore is no miss .*unset/],   // the FONTS cache's line (int365 seam: the fast job's gh cache, earlier in the file, carries the same line)
    ['the fonts step unbounded', 'yml', (t) => t.replace(FONTS_RUN + '        timeout-minutes: 6\n', FONTS_RUN), /job heavy-shards: «Install CJK fonts [^»]*» has no timeout-minutes/],
    ['the fonts step bounded at 30', 'yml', (t) => t.replace(FONTS_RUN + '        timeout-minutes: 6\n', FONTS_RUN + '        timeout-minutes: 30\n'), /the fonts step's bound is 30 \(≤ 6 min\)/],
    ['dtach unbounded', 'yml', (t) => t.replace(/        run: bash scripts\/ci-apt\.sh dtach\n( {8}#[^\n]*\n)?        timeout-minutes: 7\n/, '        run: bash scripts/ci-apt.sh dtach\n'), /job fast: «Install dtach [^»]*» has no timeout-minutes/],
    ['checkout unbounded', 'yml', (t) => t.replace('      - uses: actions/checkout@v4\n        timeout-minutes: 3\n', '      - uses: actions/checkout@v4\n'), /job fast: «actions\/checkout@v4» has no timeout-minutes/],
    // (2.369.408's heavy-shards seam: the job's limit 45 → 60 — this mutant sets npm ci's bound to THE JOB'S, so it follows the job's number)
    ['npm ci bounded at the job\'s 60', 'yml', (t) => t.replace(/(run: bash scripts\/ci-npm\.sh ci\n {8}timeout-minutes: )6\n([\s\S]*run: bash scripts\/ci-npm\.sh ci\n {8}timeout-minutes: )6\n/, '$16\n$260\n'), /job heavy-shards: «npm ci \(3 attempts on a registry blip\)» is bounded at 60, not under its job's 60/],
    ['a job with no bound of its own', 'yml', (t) => t.replace('    timeout-minutes: 5\n    steps:', '    steps:'), /job heavy: no timeout-minutes of its own/],
    ['a Sans pin dropped', 'sh', (t) => t.replace(/^ {2}'[0-9a-f]{64} Sans\/OTC\/NotoSansCJK-Bold\.ttc'\n/m, ''), /ci-fonts\.sh pins no sha256 for Sans\/OTC\/NotoSansCJK-Bold\.ttc/],
    ['a pin without its sha256', 'sh', (t) => t.replace(/'[0-9a-f]{64} (Serif\/OTC\/NotoSerifCJK-Bold\.ttc)'/, "'$1'"), /ci-fonts\.sh: 1 PINS entry without a 64-hex sha256/],
    ['the tag unpinned (a branch)', 'sh', (t) => t.replace('/notofonts/noto-cjk/$TAG}', '/notofonts/noto-cjk/main}'), /ci-fonts\.sh does not fetch from the pinned tag/],
    ['curl unbounded', 'sh', (t) => t.replace(/ --max-time \d+/, ''), /ci-fonts\.sh: curl is not bounded/],
    ['an apt fallback inside the script', 'sh', (t) => t.replace('  mv -f "$f.part" "$f"\n', '  mv -f "$f.part" "$f"\n  bash scripts/ci-apt.sh --no-update fonts-noto-cjk || true\n'), /ci-fonts\.sh: an apt road inside the fonts road/],
  ];
  const reds = MUTANTS.map(([label, which, edit, why]) => {
    const t = edit(which === 'yml' ? yml : sh), mv = which === 'yml' ? verdictOf(t, sh) : verdictOf(yml, t);
    return { label, applied: t !== (which === 'yml' ? yml : sh), red: mv.bad.some((b) => why.test(b)), bad: mv.bad };
  });
  const missed = reds.filter((r) => !r.applied || !r.red);
  okd(!missed.length, `CONTROL: ${reds.length} mutant copies of ci.yml / ci-fonts.sh each go RED for their own reason (${reds.map((r) => r.label).join(' · ')})`,
    missed.map((r) => `${r.label}: ${r.applied ? 'GREEN — ' + JSON.stringify(r.bad) : 'the edit did not apply'}`).join('\n'));
  // THE ROAD ITSELF over a fixture: a file:// base that serves the wrong bytes under the pinned name, a cached file from
  // another pin set — the cached one is refetched, the fetched one fails its sha256: red BY NAME, nothing unverified installed
  const fx = mktmp('fonts'), base = path.join(fx, 'base'), dest = path.join(fx, 'dest');
  fs.mkdirSync(path.join(base, 'Sans', 'OTC'), { recursive: true });
  fs.mkdirSync(dest);
  const WRONG = 'not the pinned font\n', STALE = 'a cached file of another pin set\n';
  fs.writeFileSync(path.join(base, 'Sans', 'OTC', 'NotoSansCJK-Regular.ttc'), WRONG);
  fs.writeFileSync(path.join(dest, 'NotoSansCJK-Regular.ttc'), STALE);
  const road = (args) => spawnSync('bash', [FONTS_SH, ...args], { encoding: 'utf-8', env: { PATH: process.env.PATH, HOME: fx, CI_FONTS_BASE: `file://${base}`, CI_FONTS_DIR: dest, CI_FONTS_SUDO: '', CI_FONTS_CONF: path.join(fx, 'conf') } });
  const wrong = road(['--system']), sha = crypto.createHash('sha256').update(WRONG).digest('hex'), pin = sh.match(/'([0-9a-f]{64}) Sans\/OTC\/NotoSansCJK-Regular\.ttc'/)?.[1];
  okd(wrong.status === 1 && /^::warning::ci-fonts: the cached NotoSansCJK-Regular\.ttc is not the pinned file — fetching it again$/m.test(wrong.stdout)
    && wrong.stderr.includes(`::error::ci-fonts: NotoSansCJK-Regular.ttc sha256 ${sha}, pinned ${pin} (`)
    && fs.readdirSync(dest).join() === 'NotoSansCJK-Regular.ttc' && fs.readFileSync(path.join(dest, 'NotoSansCJK-Regular.ttc'), 'utf-8') === STALE && !fs.existsSync(path.join(fx, 'conf')),
  'the wrong bytes under a pinned name: a red naming the file, its sha256 and the pin — nothing installed, no .part left, no fontconfig registered', wrong.stdout + wrong.stderr);
  const refused = [['--user'], ['--system', 'x'], ['x']].map((a) => ({ a, r: road(a) }));
  ok(refused.every(({ r }) => r.status === 2 && /usage: ci-fonts\.sh \[--system\]/.test(r.stderr)), `the road takes only [--system] (${refused.map(({ a, r }) => `[${a.join(' ')}] ${r.status}`).join(', ')})`);
}

// ── §2i A RED NAMES ITS LEGS (lane ci-mirror-hygiene, 2.369.362: 2.369.361's mirror fast job printed «test-pool-auto
// 4 FAILED (667 passed)» and no leg — its ✗ lines sat above the 40 lines a row keeps, the fast job uploaded nothing, and
// the cause, the depth-1 clone, took an hour of guessing) ──
// A red suite's ✗ entry carries every ✗ line of its output BEFORE the tail (≤ FAIL_LINES_MAX, the count said), inside
// lines[0] like the hang digest — lines[1] / lines[2] stay the tail / stderr the rerun ledger reads; the fast tier keeps
// the red suite's whole output in FAST_FAIL_LOGS and ci.yml's fast job uploads it: after the suites, failure only, the
// heavy shards' retention (§2h bounds it). Planted suites run for real through runSuiteAsync; the workflow is read with
// §2h's parser and its controls are mutant copies of ci.yml.
console.log('\n§2i a red names its legs: every ✗ line before the tail; the fast job ships its fail logs');
{
  const CI = await import('./ci.mjs');
  const root = mktmp('legs'), sha = 'c0ffee0123456789';
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  const say = (lines) => lines.map((l) => `console.log(${JSON.stringify(l)});`).join('\n') + '\nprocess.exit(1);\n';
  const ticks = (n, tag) => Array.from({ length: n }, (_, i) => `  ✓ ${tag} ${i + 1}`);
  const N = CI.FAIL_LINES_MAX + 5;
  // the runner's shape (one ✗ far above the 40-line tail, one inside it); more ✗ lines than the bound; a crash with none
  fs.writeFileSync(path.join(root, 'scripts', 'test-planted-legs.mjs'), say(['§1 planted', '  ✗ leg one — far above the tail', ...ticks(60, 'a'), '  ✗ leg two — inside the tail', ...ticks(5, 'b'), '', '2 FAILED']));
  fs.writeFileSync(path.join(root, 'scripts', 'test-planted-many.mjs'), say([...Array.from({ length: N }, (_, i) => `  ✗ leg ${i + 1}`), '', `${N} FAILED`]));
  fs.writeFileSync(path.join(root, 'scripts', 'test-planted-crash.mjs'), "console.log('§1 planted');\nthrow new Error('planted: no verdict');\n");
  const [legs, many, crash] = await Promise.all(['test-planted-legs', 'test-planted-many', 'test-planted-crash'].map((name, i) => CI.runSuiteAsync({ name, tier: 'fast', budgetMs: 8000 }, { root, sha, lane: i + 1 })));
  const head = legs.lines[0];
  okd(!legs.ok && !legs.lines[1].includes('leg one') && legs.lines[1].includes('  ✗ leg two'), 'PREMISE: the 40-line tail alone names leg two and NOT leg one (2.369.361\'s row)', legs.lines[1]);
  okd(/\n {2}\[ci\] its ✗ lines: 2 \(/.test(head) && head.endsWith('\n  ✗ leg one — far above the tail\n  ✗ leg two — inside the tail'),
    'a red suite\'s ✗ entry says its ✗ lines (2) and prints every one, in its order, before the tail', head);
  okd(legs.lines[1].includes('2 FAILED') && !/\[ci\] its ✗ lines/.test(legs.lines[1] + legs.lines[2]), 'lines[1] / lines[2] stay the tail / stderr the rerun ledger reads', legs.lines[1]);
  const mh = many.lines[0];
  okd(mh.includes(`[ci] its ✗ lines: ${N} — the first ${CI.FAIL_LINES_MAX} (`) && mh.includes(`\n  ✗ leg ${CI.FAIL_LINES_MAX}\n`) && !mh.includes(`  ✗ leg ${CI.FAIL_LINES_MAX + 1}`) && mh.endsWith(`\n  [ci] … ${N - CI.FAIL_LINES_MAX} more ✗ line(s) not shown`),
    `bounded: ${N} ✗ lines ⇒ the first ${CI.FAIL_LINES_MAX} + «${N - CI.FAIL_LINES_MAX} more», the count said`, mh);
  okd(!crash.ok && crash.lines[0].trim().split('\n').length === 1, 'a red with no ✗ line (a crash) adds nothing to its row — the tail and stderr are what it has', crash.lines[0]);
  // its whole output is kept where ci.yml uploads it from
  const dir = path.join(root, ...CI.FAST_FAIL_LOGS.split('/')), said = [];
  const f = CI.writeFailLog(dir, sha, { name: 'test-planted-legs' }, legs, 1, { log: (l) => said.push(l) });
  okd(f === path.join(dir, 'c0ffee01.test-planted-legs.1.log') && fs.readFileSync(f, 'utf-8') === legs.full && legs.full.includes('leg one') && said.join('\n') === `  [ci] the whole output of test-planted-legs (try 1): ${f}` && CI.writeFailLog(dir, sha, { name: 'test-planted-green' }, { ok: true }, 1, { log: () => {} }) === null,
    `its whole output is kept: ${CI.FAST_FAIL_LOGS}/<sha8>.<suite>.<try>.log, said on its own line (a green suite keeps none)`, f);
  // B-c327: a fail-log dir is BOUNDED — the newest FAIL_LOGS_KEEP commits' files stay (a commit's newest file dates it), the
  // older commits' go, a name that is not the runner's own is never touched
  {
    const pd = mktmp('prune'), T0 = Date.now() / 1000 - 3600, K = CI.FAIL_LOGS_KEEP;
    const put = (n, age) => { fs.writeFileSync(path.join(pd, n), 'x'); fs.utimesSync(path.join(pd, n), T0 + age, T0 + age); };
    const shaOf = (i) => (0xa0000000 + i).toString(16);
    for (let i = 0; i < K + 3; i++) put(`${shaOf(i)}.test-planted.1.log`, i * 10);
    put(`${shaOf(1)}.test-planted.2.log`, 1000); put(`${shaOf(1)}.test-planted.2.hang.json`, 1000); // an old commit's newer try: the commit is new
    put('nosha.test-planted.1.hang.json', -500); put('README', -900); fs.mkdirSync(path.join(pd, `${shaOf(0)}.dir.1.log`));
    const gone = CI.pruneFailLogs(pd).map((f) => path.basename(f)).sort();
    const left = fs.readdirSync(pd);
    okd(gone.join(',') === [`${shaOf(0)}.test-planted.1.log`, `${shaOf(2)}.test-planted.1.log`, `${shaOf(3)}.test-planted.1.log`, 'nosha.test-planted.1.hang.json'].sort().join(',')
      && left.includes(`${shaOf(1)}.test-planted.1.log`) && left.includes(`${shaOf(1)}.test-planted.2.hang.json`) && left.includes('README') && left.includes(`${shaOf(0)}.dir.1.log`) && left.length === K + 2 + 2,
      `pruneFailLogs keeps the newest ${K} commits' files (an old commit with a newer try stays whole), removes the rest, never a name that is not the runner's (README, a directory)`, { gone, left: left.length });
    okd(CI.pruneFailLogs(path.join(pd, 'none')).length === 0 && CI.pruneFailLogs(pd).length === 0, '…a dir that does not exist prunes nothing, and a second prune finds nothing more', gone);
  }
  // B-3bbe: the RERUN LEDGERS are bounded too — appendRerun appends, then keeps the newest RERUNS_KEEP commits' lines (a commit
  // dated by its newest line), a no-sha line one group, a line not the ledger's own never touched; CONTROL: a copy without the
  // bound (the release's plain append) keeps every commit
  {
    const K = CI.RERUNS_KEEP, sh = (i) => (0xb0000000 + i).toString(16);
    const L = (i, suite = 'test-rr-a') => JSON.stringify({ sha: sh(i), host: 'h', suite, lane: '1' });
    const plant = (f) => { const ls = []; for (let i = 0; i < K + 4; i++) { ls.push(L(i)); if (i === 2) ls.push('a hand note, not the ledger\'s own'); } ls.push(L(1, 'test-rr-late')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, ls.join('\n') + '\n'); };
    const rec = { sha: 'c0ffee00', host: 'h', suite: 'test-rr-new', lane: '2' };
    const commitsIn = (f) => new Set(fs.readFileSync(f, 'utf-8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l).sha; } catch { return null; } }).filter(Boolean));
    const f = path.join(mktmp('reruns'), 'data', 'reruns.jsonl'); plant(f);
    const removed = CI.appendRerun(f, rec);
    const left = fs.readFileSync(f, 'utf-8').split('\n').filter(Boolean), cs = commitsIn(f);
    okd(removed === 5 && cs.size === K && cs.has('c0ffee00') && cs.has(sh(1)) && ![0, 2, 3, 4, 5].some((i) => cs.has(sh(i))) && left.includes('a hand note, not the ledger\'s own') && left.filter((l) => l.includes(sh(1))).length === 2,
      `appendRerun keeps the newest ${K} commits' lines (an old commit re-run late stays whole), removes the rest, never a line that is not the ledger's own`, JSON.stringify({ removed, commits: cs.size }));
    okd(CI.appendRerun(f, { ...rec, sha: sh(K + 3) }) === 0 && commitsIn(f).size === K, '…a line of a commit already kept removes nothing', String(commitsIn(f).size));
    const fn = path.join(mktmp('reruns-nosha'), 'reruns.jsonl'); for (let i = 0; i < K + 2; i++) CI.appendRerun(fn, { sha: '', host: 'h', suite: 'test-rr-nosha', lane: '1' });
    okd(fs.readFileSync(fn, 'utf-8').split('\n').filter(Boolean).length === K + 2, '…lines with no sha are ONE group (nosha), kept whole while it is among the newest', 'nosha');
    const SRC0 = fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf-8');
    const MR = mutantCopies('ci-reruns-bound', REPO);
    const mut = await import(pathToFileURL(MR.write('scripts/ci.mjs', anchored(SRC0, '  return boundReruns(file, keep);\n', '  return 0;\n', 'B-3bbe: the bound cut'), 'no-bound', { esm: true })).href);
    const fm = path.join(mktmp('reruns-mut'), 'reruns.jsonl'); plant(fm);
    okd(mut.appendRerun(fm, rec) === 0 && commitsIn(fm).size === K + 5, `CONTROL: a copy of ci.mjs without the bound keeps every commit (${commitsIn(fm).size} > ${K}) — the leg above is red without the change`, String(commitsIn(fm).size));
    for (const c of copiesCensus(MR.files, MR.dir, REPO, { minCopies: 1, label: 'reruns bound: ' })) ok(c.pass, c.name, c.pass ? undefined : c.detail);
    ok(/if \(ledger\) \{ try \{ appendRerun\(ledger, rerunRecord\(\{ sha, suite: s\.name, lane, first: r, again \}\)\); \}/.test(SRC0)
      && /try \{ appendRerun\(path\.join\(d, 'reruns\.jsonl'\), line\); \}/.test(SRC0) && !/appendFileSync\(ledger/.test(SRC0) && !/appendFileSync\(path\.join\(d, 'reruns\.jsonl'\)/.test(SRC0),
      'WIRING: both tiers append their rerun lines through appendRerun (the fast ledger and <markers>/reruns.jsonl), no plain append left');
  }
  const SRC = fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf-8');
  ok(/\n {4}const pruned = pruneFailLogs\(hangDir\);/.test(SRC) && /\n {4}pruneMarkers\(dir\);\n {4}pruneFailLogs\(path\.join\(d, 'fail-logs'\)\);[^\n]*\n {4}return \{ noVerdict: '', file \};/.test(SRC),
    'WIRING: the fast tier prunes its fail-log dir before its lanes, the heavy tier its <markers>/fail-logs beside its markers (B-c327)');
  // B-6e71: the loop is runFastLanes now (keep-going) — fastGate hands it the dir, the loop keeps every red's output
  ok(/const hangDir = fastFailDir\(\);/.test(SRC) && /\n {6}lanes, keepGoing, inflight, failDir: hangDir, sha,/.test(SRC) && /\n {6}if \(r\.ok\) \{[^\n]*\n {6}if \(failDir\) writeFailLog\(failDir, sha, s, r, 1\);/.test(SRC),
    'WIRING: the fast tier keeps its red suite\'s whole output in FAST_FAIL_LOGS (its hang reports beside it)');
  // ci.yml: the fast job uploads FAST_FAIL_LOGS on a red, as the heavy shards upload theirs
  const uploadOf = (yml) => {
    const bad = [], jobs = jobsOf(yml), fast = jobs.find((j) => j.job === 'fast'), heavy = jobs.find((j) => j.job === 'heavy-shards');
    if (!fast || !heavy) return { bad: [`no ${fast ? 'heavy-shards' : 'fast'} job`] };
    const isUpload = (st) => /^actions\/upload-artifact@v\d+$/.test(st.action || '');
    const field = (st, k) => (new RegExp(`^\\s*${k}:\\s*(.+?)\\s*$`, 'm').exec(st.text) || [])[1] ?? null;
    const suite = fast.findIndex((st) => /^node scripts\/ci\.mjs(?: --fast-part=\$\{\{ matrix\.part \}\}\/\d+)?(?: --keep-going)?$/.test(st.run || '')), at = fast.findIndex((st) => isUpload(st) && st.text.split('\n').some((l) => l.trim() === `path: ${CI.FAST_FAIL_LOGS}/*.log`));
    const hu = heavy.find((st) => isUpload(st) && /data\/ci-heavy\/fail-logs\/\*\.log/.test(st.text));
    if (suite < 0) bad.push('the fast job runs no `node scripts/ci.mjs` (whole, or its part --fast-part=${{ matrix.part }}/n)');
    if (at < 0) { bad.push(`the fast job uploads no ${CI.FAST_FAIL_LOGS}/*.log`); return { bad }; }
    const up = fast[at];
    if (at < suite) bad.push('the fast job\'s upload runs before its suites');
    if (field(up, 'if') !== 'failure()') bad.push(`the fast job's upload is not failure-only (if: ${field(up, 'if')})`);
    if (!hu) bad.push('the heavy shards upload no data/ci-heavy/fail-logs/*.log (no retention to match)');
    else if (field(up, 'retention-days') !== field(hu, 'retention-days')) bad.push(`the fast job keeps its fail logs ${field(up, 'retention-days')} day(s), the heavy shards ${field(hu, 'retention-days')}`);
    return { bad, days: field(up, 'retention-days') };
  };
  const yml = fs.readFileSync(path.join(REPO, '.github', 'workflows', 'ci.yml'), 'utf-8'), v = uploadOf(yml);
  okd(!v.bad.length, `ci.yml's fast job uploads ${CI.FAST_FAIL_LOGS}/*.log after its suites — failure only, the heavy shards' retention${v.days ? ` (${v.days} days)` : ''}`, v.bad.join('\n'));
  const UP = /( {6}- name: Upload the failed fast suite[^\n]*\n(?: {8}.*\n)+)/;
  const MUTANTS = [
    ['the upload step gone', (t) => t.replace(UP, ''), /the fast job uploads no data\/ci-fast\/fail-logs\/\*\.log/],
    ['the heavy tier\'s dir uploaded instead', (t) => t.replace(`path: ${CI.FAST_FAIL_LOGS}/*.log`, 'path: data/ci-heavy/fail-logs/*.log'), /the fast job uploads no data\/ci-fast\/fail-logs\/\*\.log/],
    ['not failure-only', (t) => t.replace(UP, (m) => m.replace('        if: failure()\n', '')), /not failure-only \(if: null\)/],
    ['kept 1 day', (t) => t.replace(UP, (m) => m.replace('retention-days: 7', 'retention-days: 1')), /keeps its fail logs 1 day\(s\), the heavy shards 7/],
    ['before the suites', (t) => t.replace(UP, '').replace(/ {6}- run: node scripts\/ci\.mjs[^\n]*\n/, (m) => UP.exec(t)[1] + m), /the fast job's upload runs before its suites/],
  ];
  const reds = MUTANTS.map(([label, edit, why]) => { const t = edit(yml), m = uploadOf(t); return { label, applied: t !== yml, red: m.bad.some((b) => why.test(b)), bad: m.bad }; });
  const missed = reds.filter((r) => !r.applied || !r.red);
  okd(!missed.length, `CONTROL: ${reds.length} mutant copies of ci.yml each go RED for their own reason (${reds.map((r) => r.label).join(' · ')})`,
    missed.map((r) => `${r.label}: ${r.applied ? 'GREEN — ' + JSON.stringify(r.bad) : 'the edit did not apply'}`).join('\n'));
}

console.log('\n§2n B-9dd0: a fast suite\'s sockets past the loopback are a red row naming each host (the runner\'s egress reader)');
{
  const CI = await import('./ci.mjs');
  const root = mktmp('egress'), sha = 'c0ffee0123456789';
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  const plant = (name, src) => fs.writeFileSync(path.join(root, 'scripts', `${name}.mjs`), `import fs from 'node:fs';\nimport net from 'node:net';\n${src}\n`);
  const PASS = "console.log('ALL PASS (1)'); process.exit(0);";
  // THE COUNTED DIALS, planted so that NO PACKET LEAVES the box (主开发 r321: the control sits on a dial still counted):
  // · a vendor's NAME whose OWN lookup answers an address past the loopback (192.0.2.1, TEST-NET-1) a tick later — the socket
  //   was destroyed at once, so net never connects to the answer (its lookup callback sees the socket is no longer connecting);
  plant('test-planted-egress', `const s = net.connect({ host: 'vendor.example', port: 443, lookup: (h, o, cb) => process.nextTick(() => { if (o && o.all) cb(null, [{ address: '192.0.2.1', family: 4 }]); else cb(null, '192.0.2.1', 4); ${PASS} }) });\ns.on('error', () => { });\ns.destroy();`);
  // · an ADDRESS LITERAL past the loopback, destroyed in the same tick (net connects a literal on the NEXT tick, if still connecting)
  plant('test-planted-literal', `const s = net.connect({ host: '192.0.2.1', port: 443 });\ns.on('error', () => { });\ns.destroy();\n${PASS}`);
  // NOT COUNTED: a name the suite's own lookup REFUSES (test-tailnet-browsers' shape: its stand-in fails the name on purpose);
  // the loopback (a closed port); a name the suite's own lookup maps to the loopback (its stand-in)
  plant('test-planted-refused', `const s = net.connect({ host: 'vendor.example', port: 443, lookup: (h, o, cb) => cb(Object.assign(new Error('planted: refused'), { code: 'ENOTFOUND' })) });\ns.on('error', (e) => { console.log('the dial ended: ' + e.code); ${PASS} });`);
  plant('test-planted-loopback', `const s = net.connect({ host: '127.0.0.1', port: 9 });\ns.on('error', () => { ${PASS} });\ns.on('connect', () => { s.destroy(); ${PASS} });`);
  plant('test-planted-standin', `const s = net.connect({ host: 'vendor.example', port: 9, lookup: (h, o, cb) => (o && o.all ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(null, '127.0.0.1', 4)) });\ns.on('error', () => { ${PASS} });\ns.on('connect', () => { s.destroy(); ${PASS} });`);
  // THE COUNT ITSELF FAILED: the sentinel gone (the reader did not load); a host line the sampler could not write (its file
  // replaced by a folder after the sentinel: a removed folder, a full disk) — each is red, never a green whose count went missing
  plant('test-planted-unloaded', `fs.writeFileSync(process.env.VIBESPACE_SUITE_EGRESS_FILE, '');\n${PASS}`);
  plant('test-planted-lost', `const f = process.env.VIBESPACE_SUITE_EGRESS_FILE;\nfs.rmSync(f, { force: true }); fs.mkdirSync(f);\nconst s = net.connect({ host: '192.0.2.1', port: 443 });\ns.on('error', () => { });\ns.destroy();\n${PASS}`);
  // a suite that FAILED and dialed past the loopback keeps its hosts in the result (its green retry cannot hide them)
  plant('test-planted-failed', `const s = net.connect({ host: '192.0.2.1', port: 443 });\ns.on('error', () => { });\ns.destroy();\nconsole.log('  ✗ planted: a red leg'); process.exit(1);`);
  // the reader wraps a COPY: one options object reused for three connects keeps the suite's own lookup
  plant('test-planted-reuse', `const look = (h, o, cb) => process.nextTick(() => (o && o.all ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(null, '127.0.0.1', 4)));\nconst opts = { host: 'vendor.example', port: 9, lookup: look };\nlet same = 0;\nfor (let i = 0; i < 3; i++) { const s = net.connect(opts); s.on('error', () => { }); s.destroy(); if (opts.lookup === look) same++; }\nconsole.log('the options object keeps its own lookup after 3 connects: ' + same + ' of 3');\nif (same !== 3) { console.log('  ✗ the reader changed the suite\\'s own options'); process.exit(1); }\n${PASS}`);
  // …and keeps the caller's PROTOTYPE (主开发 r468): options that inherit their host, port and lookup are dialed as the suite asked —
  // an own-properties-only copy would lose the host, and the lookup would be asked for «localhost»
  plant('test-planted-proto', `const seen = [];\nconst look = (h, o, cb) => { seen.push(h); process.nextTick(() => (o && o.all ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(null, '127.0.0.1', 4))); };\nconst opts = Object.create({ host: 'vendor.example', port: 9, lookup: look });\nconst done = () => { console.log('the suite\\'s own lookup was asked for: ' + (seen.join(', ') || 'nothing')); if (seen[0] !== 'vendor.example') { console.log('  ✗ the reader\\'s copy lost the options\\' prototype'); process.exit(1); } ${PASS} };\nconst s = net.connect(opts);\ns.on('error', done);\ns.on('connect', () => { s.destroy(); done(); });`);
  const F = (name, lane, o = {}) => CI.runSuiteAsync({ name, tier: o.tier || 'fast', budgetMs: 8000 }, { root, sha, lane, ...(o.egress === false ? { egress: false } : {}) });
  okd(fs.existsSync(CI.EGRESS_SAMPLER) && CI.egressArgv().join(' ') === `--require ${CI.EGRESS_SAMPLER}`, 'the reader rides the suite\'s OWN argv (`--require` scripts/egress-sampler.cjs) — never NODE_OPTIONS', CI.egressArgv().join(' '));
  const said = (n, r) => console.log(`      ${n}: ${r.ok ? 'green' : 'RED'} · egress ${r.egress ? CI.egressWords(r.egress) : '(none)'} · ${String(r.lines[0] || '').trim().slice(0, 260)}`);
  const rows = CI.egressOf((() => { const f = path.join(root, 'egress.ndjson'); fs.writeFileSync(f, '{"host":"a.example","port":443}\n{"host":"a.example","port":443}\nnot json\n{"host":"b.example","port":80}\n'); return f; })());
  okd(CI.egressWords(rows) === 'a.example:443 ×2, (an unreadable line):0 ×1, b.example:80 ×1', 'the count by host: two sockets to one host are ×2, an unreadable line is a row of its own (never dropped)', CI.egressWords(rows));
  if (!DEEP) inTwin('the ten planted suites run through the runner with and without the egress reader, their verdicts and the retry refusals over them');
  else {
    const [vend, lit, refused, loop, stand, unl, lost, failed, reuse, proto] = await Promise.all([
      F('test-planted-egress', 1), F('test-planted-literal', 2), F('test-planted-refused', 3), F('test-planted-loopback', 4), F('test-planted-standin', 5),
      F('test-planted-unloaded', 6), F('test-planted-lost', 7), F('test-planted-failed', 8), F('test-planted-reuse', 9), F('test-planted-proto', 10),
    ]);
    const [offV, offL, heavyV] = await Promise.all([F('test-planted-egress', 1, { egress: false }), F('test-planted-literal', 2, { egress: false }), F('test-planted-egress', 3, { tier: 'heavy' })]);
    for (const [n, r] of [['egress (own lookup → 192.0.2.1)', vend], ['literal 192.0.2.1', lit], ['refused (own lookup errs)', refused], ['loopback', loop], ['stand-in (own lookup → 127.0.0.1)', stand], ['unloaded', unl], ['lost line', lost], ['failed + dialed', failed], ['options reused', reuse], ['options by prototype', proto], ['egress, reader off', offV], ['literal, reader off', offL], ['egress, heavy row', heavyV]]) said(n, r);
    okd(!vend.ok && /it opened sockets past the loopback .*: vendor\.example=192\.0\.2\.1:443 ×1/.test(vend.lines[0]) && vend.egress[0].host === 'vendor.example=192.0.2.1', 'a GREEN suite whose OWN lookup answered an address past the loopback is a RED row naming the name, the address and the count (no packet left: the socket was destroyed first)', vend.lines[0]);
    okd(!lit.ok && /: 192\.0\.2\.1:443 ×1/.test(lit.lines[0]), 'a GREEN suite that dialed an address LITERAL past the loopback is a RED row (judged as it stands; destroyed before net connects it)', lit.lines[0]);
    okd(/a name ending «\.localhost»/.test(vend.lines[0]) && /a bare DNS ask/.test(vend.lines[0]), 'the red words name the loopback names and the bare DNS ask as NOT watched (r528: the clause itself, not the constant against itself)', vend.lines[0]);
    okd(vend.lines[0].includes(CI.EGRESS_NOT_WATCHED), `the red words say what the reader does NOT watch («${CI.EGRESS_NOT_WATCHED}»)`, vend.lines[0]);
    okd(refused.ok && !refused.egress, 'THE MUST (r321): a name the suite\'s OWN lookup refuses never left the box — not counted, the row stays green (test-tailnet-browsers\' shape)', refused.lines[0]);
    okd(loop.ok && !loop.egress, 'a suite that reached only the loopback stays green', loop.lines[0]);
    okd(stand.ok && !stand.egress, 'a vendor\'s NAME the suite\'s own lookup maps to the loopback (its stand-in) stays green — the address the lookup answers is judged', stand.lines[0]);
    okd(offV.ok && offL.ok, 'CONTROL: the same planted suites WITHOUT the reader (egress: false) stay green — the red is the reader\'s', `${offV.lines[0]} | ${offL.lines[0]}`);
    okd(!heavyV.ok && /: vendor\.example=192\.0\.2\.1:443 ×1/.test(heavyV.lines[0]), 'B-9dd0\'s remainder: a HEAVY row is read the same way (its own process; the heavy tier was unread until now)', heavyV.lines[0]);
    okd(!unl.ok && /its egress reader did not load/.test(unl.lines[0]), 'a suite whose egress file lost the sampler\'s sentinel is RED by name (the reader did not load: its sockets were never counted)', unl.lines[0]);
    okd(!lost.ok && /its egress reader LOST 1 host line/.test(lost.lines[0]) && lost.egress.some((x) => x.host === CI.EGRESS_LOST), 'a host line the sampler could not WRITE (its file gone after the sentinel) is a RED row — never a green whose count went missing', lost.lines[0]);
    okd(!failed.ok && Array.isArray(failed.egress) && failed.egress.some((x) => x.host === '192.0.2.1') && /: 192\.0\.2\.1:443 ×1/.test(failed.lines[0]), 'a suite that FAILED and dialed past the loopback keeps its hosts in the result and its ✗ line', failed.lines[0]);
    okd(proto.ok && !proto.egress, 'the reader\'s COPY keeps the caller\'s prototype: options that inherit host, port and lookup are dialed as asked (the suite\'s lookup is asked for vendor.example, and answers the loopback)', proto.lines[0]);
    okd(reuse.ok && !reuse.egress, 'the reader wraps a COPY of the options: one options object reused for three connects keeps the suite\'s own lookup', reuse.lines[0]);
    // the retry refusals: each names its cause (an egress, the reader not loaded, a lost line)
    const why = (r) => CI.fastRetryRefusal({ name: 'test-planted', tier: 'fast' }, r);
    console.log(`      the retry refusals: «${why(vend)}» · «${why(unl)}» · «${why(lost)}» · «${why(failed)}»`);
    okd(/sockets past the loopback/.test(why(vend) || '') && /sockets past the loopback/.test(why(failed) || ''), 'an egress red is never retried as a flake — a green one, and a FAILED one that dialed (fastRetryRefusal names it)', `${why(vend)} | ${why(failed)}`);
    okd(/egress reader did not load/.test(why(unl) || '') && /lost a host line/.test(why(lost) || ''), 'the refusal names the READER when it did not load, and a lost line as a lost line (never «it opened sockets»)', `${why(unl)} | ${why(lost)}`);
  }
  // THE VERDICT, pure (the branches a plant cannot reach without a packet: a NAME with no lookup of its own would ask the box's
  // resolver) + the loopback table + one spelling of the lost marker
  const S = createRequire(import.meta.url)(CI.EGRESS_SAMPLER);
  const vt = [
    [{ host: 'vendor.example', o: {} }, 'count'], [{ host: 'vendor.example', o: null }, 'count'], [{ host: 'vendor.example', o: { lookup() { } } }, 'lookup'],
    [{ host: '192.0.2.1', o: { lookup() { } } }, 'count'], [{ host: '[2001:db8::1]', o: null }, 'count'], [{ host: '127.0.0.1', o: {} }, 'skip'], [{ host: 'localhost', o: {} }, 'skip'], [null, 'skip'],
  ];
  const vBad = vt.filter(([t, want]) => S.verdict(t) !== want).map(([t, want]) => `${t && t.host}: ${S.verdict(t)} (want ${want})`);
  console.log(`      the verdict table: ${vt.map(([t]) => `${t ? t.host + (t.o && t.o.lookup ? '+lookup' : '') : 'null'}→${S.verdict(t)}`).join(' · ')}`);
  okd(!vBad.length, 'THE VERDICT: a NAME with no lookup of its own is counted (before any lookup), with one it is judged by the answer, an address literal as it stands (a lookup or not), the loopback skipped', vBad.join('; '));
  const tg = [S.target([{ path: '/tmp/x.sock' }]), S.target([443, 'vendor.example']), S.target(['/tmp/x.sock']), S.target([[{ host: 'h.example', port: 1 }, null]])];
  okd(tg[0] === null && tg[1].host === 'vendor.example' && tg[1].port === 443 && tg[2] === null && tg[3].host === 'h.example' && Array.isArray(tg[3].arr), 'target(): a unix socket is nothing to judge; (port, host) and net\'s own normalized array are read', JSON.stringify(tg.map((x) => x && { host: x.host, port: x.port, arr: !!x.arr })));
  const an = [S.answered(new Error('x'), null), S.answered(null, '127.0.0.1'), S.answered(null, '192.0.2.1'), S.answered(null, [{ address: '127.0.0.1' }, { address: '192.0.2.7' }])];
  console.log(`      answered(): refused → ${an[0]} · 127.0.0.1 → ${an[1]} · 192.0.2.1 → ${an[2]} · [127.0.0.1, 192.0.2.7] → ${an[3]}`);
  okd(an[0] === null && an[1] === null && an[2] === '192.0.2.1' && an[3] === '192.0.2.7', 'answered(): a refusal and a loopback answer are not counted; an address past the loopback is, and ANY such entry of an all:true list (the header says so)', JSON.stringify(an));
  const LB = ['127.0.0.1', '127.9.8.7', '::1', '[::1]', '0:0:0:0:0:0:0:1', '::ffff:127.0.0.1', '::ffff:7f00:1', 'localhost', 'LOCALHOST.', 'a.localhost', '0.0.0.0', '::'];
  const NOT = ['192.0.2.1', '10.0.0.1', '::ffff:192.0.2.1', '::ffff:c000:201', 'vendor.example', 'localhost.example', '127.example', '127.0.0.1.example'];
  const lbBad = [...LB.filter((h) => !S.LOOPBACK(h)).map((h) => `${h}: not loopback`), ...NOT.filter((h) => S.LOOPBACK(h)).map((h) => `${h}: taken as loopback`)];
  console.log(`      the loopback table: ${LB.length} loopback, ${NOT.length} past it — ${lbBad.length ? lbBad.join('; ') : 'each as written'}`);
  okd(!lbBad.length, 'the loopback table: 127/8 literals, ::1 (both spellings), the v4-mapped 127 forms, localhost and *.localhost, 0.0.0.0 and :: — and never a NAME that merely begins «127.» or a mapped address past it', lbBad.join('; '));
  okd(S.LOST_MARK === CI.EGRESS_LOST_MARK, 'the lost marker is ONE spelling: the sampler\'s LOST_MARK is the runner\'s EGRESS_LOST_MARK', `${S.LOST_MARK} | ${CI.EGRESS_LOST_MARK}`);
  // ── B-9dd0's remainder (主开发 r1134 / r1246): A NODE CHILD IS READ — ONLY in a row the census names as CARRIED; every child
  // the reader does not follow is COUNTED on the row (never silent) ──
  // each child dials 192.0.2.1 (TEST-NET-1) on its own port, the socket destroyed in the same tick (no packet; as the literal plant)
  const DIAL = (port) => `const s = require('net').connect({ host: '192.0.2.1', port: ${port} }); s.on('error', () => {}); s.destroy(); if (process.disconnect) process.disconnect();`;
  const J = JSON.stringify;
  const dialFile = path.join(root, 'scripts', 'planted-dial.cjs');
  fs.writeFileSync(dialFile, DIAL(447) + '\n');
  const argvFile = path.join(root, 'fork-execargv.json');
  const forkDial = path.join(root, 'scripts', 'planted-fork-dial.cjs');
  fs.writeFileSync(forkDial, `require('fs').writeFileSync(${J(argvFile)}, JSON.stringify(process.execArgv));\n${DIAL(448)}\n`);
  plant('test-planted-child', `import { spawn } from 'node:child_process';\nconst c = spawn(process.execPath, ['-e', ${J(DIAL(443))}], { stdio: 'ignore' });\nc.on('exit', () => { ${PASS} });`);
  plant('test-planted-child-sync', `import { execFileSync } from 'node:child_process';\nexecFileSync(process.execPath, ['-e', ${J(DIAL(444))}], { env: { PATH: process.env.PATH }, stdio: 'ignore' });\n${PASS}`);
  plant('test-planted-grandchild', `import { spawnSync } from 'node:child_process';\nspawnSync(process.execPath, ['-e', ${J(`require('child_process').spawnSync(process.execPath, ['-e', ${J(DIAL(445))}], { stdio: 'ignore' });`)}], { stdio: 'ignore' });\n${PASS}`);
  plant('test-planted-child-unread', `import { spawnSync } from 'node:child_process';\nspawnSync(process.execPath, ['-e', ${J(DIAL(446))}], { env: { ...process.env, VIBESPACE_SUITE_EGRESS_FILE: '' }, stdio: 'ignore' });\n${PASS}`);
  plant('test-planted-fork-own', `import { fork } from 'node:child_process';\nconst c = fork(${J(dialFile)}, [], { execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });\nc.on('exit', () => { ${PASS} });`);
  plant('test-planted-fork', `import { fork } from 'node:child_process';\nconst c = fork(${J(forkDial)}, [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });\nc.on('exit', () => { ${PASS} });`);
  plant('test-planted-shell', `import { exec, execSync } from 'node:child_process';\nexecSync(${J(`${process.execPath} -e "process.exit(0)"`)}, { stdio: 'ignore' });\nexec(${J(`${process.execPath} -e "process.exit(0)"`)}, () => { ${PASS} });`);
  const KIDS = ['test-planted-child', 'test-planted-child-sync', 'test-planted-grandchild', 'test-planted-child-unread', 'test-planted-fork-own', 'test-planted-fork', 'test-planted-shell'];
  if (!DEEP) inTwin('B-9dd0\'s remainder: the planted children, carried and census rows, and the reader-without-its-child-hook control');
  else {
    // (1) A CARRIED ROW: a COPY of the reader beside a list that names the plants as carried (the tree's own list names no plant)
    const readerDir = (name, src, carried) => { const d = path.join(root, name); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'egress-sampler.cjs'), src); fs.writeFileSync(path.join(d, 'egress-carried-rows.json'), J({ carried })); return path.join(d, 'egress-sampler.cjs'); };
    const SRC = fs.readFileSync(CI.EGRESS_SAMPLER, 'utf8');
    const carriedReader = readerDir('reader-carried', SRC, KIDS);
    const P = (reader, name) => { const f = path.join(root, `${name}.${path.basename(path.dirname(reader))}.ndjson`); fs.rmSync(f, { force: true }); fs.rmSync(argvFile, { force: true }); const r = spawnSync(process.execPath, ['--require', reader, path.join(root, 'scripts', name + '.mjs')], { env: { ...process.env, VIBESPACE_SUITE_EGRESS_FILE: f }, encoding: 'utf8', timeout: 8000 }); const rows = CI.egressOf(f); let fa = null; try { fa = JSON.parse(fs.readFileSync(argvFile, 'utf8')); } catch { } return { rc: r.status, rows, words: CI.egressWords(rows), unread: CI.egressUnreadTail(rows), stderr: String(r.stderr || ''), forkArgv: fa }; };
    const C = Object.fromEntries(KIDS.map((n) => [n, P(carriedReader, n)]));
    for (const n of KIDS) console.log(`      carried · ${n}: rc ${C[n].rc} · egress ${C[n].words || '(none)'}${C[n].unread}`);
    okd(/192\.0\.2\.1:443 ×1/.test(C['test-planted-child'].words), 'a CARRIED row: a node CHILD the suite spawns is read too — its dial past the loopback is the row\'s, by host', C['test-planted-child'].words);
    okd(/192\.0\.2\.1:444 ×1/.test(C['test-planted-child-sync'].words) && /192\.0\.2\.1:445 ×1/.test(C['test-planted-grandchild'].words), '…a SYNC child given a SCRUBBED env too (the shim names the file; nothing is added to its env), and a GRANDCHILD', `${C['test-planted-child-sync'].words} | ${C['test-planted-grandchild'].words}`);
    okd(/192\.0\.2\.1:448 ×1/.test(C['test-planted-fork'].words) && Array.isArray(C['test-planted-fork'].forkArgv) && C['test-planted-fork'].forkArgv.some((a) => /egress-sampler\.cjs$/.test(a)), '…and a fork() that names no execArgv inherits the reader (counted by host)', { words: C['test-planted-fork'].words, argv: C['test-planted-fork'].forkArgv });
    okd(!C['test-planted-child-unread'].words && /unread-on-purpose ×1/.test(C['test-planted-child-unread'].unread) && !C['test-planted-fork-own'].words && /own-flags ×1/.test(C['test-planted-fork-own'].unread) && /shell ×2/.test(C['test-planted-shell'].unread),
      'NOT FOLLOWED, AND COUNTED (never silent): a child whose env names an EMPTY file (unread-on-purpose), a fork naming its OWN execArgv (own-flags), a shell command naming node, async and sync (shell ×2) — each a reason on the row', `${C['test-planted-child-unread'].unread} | ${C['test-planted-fork-own'].unread} | ${C['test-planted-shell'].unread}`);
    okd(/\[egress-sampler\] \d+ child(ren)? not read by the egress reader/.test(C['test-planted-fork-own'].stderr), '…and the suite\'s OWN process says them on its stderr at its exit (any runner\'s log carries it)', C['test-planted-fork-own'].stderr.slice(0, 300));
    // (2) A CENSUS ROW (the default: the tree's own list names no plant) — its children carry NO reader, each counted; a fork gets the
    // execArgv it would have with no reader: the product under test sees the same command lines as with the reader off
    const [cKid, cFork, cSync] = await Promise.all([F('test-planted-child', 11), F('test-planted-fork', 12), F('test-planted-child-sync', 13)]);
    let cForkArgv = null; try { cForkArgv = JSON.parse(fs.readFileSync(argvFile, 'utf8')); } catch { }
    for (const [n, r] of [['census · a child', cKid], ['census · a default fork', cFork], ['census · a sync child', cSync]]) said(n, r);
    okd(cKid.ok && !cKid.egress && /not read by the egress reader \(census ×1\)/.test(cKid.lines[0]) && cSync.ok && !cSync.egress && /census ×1/.test(cSync.lines[0]),
      'THE MUST (r1246): in a CENSUS row the reader stays in the suite\'s own process — a node child is handed NO shim (its argv is as with the reader off), and it is COUNTED on the green row («census ×1»)', `${cKid.lines[0]} | ${cSync.lines[0]}`);
    okd(cFork.ok && !cFork.egress && /census ×1/.test(cFork.lines[0]) && Array.isArray(cForkArgv) && !cForkArgv.some((a) => /egress-sampler\.cjs$|\.child\.cjs$/.test(a)),
      '…and a census row\'s default fork() is handed the execArgv it would have with NO reader (none of the reader\'s words), counted', { line: cFork.lines[0], forkArgv: cForkArgv });
    // RED CONTROL: a COPY of the reader without its child hook, in a carried row, counts NOTHING of the same child (the release's road)
    okd(SRC.split('\ninstallChildren();\n').length === 2, 'CONTROL anchor: the reader installs its child hook once');
    const noKids = P(readerDir('reader-no-children', SRC.replace('\ninstallChildren();\n', '\n'), KIDS), 'test-planted-child');
    okd(noKids.rows.loaded && !noKids.words && !noKids.unread, 'CONTROL: a reader without its child hook counts NOTHING of the same child\'s dial — neither a host nor a reason (the release\'s road: the child legs above would be RED)', noKids);
  }
  // NODE_BIN: the RUNNING node only — a stand-in `node` (a shell script answering by its first word: the first gate's red in
  // test-node-runtime / test-update-road) and a bare name that is not on the PATH are left alone
  const sbin = path.join(root, 'standin-bin'); fs.mkdirSync(sbin, { recursive: true }); fs.writeFileSync(path.join(sbin, 'node'), '#!/bin/sh\necho stand-in\n', { mode: 0o755 });
  const nb = [S.NODE_BIN(process.execPath), S.NODE_BIN('node', { envPath: path.dirname(process.execPath) }), S.NODE_BIN(path.join(sbin, 'node')), S.NODE_BIN('node', { envPath: sbin }), S.NODE_BIN('node', { envPath: '/nonexistent' }), S.NODE_BIN('/bin/sh')];
  okd(JSON.stringify(nb) === '[true,true,false,false,false,false]', 'NODE_BIN: the running node by its path or by a bare `node` first on the child\'s PATH — never a stand-in named node, a name off the PATH, or another program', JSON.stringify(nb));
  // carry(): the argv a node child is started with (PURE)
  const ct = [
    [S.carry(['/n', 'a.js'], { file: 'F', shim: 'SH' }), '/n --require SH a.js'], [S.carry(['/n', 'a.js'], { file: 'F', shim: 'SH', envFile: 'F' }), '/n --require SH a.js'],
    [S.carry(['/n', 'a.js'], { file: 'F', shim: 'SH', envFile: 'G' }), null], [S.carry(['/n', 'a.js'], { file: 'F', shim: 'SH', envFile: '' }), null],
    [S.carry(['/n', '--require', 'SH', 'a.js'], { file: 'F', shim: 'SH' }), null], [S.carry(['/n', '--permission', 'a.js'], { file: 'F', shim: 'SH' }), null], [S.carry(['/n', 'a.js'], { file: '', shim: 'SH' }), null],
  ];
  const cBad = ct.filter(([got, want]) => (got ? got.join(' ') : null) !== want).map(([got, want]) => `${got ? got.join(' ') : null} (want ${want})`);
  okd(!cBad.length, 'carry(): the shim right after the binary — or the child LEFT ALONE: another reader\'s file or an empty one, a reader already on its argv, the permission model, no file of its own', cBad.join('; '));
  // childVerdict / withoutReader / binKind (PURE, or a planted file): what the reader does with one child, and why
  const shebang = path.join(root, 'standin-bin', 'a-node-script'); fs.writeFileSync(shebang, '#!/usr/bin/env node\nprocess.exit(0)\n', { mode: 0o755 });
  const V = (o) => J(S.childVerdict({ file: 'F', ...o }));
  const vt2 = [
    [V({ kind: 'running', args: ['/n', 'a.js'] }), '{"carry":true}'], [V({ kind: 'running', args: ['/n', 'a.js'], census: true }), '{"unread":"census"}'],
    [V({ kind: 'running', args: ['/n', 'a.js'], envFile: '' }), '{"unread":"unread-on-purpose"}'], [V({ kind: 'running', args: ['/n', 'a.js'], envFile: 'G' }), '{"unread":"other-file"}'],
    [V({ kind: 'running', args: ['/n', '--permission', 'a.js'] }), '{"unread":"permission"}'], [V({ kind: 'running', args: ['/n', '--require', '/x/egress-sampler.cjs', 'a.js'], census: true }), '{}'],
    [V({ kind: 'other-node', args: ['node'] }), '{"unread":"other-node"}'], [V({ kind: 'shebang', args: ['x'] }), '{"unread":"shebang"}'],
    [V({ kind: 'other', args: ['/bin/sh', '-c', '/usr/bin/node x.js'] }), '{"unread":"shell"}'], [V({ kind: 'other', args: ['/bin/sh', '-c', 'git log'] }), '{}'], [V({ kind: 'other', args: ['/usr/bin/git', 'log'] }), '{}'],
  ];
  const v2Bad = vt2.filter(([g, w]) => g !== w).map(([g, w]) => `${g} (want ${w})`);
  okd(!v2Bad.length, 'childVerdict: carried, or each reason it is not (census, unread-on-purpose, other-file, permission, other-node, shebang, shell); a child already carrying a reader or no node at all is nothing', v2Bad.join('; '));
  const wr = S.withoutReader(['--require', '/a/egress-sampler.cjs', '--max-old-space-size=4096', '-r', '/b/x.ndjson.child.cjs', '--require=/c/egress-sampler.cjs', '--require', '/d/other.cjs']);
  okd(J(wr) === J(['--max-old-space-size=4096', '--require', '/d/other.cjs']), 'withoutReader: a census row\'s fork keeps every flag of its own but the reader\'s (both spellings, the shim)', J(wr));
  const bk = [S.binKind(process.execPath), S.binKind(path.join(sbin, 'node')), S.binKind(shebang), S.binKind('/bin/sh')];
  okd(J(bk) === J(['running', 'other-node', 'shebang', 'other']), 'binKind: the running node · a stand-in named node · a script whose first line names node · anything else (remembered per binary and search path)', J(bk));
  // THE BOX'S OWN ADDRESSES: judged as the loopback (a planted own set: the PURE form), literal or answered
  const OWN = new Set(['192.0.2.9']);
  const ob = [S.verdict({ host: '192.0.2.9', o: null }, OWN), S.verdict({ host: '192.0.2.1', o: null }, OWN), S.answered(null, '192.0.2.9', OWN), S.answered(null, [{ address: '192.0.2.9' }, { address: '192.0.2.1' }], OWN), S.LOCAL('[192.0.2.9]', OWN)];
  okd(ob[0] === 'skip' && ob[1] === 'count' && ob[2] === null && ob[3] === '192.0.2.1' && ob[4] === true, 'the box\'s OWN address never leaves the box: a literal of one is skipped, an answer of one is not counted — any other address is', JSON.stringify(ob));
}
{ // B-9dd0 (主开发 r1521): THE BELT IS PROBED IN THE CHROME UNDER TEST — every suite that launches a Chrome of its own with
  // chromeBelt(…) proves the belt by reachFrom(<THAT Chrome's CDP port>), never by a second Chrome it starts with the belt itself
  // (taking the belt off the suite's own Chrome would stay green). RED: the release's form planted (a second belted Chrome probed)
  const SD = path.join(REPO, 'scripts'), rdS = (f) => fs.readFileSync(path.join(SD, f), 'utf-8');
  const beltOwn = (src) => {
    const ports = src.split('\n').filter((l) => /\bspawn\(CHROME, \[/.test(l) && /\.\.\.chromeBelt\(/.test(l)).map((l) => (/--remote-debugging-port=\$\{(\w+)\}/.exec(l) || [])[1]).filter(Boolean);
    if (!ports.length) return 'no Chrome of its own launched with the belt';
    if (/chromeReach\([^\n]*args:\s*chromeBelt\(/.test(src)) return 'a SECOND Chrome started with the belt is probed';
    const missed = ports.filter((p) => !new RegExp(`\\breachFrom\\(${p}\\b`).test(src));
    return missed.length ? `its own Chrome (port ${missed.join(', ')}) is never probed` : null;
  };
  const belted = fs.readdirSync(SD).filter((f) => f.endsWith('.mjs') && f !== 'scratch.mjs' && /\.\.\.chromeBelt\(/.test(rdS(f)));
  const bad = belted.map((f) => [f, beltOwn(rdS(f))]).filter(([, v]) => v);
  okd(belted.length >= 2 && !bad.length, `B-9dd0 (r1521): every suite that launches its Chrome with the belt probes THAT Chrome (reachFrom on its own CDP port): ${belted.join(', ')}`, bad.map(([f, v]) => `${f}: ${v}`).join('\n'));
  const relForm = rdS('test-https-hub-chrome.mjs').replace('const beltR = await reachFrom(CDP_PORT);', () => "const beltR = await chromeReach(CHROME, { args: chromeBelt([IP]), dir: path.join(chromeDir, 'belt') });");
  const unprobed = rdS('test-plugin-consent-chrome.mjs').replace('const beltR = await reachFrom(CDP_PORT);', () => 'const beltR = { own: \'refused\', vendor: \'refused\', testnet: \'refused\' };');
  okd(beltOwn(relForm) === 'a SECOND Chrome started with the belt is probed' && /never probed/.test(String(beltOwn(unprobed))), `RED: the release's form (a second Chrome started with the belt) and a suite whose own Chrome is never probed are each red by name — «${beltOwn(relForm)}» · «${beltOwn(unprobed)}»`);
}
// ── §2j A SUITE READS NO HISTORY MASTER DOES NOT HAVE (B-4291, lane int361, 2.369.369: test-stash-strip's r5 leg read
// `git show 280ccd2e:…` — a LANE-BRANCH commit only the production repo had — so the push gate alone ran the leg, red at four
// pushes in a row and called a flake, while every lane, the runner (depth 1) and each by-hand rerun SKIPPED it and said green) ──
// Every literal sha a script under scripts/ hands git to READ (show / cat-file / rev-parse / ls-tree) must be an ANCESTOR of HEAD.
// The reads (r2, the acceptance's blind forms): a quoted sha on a git-read line — single, double or back quotes, `<sha>:path`,
// `<sha>^{commit}`, a concatenation `'<sha>' + ':'`; a binding `const NAME = '<sha>'` or `= process.env.X || '<sha>'` (?? too)
// fed to a git-read line (`${NAME}:`, `${NAME}^{commit}`, NAME as an argument or concatenated); and a FUNCTION ARGUMENT — a
// function whose body hands its parameter to git (`${ref}:…`) called with a literal sha (the retired `fixBaseShaped('f36369057')`, B-44c5).
// The verdict resolves `<sha>^{commit}` first (a short sha git cannot tell from another commit is AMBIGUOUS — «lengthen it», never
// «off-master»), then asks `merge-base --is-ancestor` with the full sha (GIT_ENV: no alternates). A full clone holds every
// ancestor of HEAD, so «absent» and «present but off master» are ONE verdict in every full checkout; a shallow clone (the runner)
// cannot judge ancestry: it says so and counts nothing — a skip is never a green. The latent reads the guard found are a named
// ratchet (one backlog row each); a NEW one is red, and so is a ratchet row whose script no longer reads its sha or whose sha
// reached master — the list only shrinks.
console.log('\n§2j a suite reads no history master does not have');
{
  const READS_OFF_MASTER = Object.freeze({ // sha → the scripts that read it (2026-11-01, B-4291's census — each a backlog row)
  });
  // B-1388 (lane bl-tests-e, 2026-11-17 — the B-4291 r2 acceptance's six latent forms, each blind on a planted file while a plain
  // show in the same file went red): a verb that READS a tree too (worktree add / archive / diff / log / checkout); `git -C <dir>
  // show <sha>:` command strings (options before the verb); a binding judged by the NEAREST one above the read (a later block's
  // const no longer takes over an earlier block's read); a sha handed to a helper as ANY argument its body gives git; an argument
  // array split across lines (the statement is judged whole); and a blob / tree sha on master's history is ON master.
  // STILL BLIND (said; no live case): `git -c k=v show`, grep / merge-base / rev-list / restore with a sha, and a helper whose
  // parameter list holds a `)` in a default (`(ref = pick()) =>` — DEF reads `\(([^)]*)\)`). ONE READ HIDDEN ON PURPOSE:
  // test-pool-auto's preFixCopy CONTROL joins its ABSENT ref from pieces — a control whose whole point is absence. Never copy
  // the trick to hide a real off-master read: that is a ratchet row, or its few lines freeze as a fixture (B-874f / B-4075).
  const HEX = '[0-9a-f]{7,40}', VERBS = 'show|cat-file|rev-parse|ls-tree|archive|diff|log|checkout';
  const VERB = new RegExp(`['"\`](?:${VERBS})['"\`]|['"\`]worktree['"\`]\\s*,\\s*['"\`]add['"\`]|\\bgit(?:\\s+-C\\s+\\S+)?\\s+(?:${VERBS}|worktree\\s+add)\\b`);
  const LIT = new RegExp(`['"\`](${HEX})(?=[:'"\`^])`, 'g'), ANY_VERB = new RegExp(`['"\`](?:${VERBS}|worktree)['"\`]|\\bgit\\s`);
  // a git command line in a string: options and the -C dir before the verb, then options / paths / ${…} before the sha
  const CMD = new RegExp(`\\bgit(?:\\s+-C\\s+\\S+|\\s+--?[\\w-]+(?:=\\S+)?)*\\s+(?:${VERBS}|worktree\\s+add)(?:\\s+(?:-\\S+|\\$\\{[^}]*\\}|[^\\s'"\`]*/[^\\s'"\`]*))*\\s+(${HEX})(?=[:^\\s\`'"]|$)`, 'g');
  const BIND = new RegExp(`\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:[^;\\n]*?(?:\\|\\||\\?\\?)\\s*)?['"\`](${HEX})['"\`]`);
  const DEF = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(([^)]*)\)|([A-Za-z_$][\w$]*))\s*=>|\bfunction\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/;
  const esc = (n) => n.replace(/\$/g, '\\$');
  const fedOn = (line, n) => line.includes('${' + n + '}') || new RegExp(`(?:^|[^\\w$.])${esc(n)}\\s*\\+|[,[(]\\s*${esc(n)}\\s*[,\\])+]`).test(line);
  const STR = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
  // a line CONTINUES an argument list when its code ends inside one — on `(`, `[` or `,` (a callback's `() => {` ends a line on
  // `{`: a block, never an argument array — B-1388 reader: `it('x', () => {` opened 13-line «statements» 3 350 times)
  const continues = (l) => /[([,]\s*$/.test(l.replace(STR, '""').replace(/\/\/.*$/, ''));
  /** the history reads of one script's text: [{ sha, line, form }] — comment lines are not reads */
  const historyReadsOf = (text) => {
    if (!ANY_VERB.test(text)) return [];   // most scripts read no history: one scan, not a line walk (a bare «log» is every console.log)
    const code = text.split('\n').map((l) => (/^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l)), out = [], readers = new Map();
    const joined = code.join('\n'), lineAt = []; for (let i = 0, o = 0; i < code.length; i++) { lineAt.push(o); o += code[i].length + 1; }
    const seen = (sha, line) => out.some((r) => r.line === line && r.sha === sha);
    // the helpers whose body hands a parameter to git: name → the argument positions it reads
    code.forEach((l, i) => {
      const d = DEF.exec(l); if (!d) return;
      const name = d[1] || d[4], params = String((d[1] ? (d[2] ?? d[3]) : d[5]) || '').split(',').map((p) => p.trim().replace(/\s*=.*$/, '')).filter(Boolean);
      const body = code.slice(i, i + 8).join('\n');
      if (!VERB.test(body)) return;
      const at = params.map((p, k) => (/^[A-Za-z_$][\w$]*$/.test(p) && fedOn(body, p) ? k : -1)).filter((k) => k >= 0);
      if (at.length) readers.set(name, at);
    });
    // the statements: a line that opens a ( or [ it does not close runs on (≤ 12 lines) — an argument array split over lines
    const stmtOf = []; for (let i = 0; i < code.length;) { let j = i; while (continues(code[j]) && j + 1 < code.length && j - i < 12) j++; for (let k = i; k <= j; k++) stmtOf[k] = [i, j]; i = j + 1; }
    // name → sha: the NEAREST binding above the read (a later block's const takes over only from its own line on); a read with
    // none above takes the first one BELOW (a helper defined before the const it reads — legal JS, the old census saw it)
    const allBinds = new Map(); code.forEach((l, i) => { const b = BIND.exec(l); if (b) { if (!allBinds.has(b[1])) allBinds.set(b[1], []); allBinds.get(b[1]).push([i, b[2]]); } });
    const binds = new Map([...allBinds].map(([n, list]) => [n, list[0][1]]));
    code.forEach((l, i) => {
      const b = BIND.exec(l); if (b) binds.set(b[1], b[2]);
      const [s0, s1] = stmtOf[i], stmt = s0 === s1 ? l : code.slice(s0, s1 + 1).join('\n');
      if (VERB.test(stmt)) {
        for (const m of l.matchAll(LIT)) if (!seen(m[1], i + 1)) out.push({ sha: m[1], line: i + 1, form: VERB.test(l) ? 'literal' : 'literal (a split argument array)' });
        if (i === s0) for (const m of stmt.matchAll(CMD)) { const ln = s0 + stmt.slice(0, m.index).split('\n').length; if (!seen(m[1], ln)) out.push({ sha: m[1], line: ln, form: 'command string' }); }
        for (const [n, sha] of binds) if (fedOn(l, n) && !seen(sha, i + 1)) out.push({ sha, line: i + 1, form: 'binding ' + n });
      }
      for (const [f, at] of readers) {
        if (!l.includes(f + '(')) continue;   // the cheap test first (B-1388 reader: a RegExp per line per reader was ~170 ms)
        for (const m of l.matchAll(new RegExp(`(?:^|[^\\w$.])${esc(f)}\\(`, 'g'))) {
          const as = callArgs(joined, lineAt[i] + m.index + m[0].length, Math.max(...at) + 1) || [];
          for (const k of at) { const a = (as[k] || '').match(new RegExp(`^['"\`](${HEX})['"\`]$`)); if (a && !seen(a[1], i + 1)) out.push({ sha: a[1], line: i + 1, form: `argument ${k + 1} of ${f}` }); }
        }
      }
    });
    return out;
  };
  /** reads [{file, sha, line}] + a verdict oracle ('on' | 'off' | 'ambiguous') + the ratchet ⇒ { fresh, ambiguous, stale } */
  const judgeReads = (reads, verdictOf, ratchet) => {
    const ambiguous = reads.filter((r) => verdictOf(r.sha) === 'ambiguous');
    const fresh = reads.filter((r) => verdictOf(r.sha) === 'off' && !(ratchet[r.sha] || []).includes(r.file));
    const stale = Object.entries(ratchet).flatMap(([sha, files]) => files.filter((f) => verdictOf(sha) === 'on' || !reads.some((r) => r.sha === sha && r.file === f)).map((f) => `${sha} ${f}`));
    return { fresh, ambiguous, stale };
  };
  // THE FORMS, each planted (built by concatenation: this file must not read history itself) — each one seen, by name
  const sh = 'sh' + 'ow', cf = 'cat' + '-file', rp = 'rev' + '-parse', lt = 'ls' + '-tree', S1 = ['abc', '1234'].join('');
  const wt = 'work' + 'tree', ar = 'arch' + 'ive', df = 'di' + 'ff', lg = 'l' + 'og', co = 'check' + 'out';
  const FORMS = {
    'show <sha>:path': `execFileSync('git', ['-C', REPO, '${sh}', '${S1}:src/a.js'])`,
    'double quotes': `execFileSync("git", ["${sh}", "${S1}:src/a.js"])`,
    'cat-file -p <sha>:path': `git(['${cf}', '-p', '${S1}:src/a.js'])`,
    'cat-file -e <sha>^{commit}': `git(['${cf}', '-e', '${S1}^{commit}'])`,
    'rev-parse … <sha>^{commit}': `git(['${rp}', '--verify', '--quiet', '${S1}^{commit}'])`,
    'ls-tree <sha>': `git(['${lt}', '-r', '--name-only', '${S1}', 'src/lib'])`,
    'a code string `git show <sha>:`': `execSync(\`git ${sh} ${S1}:src/a.js\`)`,
    'a concatenation': `execFileSync('git', ['${sh}', '${S1}' + ':' + p])`,
    'a const fed to ${NAME}^{commit}': `const BASE = '${S1}';\nexecFileSync('git', ['-C', REPO, '${cf}', '-e', \`\${BASE}^{commit}\`])`,
    'an env-defaulted const': `const PRE = process.env.X_REF || '${S1}';\nconst t = execFileSync('git', ['${sh}', \`\${PRE}:server.js\`]);`,
    'a function argument': `const shaped = (ref) => { const t = execFileSync('git', ['-C', repo, '${sh}', \`\${ref}:src/a.js\`]); return t; };\nconst r = shaped('${S1}') ? 1 : 0;`,
    // B-1388's six (each blind before it):
    'worktree add <dir> <sha>': `git(['${wt}', 'add', '--detach', dir, '${S1}'])`,
    'archive <sha>': `execFileSync('git', ['-C', REPO, '${ar}', '${S1}', 'scripts'])`,
    'diff / log / checkout <sha>': `git(['${df}', '${S1}', 'HEAD']); git(['${lg}', '-1', '${S1}']); git(['${co}', '${S1}', '--', 'src'])`,
    'git -C <dir> show <sha>: in a command string': `execSync(\`git -C \${REPO} ${sh} ${S1}:src/a.js\`)`,
    'a helper\'s SECOND argument': `const at = (file, ref) => execFileSync('git', ['${sh}', \`\${ref}:\${file}\`]);\nconst t = at('src/a.js', '${S1}');`,
    'an argument array split across lines': `const t = execFileSync('git', [\n  '-C', REPO,\n  '${sh}',\n  '${S1}:src/a.js',\n]);`,
  };
  const blind = Object.entries(FORMS).filter(([, t]) => !historyReadsOf(t).some((r) => r.sha === S1)).map(([k]) => k);
  ok(!blind.length && !historyReadsOf(`// git ${sh} ${S1}:src/a.js — a comment names a sha, it reads nothing`).length && !historyReadsOf(`const id = '${S1}'; console.log(id);`).length,
    `the read forms are seen (${Object.keys(FORMS).join(' · ')}); a comment, a hex id never handed to git: not reads` + (blind.length ? ` — BLIND to: ${blind.join(' · ')}` : ''));
  const S4 = ['bbb', '2222'].join('');
  const blocks = historyReadsOf(`{\n  const BASE = '${S1}';\n  git(['${cf}', '-e', \`\${BASE}^{commit}\`]);\n}\n{\n  const BASE = '${S4}';\n  git(['${sh}', \`\${BASE}:a.js\`]);\n}`);
  ok(blocks.some((r) => r.sha === S1 && r.line === 3) && blocks.some((r) => r.sha === S4 && r.line === 7) && !blocks.some((r) => r.sha === S4 && r.line === 3),
    'B-1388: a binding is judged by the NEAREST one above the read — two blocks each binding BASE: the first block\'s read is its own sha, never the later block\'s', blocks);
  ok(!historyReadsOf(`const pal = { log: 'x', tint: '${S1}' };`).length && !historyReadsOf(`console.log('${S1}');`).length && !historyReadsOf(`const t = git(['${sh}', 'HEAD:a.js']);\nconst id = '${S1}';`).length,
    'B-1388: …and the wider net catches no hex that is not handed to git (a palette beside the word log, a console.log of an id, an id on the line after a read)');
  ok(!historyReadsOf(`{\n  const t = git(['${lg}', '-1']);\n  fs.writeFileSync(f, '${S1}'.repeat(4));\n}`).length && !historyReadsOf(`it('x', () => {\n  git(['${lg}', '-1']);\n  fs.writeFileSync(f, '${S1}'.repeat(4));\n});`).length,
    'B-1388: …nor a hex in the same { block } as a read, a callback\'s block included (`it(\'x\', () => {` is no argument array)');
  ok(historyReadsOf(`const readBase = (f) => git(['${sh}', \`\${BASE}:\${f}\`]);\nconst BASE = '${S1}';`).some((r) => r.sha === S1 && r.form === 'binding BASE'), 'B-1388: a binding BELOW the helper that reads it is still read (none above ⇒ the first below)');
  // the verdict, on a planted oracle: a new off-master read is red; an ambiguous one is red; a ratchet row no longer read, or whose sha reached master, is red
  const S2 = ['def', '5678'].join(''), S3 = ['fed', '0987'].join(''), V = { [S1]: 'off', [S2]: 'on', [S3]: 'ambiguous' }, oracle = (sha) => V[sha] || 'off';
  const v1 = judgeReads([{ file: 't.mjs', sha: S1, line: 3 }, { file: 't.mjs', sha: S2, line: 4 }], oracle, {});
  const v2 = judgeReads([{ file: 't.mjs', sha: S1, line: 3 }], oracle, { [S1]: ['t.mjs'] });
  const v3 = judgeReads([], oracle, { [S1]: ['t.mjs'] }), v4 = judgeReads([{ file: 't.mjs', sha: S2, line: 4 }], oracle, { [S2]: ['t.mjs'] });
  const v5 = judgeReads([{ file: 't.mjs', sha: S3, line: 5 }], oracle, { [S3]: ['t.mjs'] });
  ok(v1.fresh.length === 1 && v1.fresh[0].sha === S1 && !v1.stale.length && !v2.fresh.length && !v2.stale.length && v3.stale.length === 1 && v4.stale.length === 1 && v5.ambiguous.length === 1,
    'CONTROL: a NEW off-master read is red; a listed one passes; a ratchet row no longer read is red; a ratchet sha that reached master is red; an AMBIGUOUS short sha is red even when listed («lengthen it», never «off-master»)');
  // the real tree
  const shallow = git(REPO, ['rev-parse', '--is-shallow-repository']) === 'true';
  const reads = fs.readdirSync(path.join(REPO, 'scripts')).filter((f) => f.endsWith('.mjs')).sort()
    .flatMap((f) => historyReadsOf(fs.readFileSync(path.join(REPO, 'scripts', f), 'utf8')).map((r) => ({ file: f, ...r })));
  if (shallow) console.log(`  (§2j NOT JUDGED: a shallow clone cannot tell an ancestor of HEAD — ${reads.length} history reads seen; a full checkout — every lane, the push gate — judges them; nothing is counted here)`);
  else {
    const memo = new Map(), run = (args) => spawnSync('git', ['-C', REPO, ...args], { encoding: 'utf8', env: GIT_ENV });
    const verdictOf = (sha) => {
      if (!memo.has(sha)) {
        const c = run(['rev-parse', '--verify', '--quiet', sha + '^{commit}']);
        if (c.status === 0) memo.set(sha, run(['merge-base', '--is-ancestor', c.stdout.trim(), 'HEAD']).status === 0 ? 'on' : 'off');
        else if ((run(['rev-parse', '--disambiguate=' + sha]).stdout || '').trim().split('\n').filter(Boolean).length > 1) memo.set(sha, 'ambiguous');
        else {
          // B-1388: a BLOB or TREE sha is on master when master's history holds it (a commit of HEAD's that adds or drops it).
          // COST: for one OFF master the walk diffs every commit of HEAD's history before it answers «off» (seconds on this tree,
          // inside this fast part); no read takes this road today (each resolves as a commit; the plants are found early). The
          // day one does, cap the walk here — never drop the check.
          const o = run(['rev-parse', '--verify', '--quiet', sha + '^{object}']), t = o.status === 0 ? (run(['cat-file', '-t', o.stdout.trim()]).stdout || '').trim() : '';
          memo.set(sha, (t === 'blob' || t === 'tree') && (run(['log', '-1', '--format=%H', '--find-object=' + o.stdout.trim(), 'HEAD']).stdout || '').trim() ? 'on' : 'off');
        }
      }
      return memo.get(sha);
    };
    // ONE ASK FOR ALL THE READS' COMMITS (B-54a9, 主开发 r2572 (1)): their shas peeled to commits by ONE cat-file batch (the same
    // «<sha>^{commit}» each rev-parse --verify resolved) and judged against ONE walk of HEAD's history (a commit is an ancestor of HEAD,
    // or HEAD itself, exactly when rev-list HEAD lists it, as merge-base --is-ancestor answers). Each verdict is the one the road above
    // gave, and a sha that does not peel to a commit (missing, ambiguous, a blob or a tree) keeps that road, one by one.
    const batchCommitVerdicts = (root, shas) => {   // → Map sha → 'on' | 'off', for the shas that peel to a commit (the rest: the road above)
      const v = new Map();
      const peel = spawnSync('git', ['-C', root, 'cat-file', '--batch-check=%(objectname) %(objecttype)'], { input: shas.map((x) => x + '^{commit}').join('\n') + '\n', encoding: 'utf8', env: GIT_ENV });
      const walked = spawnSync('git', ['-C', root, 'rev-list', 'HEAD'], { encoding: 'utf8', env: GIT_ENV, maxBuffer: 1 << 28 });
      if (peel.status === 0 && walked.status === 0) {
        const onHead = new Set(walked.stdout.split('\n').filter(Boolean)), out = peel.stdout.split('\n');
        shas.forEach((x, i) => { const m = /^([0-9a-f]{40}) commit$/.exec(out[i] || ''); if (m) v.set(x, onHead.has(m[1]) ? 'on' : 'off'); });
      }
      return v;
    };
    for (const [x, verdict] of batchCommitVerdicts(REPO, [...new Set(reads.map((r) => r.sha))])) memo.set(x, verdict);
    // CONTROL (主开发 r3135 (3)): the batch's «off» — over a scratch repository of the suite's own, a list holding its HEAD, the root it
    // stands on, a commit that is NO ancestor (a side branch) and an absent sha: HEAD and the root on, the side commit OFF, the absent
    // one left to the one-by-one road (a batch that answered «on» for every commit is red here)
    {
      const sr = makeRepo('batch-off');
      const A = commit(sr, 'a.txt', 'a\n', 'the root');
      git(sr, ['checkout', '-q', '-b', 'side']);
      const S = commit(sr, 'b.txt', 'b\n', 'a side commit');
      git(sr, ['checkout', '-q', 'main']);
      const H = commit(sr, 'c.txt', 'c\n', 'HEAD');
      const v = batchCommitVerdicts(sr, [H, A, S, '0'.repeat(40)]);
      ok(v.get(H) === 'on' && v.get(A) === 'on' && v.get(S) === 'off' && !v.has('0'.repeat(40)), `CONTROL (r3135 (3)): the batch over a scratch repository: its HEAD and root ON, a side commit that is no ancestor OFF, an absent sha left to the road one by one (${JSON.stringify(Object.fromEntries([...v].map(([k, x]) => [k.slice(0, 7), x])))})`);
    }
    ok(verdictOf(git(REPO, ['rev-parse', 'HEAD'])) === 'on' && verdictOf('0'.repeat(40)) === 'off', 'the oracle: HEAD is on master; an absent object is off master (a full clone holds every ancestor)');
    const blob = git(REPO, ['rev-parse', 'HEAD:package.json']), tree = git(REPO, ['rev-parse', 'HEAD:scripts/lib']);
    ok(verdictOf(blob) === 'on' && verdictOf(tree) === 'on', `B-1388: a blob (HEAD:package.json ${blob.slice(0, 9)}) and a tree (HEAD:scripts/lib ${tree.slice(0, 9)}) master's history holds are ON master — never the false «off-master» of a commit-only oracle`);
    const ENV_SITES = ['test-discovery-spawn.mjs 9516bd8d', 'test-fixture-isolation.mjs e87d9893', 'test-mount-providers.mjs b48b26ae4'];
    const envSeen = ENV_SITES.filter((x) => { const [f, sha] = x.split(' '); return reads.some((r) => r.file === f && r.sha === sha && r.form.startsWith('binding') && verdictOf(sha) === 'on'); });
    ok(envSeen.length === ENV_SITES.length, `the env-defaulted bindings (process.env.X || '<sha>') are READ and JUDGED on master: ${envSeen.join(' · ')}` + (envSeen.length < ENV_SITES.length ? ` — NOT seen: ${ENV_SITES.filter((x) => !envSeen.includes(x)).join(' · ')}` : ''));
    const { fresh, ambiguous, stale } = judgeReads(reads, verdictOf, READS_OFF_MASTER);
    ok(reads.length > 20 && !fresh.length && !ambiguous.length && !stale.length, `every literal sha a script reads is an ancestor of HEAD — ${reads.length} reads of ${new Set(reads.map((r) => r.sha)).size} shas; the ratchet: ${Object.keys(READS_OFF_MASTER).length} named off-master shas` +
      (fresh.length ? `\n      NEW off-master reads (a lane-branch object exists only where that branch was fetched — the push gate alone would run the leg): ${fresh.map((r) => `${r.file}:${r.line} ${r.sha} (${r.form})`).join(' · ')}` : '') +
      (ambiguous.length ? `\n      AMBIGUOUS in this repo (lengthen it): ${ambiguous.map((r) => `${r.file}:${r.line} ${r.sha}`).join(' · ')}` : '') +
      (stale.length ? `\n      stale ratchet rows (remove them): ${stale.join(' · ')}` : ''));
  }
}
// ── §2k ONE PAGE-TARGET WAITER (B-fcae, lane bl-tests-chrome, 2026-11-18: test-age-badge-chrome «chrome never came up» on the
// hotfix's hosted run — a launch poll whose OWN wait was only on its error road gave up in ~70 ms on a Chrome whose DevTools
// endpoint answered before its page target was listed; 58 copies of that loop in 53 scripts, in six layouts). Every script asks
// the one waiter, scripts/cdp-page-target.mjs (waitPageTarget / waitPageList: a miss ALWAYS waits, each ask bounded, a deadline,
// the browser's exit ends it, the cause SAID), and NO loop anywhere under scripts/ compares something to 'page' with all its own
// waits on its error road — found by the tree (oldPageLoops over acorn), not a spelling. CONTROLS run the same detector: eight
// old shapes (each layout seen, two quote styles, a destructured type, other sleep names, a setTimeout promise, a .catch
// callback, the list kept) ARE found; five correct ones (the waiter, a wait outside the catch, a second wait, a wait in the
// loop's update, a correct nested waiter inside an outer loop) are NOT. The waiter's legs are COUNTS and an injected clock.
console.log('\n§2k one page-target waiter: no loop under scripts/ waits for a page target only on its error road (any layout)');
{
  const acorn = createRequire(import.meta.url)('acorn');
  const { waitPageTarget, waitPageList, oldPageLoops } = await import('./cdp-page-target.mjs');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? (x.name === 'node_modules' ? [] : walk(path.join(d, x.name))) : /\.(mjs|js|cjs)$/.test(x.name) ? [path.join(d, x.name)] : []));
  const files = walk(path.join(REPO, 'scripts')), found = [], unread = [];
  for (const f of files) for (const h of (ONE_PASS.pageLoops.get(f) || oldPageLoops(fs.readFileSync(f, 'utf8'), acorn))) (h.error ? unread : found).push(`${path.relative(REPO, f)}:${h.line}${h.error ? ' ' + h.error.slice(0, 60) : ''}`);
  ok(files.length > 300 && found.length === 0, `no loop under scripts/ waits for a page target only on its error road — ${files.length} scripts walked (subfolders too), ${found.length} carry it${found.length ? ': ' + found.slice(0, 8).join(', ') : ''}`);
  ok(unread.length === 0, `…and every script that quotes 'page' parsed (an unparsable one would hide a loop): ${unread.length ? unread.slice(0, 4).join(', ') : 'all'}`);
  const U = '`http://127.0.0.1:${P}/json`';
  const OLD = {
    'one line': `for (let i = 0; i < 40 && !target; i++) { try { target = (await (await fetch(${U})).json()).find((t) => t.type === 'page'); } catch { await sleep(250); } }`,
    'compact': `for(let i=0;i<40&&!target;i++){try{target=(await(await fetch(${U})).json()).find(t=>t.type==='page');}catch{await sleep(250);}}`,
    'its try on lines': `for (let i = 0; i < 40 && !target; i++) {\n  try {\n    const list = await (await fetch(${U})).json();\n    target = list.find((t) => t.type == "page");\n  } catch { await sleep(250); }\n}`,
    'a destructured type, pause': `for (let i = 0; i < 40 && !target; i++) { try { target = (await (await fetch(${U})).json()).find(({ type }) => type === 'page'); } catch { await pause(250); } }`,
    'while, the url a const, nap': `const u = ${U}; while (!target) { try { const l = await (await fetch(u)).json(); target = l.find((t) => 'page' === t.type); } catch { await nap(200); } }`,
    'a setTimeout promise': `for (let i = 0; i < 40 && !target; i++) { try { target = (await (await fetch(${U})).json()).find((t) => t.type === 'page'); } catch { await new Promise((r) => setTimeout(r, 250)); } }`,
    'a .catch callback': `for (let i = 0; i < 40 && !target; i++) { target = await fetch(${U}).then((r) => r.json()).then((l) => l.find((t) => t.type === 'page')).catch(() => sleep(250)); }`,
    'the list kept': `for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch('http://127.0.0.1:' + P + '/json')).json(); if (l.some((t) => t.type === 'page')) list = l; } catch { await sleep(200); } }`,
  };
  const CURED = {
    'the waiter': `target = await waitPageTarget(P, { polls: 40, everyMs: 250 });`,
    'a wait outside the catch': `for (let i = 0; i < 40 && !target; i++) { try { target = (await (await fetch(${U})).json()).find((t) => t.type === 'page'); } catch { } if (!target) await sleep(250); }`,
    'a second wait': `for (let i = 0; i < 40 && !target; i++) { try { target = (await (await fetch(${U})).json()).find((t) => t.type === 'page'); } catch { await sleep(50); } await pause(200); }`,
    'a wait in the update': `for (let i = 0; i < 40 && !target; i += (await sleep(250)) || 1) { try { target = (await (await fetch(${U})).json()).find((t) => t.type === 'page'); } catch { await sleep(250); } }`,
    'a correct nested waiter': `for (const face of faces) { for (let i = 0; i < 40 && !t; i++) { try { t = (await (await fetch(${U})).json()).find((x) => x.type === 'page'); } catch { } if (!t) await sleep(250); } try { await go(face); } catch { await sleep(100); } }`,
  };
  const seenOld = Object.entries(OLD).map(([k, v]) => [k, oldPageLoops(v, acorn).length]), seenCured = Object.entries(CURED).map(([k, v]) => [k, oldPageLoops(v, acorn).length]);
  // THE ONE PASS (主开发 r3135 (2)): over this section's planted texts the pass's road gives oldPageLoops the answer its own parse gives
  const passK = Object.entries({ ...OLD, ...CURED }).filter(([, v]) => JSON.stringify(ONE_PASS.perFile(v).pageLoops) !== JSON.stringify(oldPageLoops(v, acorn))).map(([k]) => k);
  ok(!passK.length && Object.values(OLD).every((v) => ONE_PASS.perFile(v).pageLoops.length > 0), `THE ONE PASS (r3135 (2)): over this section's planted texts the pass hands oldPageLoops what its own parse gives — each old form found through it too${passK.length ? ' — DIFFERS: ' + passK.join(', ') : ''}`);
  ok(seenOld.every(([, n]) => n === 1), `CONTROLS: each old shape, planted, is FOUND by the tree (${seenOld.map(([k, n]) => `${k} ${n}`).join(' · ')})`);
  ok(seenCured.every(([, n]) => n === 0), `CONTROLS: the correct shapes are NOT found (${seenCured.map(([k, n]) => `${k} ${n}`).join(' · ')})`);
  const stub = (pageAt, die = 0) => { let asks = 0; return { list: async () => { ++asks; if (die && asks >= die) throw new Error('refused'); return asks >= pageAt ? [{ type: 'browser' }, { type: 'page', id: 'p1' }] : [{ type: 'browser' }]; }, asks: () => asks }; };
  const s1 = stub(4); let naps = 0;
  const t = await waitPageTarget(0, { polls: 10, everyMs: 1, list: s1.list, sleep: async () => { naps++; }, quiet: true });
  ok(!!t && t.id === 'p1' && s1.asks() === 4 && naps === 3, `the waiter asks until the page is listed and WAITS after every page-less answer (asks ${s1.asks()}, waits ${naps}: three misses, three waits)`);
  const s2 = stub(99, 3); let naps2 = 0;
  const none = await waitPageTarget(0, { polls: 5, everyMs: 1, list: s2.list, sleep: async () => { naps2++; }, quiet: true });
  ok(none === null && s2.asks() === 5 && naps2 === 4 && /did not answer/.test(String(waitPageTarget.lastSeen)), `…at its bound it answers null after five asks and four waits (none after the last), saying what the LAST ask saw («${waitPageTarget.lastSeen}»)`);
  const s3 = stub(2); const dead = { exitCode: 1, signalCode: null };
  const gone = await waitPageList(0, { polls: 10, everyMs: 1, list: s3.list, sleep: async () => {}, child: dead, quiet: true });
  ok(gone === null && s3.asks() === 0 && /exited/.test(String(waitPageList.lastSeen)), `…a browser that EXITED ends the wait at once, asking nothing («${waitPageList.lastSeen}»)`);
  const s4 = stub(99); let clock = 0;
  const late = await waitPageTarget(0, { polls: 80, everyMs: 200, deadlineMs: 1000, list: async () => { clock += 300; return s4.list(); }, sleep: async (ms) => { clock += ms; }, now: () => clock, quiet: true });
  ok(late === null && s4.asks() === 2 && /deadline/.test(String(waitPageTarget.lastSeen)), `…and a DEADLINE ends it whatever the polls left: an endpoint that takes 300 ms an ask, 200 ms between, a 1000 ms deadline ⇒ ${s4.asks()} asks of 80 (an injected clock, no wall time)`);
  const s5 = stub(1); const l5 = await waitPageList(0, { polls: 3, everyMs: 1, list: s5.list, sleep: async () => {}, quiet: true });
  ok(Array.isArray(l5) && l5.length === 2, 'waitPageList answers the WHOLE list once it holds a page (the callers that read other targets too)');
}

// ── §2l ONE RELAY OF A BROADCAST (主开发 2026-11-20 04:54Z, lane bl-tests-chrome — 2.369.413's fourth hosted run:
// test-channel-window-render ⑫c walked the page's LIVE handler list; a stale handler that took itself out shifted the list and
// the open access picker's handler right after it was skipped — eight legs red, the product right: src/lib/ws.js dispatches over
// a snapshot). A suite plays a server broadcast through scratch.mjs relayBroadcastJs ONLY: one message, a snapshot, each
// handler isolated, a throw SAID as ws.js says it. THE CONTROL (once, here): the helper's own page code run against a stand-in
// list reaches the handler after a self-removing one; the LIVE walk over the same plant skips it (the plant is real). TWO
// CENSUSES over every script under scripts/: LIVE (the bug: a for…of over the list or a forEach / some / every / map on it,
// the list written plain, in parentheses, with an «|| []» / «?? []» fallback, with ?. on its path; a .map only when its callback
// CALLS the handler — a .map that wraps each handler into a new list is no relay) and COPY (the law's second
// half: a relay over the suite's own spread or slice of the list instead of the one helper). Every spelling is a planted
// control. KNOWN BLIND SPOTS (said, not hidden): an alias of the list (const hs = app.ws.globalHandlers; for (… of hs)), an
// index loop (for (let i = 0; i < …globalHandlers.length; i++)) and a while loop — a person writing those meets the review,
// not this census. The shapes are built from pieces, so this file carries none itself.
console.log('\n§2l one relay of a broadcast: every suite hands a server message to the page through ONE helper, over a snapshot');
{
  const t0 = Date.now();
  const relayRun = (code) => { const hs = []; let reached = 0, seen = [], said = 0, self = null; self = () => { const i = hs.indexOf(self); if (i >= 0) hs.splice(i, 1); }; hs.push(self, (m) => { reached++; seen.push(m); }, () => { throw new Error('a throwing handler'); }, (m) => { seen.push(m); }); const console = { error: (...a) => { if (String(a[0]).includes('handler error')) said++; } }; new Function('window', 'console', code)({ app: { ws: { globalHandlers: hs } } }, console); return { reached, sameMsg: seen.length === 2 && seen[0] === seen[1], selfGone: !hs.includes(self), said }; };
  const viaHelper = relayRun(relayBroadcastJs("{ type: 'vs-relay-probe' }"));
  ok(viaHelper.reached === 1 && viaHelper.sameMsg && viaHelper.selfGone && viaHelper.said === 1, `relayBroadcastJs reaches the handler after one that takes itself out, hands ONE message to all, and a throwing handler stops nothing and is SAID like ws.js says it (${JSON.stringify(viaHelper)})`);
  const G = ['window', 'app', 'ws', 'globalHandlers'].join('.'), GO = ['window', 'app?', 'ws?', 'globalHandlers'].join('.'), GA = ['app', 'ws', 'globalHandlers'].join('.');
  const liveWalk = 'for (const fn of ' + G + ') { try { fn({ type: "vs-relay-probe" }); } catch (e) {} }';
  const viaLive = relayRun(liveWalk);
  ok(viaLive.reached === 0, `CONTROL: the LIVE walk over the same plant SKIPS that handler (reached ${viaLive.reached}) — the plant is real`);
  const PATH = '(?:window\\??\\.)?app\\??\\.ws\\??\\.' + 'globalHandlers';
  const LIST = '\\(?\\s*' + PATH + '\\s*(?:(?:\\|\\||\\?\\?)\\s*\\[\\s*\\])?\\s*\\)?';
  const CALLS = '\\(\\s*\\(?\\s*([\\w$]+)\\s*\\)?\\s*=>\\s*(?:\\{\\s*(?:try\\s*\\{\\s*)?)?\\1\\s*\\(';   // a callback that calls its handler at once
  const LIVE_WALK = new RegExp('for\\s*\\(\\s*(?:const|let|var)\\s+[\\w$]+\\s+of\\s+' + LIST + '\\s*\\)|' + LIST + '\\s*\\??\\.\\s*(?:forEach|some|every)\\s*\\(|' + LIST + '\\s*\\??\\.\\s*map\\s*' + CALLS, 'g');
  const COPY_WALK = new RegExp('for\\s*\\(\\s*(?:const|let|var)\\s+[\\w$]+\\s+of\\s+(?:\\[\\s*\\.\\.\\.\\s*' + LIST + '\\s*\\]|' + LIST + '\\s*\\.slice\\(\\s*\\))\\s*\\)|(?:\\[\\s*\\.\\.\\.\\s*' + LIST + '\\s*\\]|' + LIST + '\\s*\\.slice\\(\\s*\\))\\s*\\.\\s*(?:forEach|some|every|map)\\s*\\(', 'g');
  const count = (re, t) => (t.match(re) || []).length;
  const LIVE_PLANTS = { 'a for…of': liveWalk, 'without window, let': 'for (let h of ' + GA + ') h(m);', 'in parentheses with || []': 'for (const h of (' + G + ' || [])) h(m);', 'with ?? []': 'for (const h of (' + G + ' ?? [])) h(m);', 'optional chaining': 'for (const h of ' + GO + ') h(m);', 'its .forEach': G + '.forEach((h) => h(m));', 'its .some': G + '.some((h) => { h(m); return false; });', 'its .every': '(' + G + ' || []).every((h) => (h(m), true));', 'its .map': G + '?.map((h) => h(m));' };
  const COPY_PLANTS = { 'a spread for…of': 'for (const h of [...' + G + ']) h(m);', 'a slice for…of': 'for (const h of ' + GA + '.slice()) h(m);', 'a spread .forEach': '[...' + G + '].forEach((h) => h(m));', 'a slice .forEach': G + '.slice().forEach((h) => h(m));' };
  const CLEAN = { 'the helper, as a suite writes it': '${' + 'relayBroadcastJs(`m`, ' + "'" + G + "'" + ')}', 'a .map that wraps each handler': GA + ' = ' + GA + '.map((h) => (m) => h(m));', 'a handler count': 'return ' + G + '.length;', 'a set of the handlers': 'new Set(' + G + ')', 'a filter for the new ones': G + '.filter((h) => !old.has(h))' };
  const seen = (plants) => Object.entries(plants).map(([k, v]) => [k, count(LIVE_WALK, v), count(COPY_WALK, v)]);
  const L = seen(LIVE_PLANTS), C = seen(COPY_PLANTS), K = seen(CLEAN);
  ok(L.every(([, l, c]) => l === 1 && c === 0), `CONTROLS: the LIVE census finds each live spelling, once, and the COPY census none of them (${L.map(([k, l]) => `${k} ${l}`).join(' · ')})`);
  ok(C.every(([, l, c]) => l === 0 && c === 1), `CONTROLS: the COPY census finds each per-site copy, once, and the LIVE census none of them (${C.map(([k, , c]) => `${k} ${c}`).join(' · ')})`);
  ok(K.every(([, l, c]) => l === 0 && c === 0), `CONTROLS: neither finds the helper or a read that relays nothing (${K.map(([k, l, c]) => `${k} ${l}/${c}`).join(' · ')})`);
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? (x.name === 'node_modules' ? [] : walk(path.join(d, x.name))) : /\.(mjs|js|cjs)$/.test(x.name) ? [path.join(d, x.name)] : []));
  const files = walk(path.join(REPO, 'scripts')), live = [], copy = [];
  for (const f of files) {
    const t = fs.readFileSync(f, 'utf8'), at = (m) => `${path.relative(REPO, f)}:${t.slice(0, m.index).split('\n').length}`;
    if (!t.includes('globalHandlers')) continue;   // only a file that names the list can walk it
    for (const m of t.matchAll(LIVE_WALK)) live.push(at(m));
    if (path.basename(f) !== 'scratch.mjs') for (const m of t.matchAll(COPY_WALK)) copy.push(at(m));
  }
  ok(files.length > 300 && live.length === 0, `no script under scripts/ walks a page's global handler list LIVE — ${files.length} scripts read, ${live.length} walk it${live.length ? ': ' + live.slice(0, 8).join(', ') : ''} (relay through scratch.mjs relayBroadcastJs)`);
  ok(copy.length === 0, `…and none relays over a COPY of its own at the call site (the one helper holds the snapshot) — ${copy.length}${copy.length ? ': ' + copy.slice(0, 8).join(', ') : ''}`);
  console.log(`  (§2l read ${files.length} scripts in ${Date.now() - t0} ms)`);
}

// ── §2m THE ONE PAGE LOAD (B-1217 member 13, lane lg-leak-census, 主开发 r434 / r443 2026-11-20 — hosted run 44786427248:
// test-foryou-honest-chrome «page threw: ReferenceError: app is not defined», red then green; placed by
// the coordinator's readers). Twelve suites loaded the app with one copied shape: navigate, an UNCHECKED wait for window.app
// (the old document can answer it before the navigation commits, and its timeout was swallowed), then a bare evaluate of app.ready,
// which could land in a document whose boot had not run. They ask scripts/cdp-page-load.mjs loadPage now: the wait is tied to the
// navigation's own loader, the old document is marked, and a timeout is a NAMED red. THE CENSUS (oldAppWaits over acorn, every
// script under scripts/): the old shape outside its NAMED DEBT rows is red by name; each debt row is exact (a cure lowers its row in
// the same commit). THE HELPER over a FAKE PAGE (node:vm documents, an injected clock: no Chrome, no wall time): the old document
// answering first is never taken, by the loader and by the mark alone; a commit that never comes, a failed navigation, a
// same-document navigation and a dead page are named; RED CONTROL: the copied helper's own steps over the same fake throw the
// hosted ReferenceError (its wait renamed, so this file carries no old shape for the census to read).
// cdp-protocol-under-test — §2m's 'Page.navigate' literals are CDP MESSAGES to a FAKE page (node:vm documents), never a page of
// VibeSpace's: test-architecture §47's onboarding rule has no wizard to judge here (test-browser-windows declares the same)
console.log('\n§2m one page load: a suite waits for the NEW document\'s app, tied to its navigation — the old shape is red by name');
{
  const acorn = createRequire(import.meta.url)('acorn');
  const vm = await import('node:vm');
  const { loadPage, afterNavigation, oldAppWaits, APP_BOOTED, LOAD_MARK } = await import('./cdp-page-load.mjs');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? (x.name === 'node_modules' ? [] : walk(path.join(d, x.name))) : /\.(mjs|js|cjs)$/.test(x.name) ? [path.join(d, x.name)] : []));
  const files = walk(path.join(REPO, 'scripts')), found = new Map(), unread = [];
  for (const f of files) for (const h of (ONE_PASS.appWaits.get(f) || oldAppWaits(fs.readFileSync(f, 'utf8'), acorn))) { const k = path.relative(REPO, f); if (h.error) unread.push(`${k} ${h.error.slice(0, 60)}`); else found.set(k, [...(found.get(k) || []), h.line]); }
  // THE NAMED DEBT: 0 since unit 2 (B-1217 (13), 2026-11-20). Each site was READ: a navigation the suite starts goes through
  // loadPage / afterNavigation; a page the suite has SEEN land, or one that may stay the same document (a cache restore, a HELD
  // reload), keeps its own wait CHECKED (test-mobile-back-chrome settle(): a timeout is a named red) — said in that suite, no row
  // here. A new old shape needs a row with its count and why, or the cure.
  const DEBT = {};
  const sites = [...found.values()].reduce((a, l) => a + l.length, 0), owed = Object.values(DEBT).reduce((a, [n]) => a + n, 0);
  const over = [...found].filter(([f, l]) => !DEBT[f] || l.length !== DEBT[f][0]).map(([f, l]) => `${f} line ${l.join(', ')} (its debt row: ${DEBT[f] ? DEBT[f][0] : 'none'})`);
  const stale = Object.keys(DEBT).filter((f) => !found.has(f));
  ok(files.length > 300 && over.length === 0 && stale.length === 0,
    `no script carries the old load shape beyond its named debt — ${files.length} scripts walked, ${sites} site(s): ${[...found].map(([f, l]) => `${path.basename(f)} ${l.join('/')}`).join(' · ') || 'none'}; debt ${owed} in ${Object.keys(DEBT).length} file(s)${over.length ? ' — RED: ' + over.join('; ') : ''}${stale.length ? ' — a debt row whose file is cured (lower it): ' + stale.join(', ') : ''}`);
  ok(Object.values(DEBT).every(([n, why]) => n > 0 && why.length > 20), `…each debt row names its count and why (${Object.keys(DEBT).length ? Object.entries(DEBT).map(([f, [n]]) => `${path.basename(f)} ${n}`).join(' · ') : 'none left: unit 2 cured the five sites in four files'})`);
  ok(unread.length === 0, `…and every script that names window.app parsed (an unparsable one would hide the shape): ${unread.length ? unread.slice(0, 4).join(', ') : 'all'}`);
  const OLD = {
    'the copied load': "const load = async () => { await cdp('Page.navigate', { url: U }); await waitFor('!!(window.app && app.ready)', 30000); await evalJs('app.ready.then(() => true)'); };",
    'on its own lines, templates': "async function boot() {\n  await cdp('Page.navigate', { url: U });\n  await waitFor(`!!(window.app && app.ready)`, 20000);\n  await evalJs(`app.ready.then(() => true)`);\n}",
    'a member wait, another read': "await page.waitForApp('!!window.app', 9000); await page.evaluate('app.wm.windows.size');",
    'in a switch case': "switch (k) { case 1: await waitFor('!!window.app'); await evalJs('app.ready'); break; }",
  };
  const CURED = {
    'the one page load': "await loadPage(cdp, U); await evalJs('app.ready.then(() => true)');",
    'a checked wait': "if (!(await waitFor('!!(window.app && app.ready)', 30000))) throw new Error('never booted'); await evalJs('app.ready.then(() => true)');",
    'a wait kept': "const booted = await waitFor('!!(window.app && app.ready)', 12000); await evalJs('app.ready.then(() => true)');",
    'a guarded read next': "await waitFor('!!window.app', 20000); await evalJs('window.app && app.ready');",
    'a wait for something else': "await waitFor('!!document.body', 20000); await evalJs('app.ready.then(() => true)');",
  };
  const seenOld = Object.entries(OLD).map(([k, v]) => [k, oldAppWaits(v, acorn).length]), seenCured = Object.entries(CURED).map(([k, v]) => [k, oldAppWaits(v, acorn).length]);
  // THE ONE PASS (主开发 r3135 (2)): over this section's planted texts the pass's road gives oldAppWaits the answer its own parse gives
  const passM = Object.entries({ ...OLD, ...CURED }).filter(([, v]) => JSON.stringify(ONE_PASS.perFile(v).appWaits) !== JSON.stringify(oldAppWaits(v, acorn))).map(([k]) => k);
  ok(!passM.length && Object.values(OLD).every((v) => ONE_PASS.perFile(v).appWaits.length > 0), `THE ONE PASS (r3135 (2)): over this section's planted texts the pass hands oldAppWaits what its own parse gives — each old form found through it too${passM.length ? ' — DIFFERS: ' + passM.join(', ') : ''}`);
  ok(seenOld.every(([, n]) => n === 1), `CONTROLS: each old shape, planted, is FOUND by the tree (${seenOld.map(([k, n]) => `${k} ${n}`).join(' · ')})`);
  ok(seenCured.every(([, n]) => n === 0), `CONTROLS: the correct shapes are NOT found (${seenCured.map(([k, n]) => `${k} ${n}`).join(' · ')})`);

  // A FAKE PAGE: each document is a node:vm context whose window is itself; `app` appears when the document boots. Every CDP ask is
  // one tick: a navigation commits `commitAfter` ticks after its navigate, its app boots `bootAfter` ticks after the commit.
  const fakePage = ({ commitAfter = 3, bootAfter = 2, errorText = null, sameDoc = false, neverCommit = false, lyingTree = false, deadAt = 0, markFails = false } = {}) => {
    let ticks = 0, pending = null, newLoader = null;
    const mkDoc = (loader, booted) => { const ctx = vm.createContext({}); ctx.window = ctx; if (booted) ctx.app = { ready: Promise.resolve(true) }; return { loader, ctx, bootsAt: Infinity }; };
    let doc = mkDoc('L-old', true);   // the document before the navigation: its app booted long ago
    const asked = [];
    const call = async (method, params = {}) => {
      ticks++; asked.push(method);
      if (deadAt && ticks >= deadAt) throw new Error(`cdp ${method}: no answer in 45000 ms`);
      if (markFails && method === 'Runtime.evaluate' && String(params.expression).includes(`window.${LOAD_MARK} = `)) throw new Error('Runtime.evaluate: Execution context was destroyed.');
      if (pending && ticks >= pending.commitAt) { doc = pending.doc; doc.bootsAt = ticks + bootAfter; pending = null; }
      if (doc.bootsAt <= ticks && !doc.ctx.app) doc.ctx.app = { ready: Promise.resolve(true) };
      if (method === 'Page.navigate') {
        if (errorText) return { frameId: 'F', errorText };
        if (sameDoc) return { frameId: 'F' };
        newLoader = `L-new-${ticks}`; if (!neverCommit) pending = { doc: mkDoc(newLoader, false), commitAt: ticks + commitAfter };
        return { frameId: 'F', loaderId: newLoader };
      }
      if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'F', loaderId: lyingTree && newLoader ? newLoader : doc.loader } } };
      if (method === 'Runtime.evaluate') {
        try { let v = vm.runInContext(params.expression, doc.ctx); if (params.awaitPromise && v && typeof v.then === 'function') v = await v; return { result: { type: typeof v, value: v } }; }
        catch (e) { return { result: { type: 'object' }, exceptionDetails: { text: 'Uncaught', exception: { description: `${e.name}: ${e.message}` } } }; }
      }
      return {};
    };
    return { call, asked, doc: () => doc, ticks: () => ticks };
  };
  const clock = () => { let t = 0; return { now: () => t, sleep: async (ms) => { t += ms; } }; };
  const U = 'http://127.0.0.1:1/';
  const tryLoad = async (fake, opts = {}) => { const c = clock(); try { return { ok: await loadPage(fake.call, U, { ...c, ...opts }), tookMs: c.now() }; } catch (e) { return { err: e, tookMs: c.now() }; } };
  // (1) the old document answers the boot test until the commit: loadPage takes only the new one
  const f1 = fakePage({ commitAfter: 4, bootAfter: 3 }), r1 = await tryLoad(f1);
  ok(r1.ok && f1.doc().loader.startsWith('L-new') && !!f1.doc().ctx.app && f1.doc().ctx[LOAD_MARK] === undefined && r1.ok.asks > 1,
    `the old document's answer is never taken: loadPage returned only once the navigation's own document booted (loader ${f1.doc().loader}, ${r1.ok ? r1.ok.asks : '?'} ask(s), ${r1.tookMs} ms on the injected clock; the asks: ${f1.asked.join(' ')})${r1.err ? ' — threw: ' + r1.err.message : ''}`);
  // (1b) THE MARK ALONE: a frame tree that names the new loader before the commit (a lying answer) — the old document carries the mark
  const f1b = fakePage({ commitAfter: 4, bootAfter: 2, lyingTree: true }), r1b = await tryLoad(f1b);
  ok(r1b.ok && f1b.doc().loader.startsWith('L-new') && !!f1b.doc().ctx.app, `…and by the mark alone: with a frame tree that names the new loader before the commit, the old (marked) document is still never taken (${r1b.ok ? r1b.ok.asks : '?'} ask(s))${r1b.err ? ' — threw: ' + r1b.err.message : ''}`);
  // (2) a commit that never comes: a NAMED red at the bound, on the clock that schedules the polls
  const f2 = fakePage({ neverCommit: true }), r2 = await tryLoad(f2, { bootMs: 3000, everyMs: 150 });
  ok(!!r2.err && /the app never booted in 3 s after the navigation to http:\/\/127\.0\.0\.1:1\/ — last seen: the old document still answers/.test(r2.err.message) && r2.tookMs >= 3000 && r2.tookMs < 3300,
    `a navigation that never commits is a NAMED red at its bound («${r2.err ? r2.err.message.slice(0, 170) : 'no error'}», at ${r2.tookMs} ms on the injected clock) — never a later ReferenceError`);
  // (3) a failed navigation, (4) a same-document navigation (no new loader: the marked document stays)
  const r3 = await tryLoad(fakePage({ errorText: 'net::ERR_CONNECTION_REFUSED' }));
  ok(!!r3.err && /the navigation to http:\/\/127\.0\.0\.1:1\/ failed \(net::ERR_CONNECTION_REFUSED\)/.test(r3.err.message) && r3.tookMs === 0, `a failed navigation is named at once («${r3.err ? r3.err.message.slice(0, 120) : 'no error'}»)`);
  const r4 = await tryLoad(fakePage({ sameDoc: true }), { bootMs: 1500 });
  ok(!!r4.err && /never booted in 2 s .* no new document has booted yet \(the old one carries the mark\)/.test(r4.err.message), `a navigation that makes no new document is named, not taken from the old one («${r4.err ? r4.err.message.slice(0, 170) : 'no error'}»)`);
  // (5) a dead page ends the wait at once through the caller's own rule (test-phone-titlebar-ui's deadPage)
  const f5 = fakePage({ neverCommit: true, deadAt: 4 }), r5 = await tryLoad(f5, { fatal: (e) => /no answer in/.test(e.message) });
  ok(!!r5.err && /^cdp Page\.getFrameTree: no answer in/.test(r5.err.message) && f5.ticks() === 4, `a dead page ends the wait at once through the caller's fatal rule («${r5.err ? r5.err.message : 'no error'}», ${f5.ticks()} asks)`);
  // (6) afterNavigation — a navigation the PAGE makes (unit 2): the act starts it, the old document is marked BEFORE the act, and
  // only the new one's boot counts (no loader is known: the mark alone ties the wait)
  const tryAfter = async (fake, opts = {}) => { const c = clock(); try { return { ok: await afterNavigation(fake.call, () => fake.call('Page.navigate', { url: U }), { ...c, ...opts }), tookMs: c.now() }; } catch (e) { return { err: e, tookMs: c.now() }; } };
  const f6 = fakePage({ commitAfter: 4, bootAfter: 3 }), r6 = await tryAfter(f6, { what: 'after location.href (a fake)' });
  ok(r6.ok && f6.doc().loader.startsWith('L-new') && !!f6.doc().ctx.app && f6.doc().ctx[LOAD_MARK] === undefined && r6.ok.loaderId === null,
    `afterNavigation: the old document's answer is never taken — it returned once the act's new document booted (${r6.ok ? r6.ok.asks : '?'} ask(s), by the mark alone: no loader)${r6.err ? ' — threw: ' + r6.err.message : ''}`);
  const r7 = await tryAfter(fakePage({ sameDoc: true }), { bootMs: 1500, what: 'after a hash change (a fake)' });
  ok(!!r7.err && /^afterNavigation: the app never booted in 2 s after a hash change \(a fake\) — last seen: no new document has booted yet \(the old one carries the mark\)/.test(r7.err.message),
    `…an act that makes no new document (a hash, a cache restore) is NAMED at its bound, never taken from the marked one («${r7.err ? r7.err.message.slice(0, 170) : 'no error'}») — such a site keeps its own wait`);
  // (6b) the round wes858b0x's should: a mark that cannot be set leaves afterNavigation NOTHING to tie its wait to — a named red,
  // and the act is never started (loadPage keeps the loader, so its mark's failure is not one)
  const f6b = fakePage({ markFails: true }), r6b = await tryAfter(f6b, { what: 'after location.href (a fake)', fatal: undefined });
  ok(!!r6b.err && /^afterNavigation: the old document could not be marked after location\.href \(a fake\) — the mark's ask failed: Runtime\.evaluate: Execution context was destroyed/.test(r6b.err.message) && !f6b.asked.includes('Page.navigate'),
    `afterNavigation: a mark that cannot be set is a NAMED red and the act never runs («${r6b.err ? r6b.err.message.slice(0, 160) : 'no error'}»; asks: ${f6b.asked.join(' ')}) — and an option passed as undefined (fatal) keeps its default`);
  const r6c = await tryLoad(fakePage({ markFails: true, commitAfter: 2, bootAfter: 2 }));
  ok(!!r6c.ok, `…loadPage over the same failed mark still loads, tied by the loader alone (${r6c.ok ? r6c.ok.asks + ' ask(s)' : r6c.err.message})`);
  // RED CONTROL (unit 2): the old settle's own steps after a page-led navigation (the act, an unchecked wait, a bare evaluate)
  const fc2 = fakePage({ commitAfter: 2, bootAfter: 3 }), cc2 = clock();
  let red2 = null; try { await fc2.call('Page.navigate', { url: U }); const e1 = await fc2.call('Runtime.evaluate', { expression: APP_BOOTED, returnByValue: true }); const e2 = await fc2.call('Runtime.evaluate', { expression: 'app.ready.then(() => true)', awaitPromise: true, returnByValue: true }); if (e2.exceptionDetails) throw new Error('page threw: ' + e2.exceptionDetails.exception.description); red2 = e1; } catch (e) { red2 = e; }
  const r8 = await tryAfter(fakePage({ commitAfter: 2, bootAfter: 3 }));
  ok(red2 instanceof Error && red2.message === 'page threw: ReferenceError: app is not defined' && !!r8.ok && cc2.now() === 0,
    `RED CONTROL (unit 2): the old settle after a page-led navigation throws the same red over the same fake («${red2 instanceof Error ? red2.message : 'it did not throw'}»: the old document answered, the bare evaluate met the new one before its boot); afterNavigation over it is green (${r8.ok ? r8.ok.asks + ' ask(s)' : r8.err.message})`);
  // RED CONTROL: the copied helper's own steps (navigate, an unchecked wait, a bare evaluate) over the same fake as (1)
  const copied = async (call, url, { now, sleep }) => {
    const evalJs = async (expr) => { const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
    const pollFor = async (expr, ms) => { const t0 = now(); while (now() - t0 < ms) { try { if (await evalJs(expr)) return true; } catch { } await sleep(150); } try { return await evalJs(expr); } catch { return false; } };
    await call('Page.navigate', { url });
    const booted = await pollFor(APP_BOOTED, 30000);   // the copy dropped this value; kept here only so this file holds no old shape
    await evalJs('app.ready.then(() => true)');
    return booted;
  };
  const fc = fakePage({ commitAfter: 2, bootAfter: 3 }), cc = clock();
  let red = null; try { await copied(fc.call, U, cc); } catch (e) { red = e; }
  const fl = fakePage({ commitAfter: 2, bootAfter: 3 }), rl = await tryLoad(fl);
  ok(!!red && red.message === 'page threw: ReferenceError: app is not defined' && !!rl.ok,
    `RED CONTROL: the copied load over the same fake throws the hosted red («${red ? red.message : 'it did not throw'}»: the old document answered the wait, the bare evaluate landed in the new one before its boot); loadPage over it is green (${rl.ok ? rl.ok.asks + ' ask(s)' : rl.err.message})`);
}
// ── §2o A PICTURE IS OF THE PAGE IN FRONT (主开发 r1109, 2026-11-21, lane bl-tests-chrome — the class of 2.369.414's mirror
// red: test-oat-mint-ui's A.shot('code.png') timed out at 30 s on a BACKGROUND tab, page B having been opened in front of it).
// THE SHAPE, named by a read of the text: a script that opens a SECOND page (two of /json/new or Target.createTarget, or one
// beside the launch's own first tab) and captures with no bring-to-front at its capture (bringToFront / toFront( /
// activateTarget / .front() within the capture's own six lines). The shape is not the fault: a capture of the NEWEST page,
// of a page in a window or a browser of its own, or after the other page closed, is of the page in front. So EVERY named
// script carries a READ verdict below, and each verdict names an ANCHOR (its reason's own text), which must still stand in
// that script, or the verdict is red. «REAL» = its capture can be of a page behind another: named here by name every run (the
// cure owed, each its own small unit on 主开发's word — a fast-tier red would hold every lane). A script newly named and not
// read is red by name; a verdict for a script no longer named goes (a cured one's row). This file is not walked (its
// controls carry the shape). THE PAGE FACTORY (主开发 r1354, lane bl-tests-e — the blind spot that hid EIGHT suites, and three
// of the first reads were wrong): ONE /json/new or createTarget inside a function the script CALLS more than once (its newPage() /
// page()) opens a second page as surely as two in the text — named too. KNOWN BLIND SPOTS (said): a capture wrapped in a helper
// whose front call sits more than six lines above it (test-mobile-select's threw-path picture hid so — cured by r1354 all the
// same); a page opened by a helper of ANOTHER file; a tab the product opens itself (window.open not stubbed); and of the factory
// rule (its fresh read): ONE call site in a loop or a map that keeps several pages open; a factory that is not async; a function
// written `name (` with a space; an async closure defined between the factory's head and its page-opening line (the nearest wins).
console.log('\n§2o a picture is of the page in front: every script that opens a second page and captures with no bring-to-front is read, by name');
{
  const t0 = Date.now();
  const CAP = ['Page', 'captureScreenshot'].join('.'), NEWP = '/json/' + 'new', CT = ['Target', 'createTarget'].join('.');
  const FIRST = new RegExp('\\.(?:find|filter)\\(\\(?\\s*(\\w+)\\s*\\)?\\s*=>\\s*\\1\\.type === \'page\'\\)|' + ['waitPage', 'List\\('].join('') + '|' + ['cdpPage', 'Target\\('].join(''));
  const FRONTED = new RegExp([['bringTo', 'Front'].join(''), ['to', 'Front\\('].join(''), ['activate', 'Target'].join(''), '\\.front\\(\\)', ['front', 'Shot\\('].join('')].join('|'));   // frontShot( = scripts/cdp-front-shot.mjs, the ONE helper
  // THE PAGE FACTORY (r1354): the function around a page-opening line (the nearest `async function NAME(` / `const NAME = async`
  // within 40 lines above it) and how often the script calls it — two calls are two pages
  const FACTORY_DEF = /(async\s+function\s+(\w+)\s*\(|(?:const|let)\s+(\w+)\s*=\s*async\b)/;
  const factoryCalls = (L, body) => {
    let most = 0;
    L.forEach((l, i) => {
      if (!l.includes(NEWP) && !l.includes(CT)) return;
      for (let j = i; j >= Math.max(0, i - 40); j--) {
        const m = FACTORY_DEF.exec(L[j]);
        if (!m) continue;
        most = Math.max(most, body.split(new RegExp('\\b' + (m[2] || m[3]) + '\\(')).length - 1 - (m[2] ? 1 : 0));
        break;
      }
    });
    return most;
  };
  const backgroundShape = (t) => {
    if (!t.includes(CAP)) return null;
    const L = t.split('\n').map((l) => (/^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l)), body = L.join('\n');
    const news = body.split(NEWP).length - 1 + body.split(CT).length - 1, first = FIRST.test(body), factory = factoryCalls(L, body);
    if (!(news >= 2 || (news >= 1 && first) || factory >= 2)) return null;
    const bare = [];
    L.forEach((l, i) => { if (l.includes(CAP) && !FRONTED.test(L.slice(Math.max(0, i - 6), i + 1).join('\n'))) bare.push(i + 1); });
    return bare.length ? { news, first, factory, bare } : null;
  };
  // THE READ VERDICTS (2026-11-21, every named script read: which page each capture is of, and what is in front then)
  const OWN_WINDOW = 'its further pages open in windows of their own (Target.createTarget newWindow: true): each window keeps its own front tab';
  const VERDICTS = {
    'scripts/test-claude-steer-chrome.mjs': ['front', 'its shots 1–5 come before its second tab opens (openTab, ⑦; open() draws a window in the SAME page) and shots 6–8 after that tab\'s close(), which brings the main page back to the front (r1125: the r1109 read «REAL» was wrong)', "try { await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${t.id}`); } catch { } await cdp('Page.bringToFront'); } };"],
    'scripts/measure-browser-windows.mjs': ['front', 'a measurement script, not a suite: it times a capture of a background tab ON PURPOSE (its own step list)', "Page.captureScreenshot's time on a background tab"],
    'scripts/test-app-display-secrets-chrome.mjs': ['front', 'it captures the tab it has just created (Target.createTarget, then that session\'s capture): the newest, in front', 'const { targetId } = (await b.send(\'Target.createTarget\', { url: `file://${tmp}/menu.html` })).result;'],
    'scripts/test-browser-human-ui.mjs': ['front', OWN_WINDOW, 'newWindow: true'],
    'scripts/test-browser-live-fit.mjs': ['front', 'census(Dk) runs before the phone page opens; census(Ph) captures the phone page, the newest', "const c4 = await census(Ph, canvasSel(s2.sessionId), 'phone');"],
    'scripts/test-browser-live.mjs': ['front', 'its capture is of its own client Chrome (launchChrome: one page); the createTargets are the agent browser\'s (raw), another Chrome', 'const ch5 = await launchChrome('],
    'scripts/test-browser-mediation.mjs': ['front', 'no browser: its captures and createTargets are protocol rows the pure judge reads', 'createTarget: the measured Chrome ordering (targetCreated BEFORE the reply)'],
    'scripts/test-browser-passkey-ui.mjs': ['front', 'its pictures are of its own Chrome (startChrome ui), of the tab it created there; the other createTarget is in the agent\'s Chrome', "const UWS = await startChrome(path.join(ROOT, 'ui')"],
    'scripts/test-browser-site-reset.mjs': ['front', 'no real browser: a stand-in CDP endpoint of its own answers its capture', "case 'Page.captureScreenshot': if (b.shotHang) return undefined;"],
    'scripts/test-browser-x-picture.mjs': ['front', 'the viewer opens in a window of its own (newWindow: true); the agent\'s page is in the agent\'s own Chrome', "const createdId = (await bcall('Target.createTarget', { url: 'about:blank', newWindow: true })).result.targetId;"],
    'scripts/test-chat-needs-strip-chrome.mjs': ['front', 'every capture after page B opens follows the call site\'s own A.front() / B.front()', 'await A.front(); // (a page in the background gets no frames'],
    'scripts/test-connection-notice-chrome.mjs': ['front', 'it opens a tab and brings its own page back to the front before closing it (its freeze\'s own steps); every capture is of the page in front', "const other = await cdp('Target.createTarget', { url: 'about:blank' });"],
    'scripts/test-design-window.mjs': ['front', 'its second tab is closed (Target.closeTarget in its finally) before its only capture', "} finally { try { await call('Target.closeTarget', { targetId }); } catch { } }"],
    'scripts/test-desktop-app-window.mjs': ['front', 'every capture of p1 comes before its second page opens', 'await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${t2.id}`);'],
    'scripts/test-doc-window.mjs': ['front', 'no capture falls inside its two createTarget windows (each closed at once); the second page\'s pictures bring their page to the front (shotOn, shotTo)', "const shotOn = async (c, name) => { if (!SSHOTS) return null; await c('Page.bringToFront');"],
    'scripts/test-fold-ux.mjs': ['front', 'its captures come before t2 opens and after it is closed', 'try { await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${t2.id}`); } catch {}'],
    'scripts/test-foryou-honest-chrome.mjs': ['front', 'after P2 opens, P is brought to the front before its pictures, and P2 is closed after them', "await P.cdp('Page.bringToFront'); await sleep(300); // a background tab paints no frames"],
    'scripts/test-inbox-window-ui.mjs': ['front', 'its captures of P1 come before t2 opens or after it is closed (both times)', "try { P2.sock.close(); await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${t2.id}`, { method: 'PUT' }); } catch {}"],
    'scripts/test-layout-placeholder-ui.mjs': ['front', OWN_WINDOW, "Target.createTarget', { url: 'about:blank', newWindow: true }"],
    'scripts/test-phone-resume-keeps-layout-ui.mjs': ['front', OWN_WINDOW, "Target.createTarget', { url: 'about:blank', newWindow: true }"],
    'scripts/test-record-clear-client.mjs': ['front', 'its second page is in a browser context of its own (Target.createBrowserContext), and a window holds one context (Chromium\'s rule, read, not measured here): P1 stays its window\'s front tab', 'Target.createBrowserContext'],
    'scripts/test-record-clear-ui.mjs': ['front', 'its second page is in a browser context of its own (Target.createBrowserContext), and a window holds one context (Chromium\'s rule, read, not measured here): P1 stays its window\'s front tab', 'Target.createBrowserContext'],
    'scripts/test-resume-pages-follow-chrome.mjs': ['front', OWN_WINDOW, "Target.createTarget', { url: 'about:blank', newWindow: true }"],
    'scripts/test-split-ux.mjs': ['front', 'P1 is brought to the front before its pictures; its other pages open in windows of their own (newWindow: true)', "await P1.send('Page.bringToFront');"],
    // r1354 (lane bl-tests-e): the scripts THE PAGE FACTORY names, each read (three readers + by hand, 2026-11-21) — front
    'scripts/dbg-comm-surfaces.mjs': ['front', "a debugging script, not a suite: each pass opens ONE page (newPage) and closes it (/json/close) before the next pass opens its own; its window.open records and opens nothing", "const close = async () => { try { await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${t.id}`); }"],
    'scripts/test-agent-window-chrome.mjs': ['front', OWN_WINDOW, "send('Target.createTarget', { url: 'about:blank', newWindow: true })"],
    'scripts/test-attention-policy-ui.mjs': ['front', "every shot is of the newest /json/new page: d's shots come before ph opens; ph, sp, each loop's p and sb are shot before the next page opens", "const ph = await page(390, 844, 'w=100%25');"],
    'scripts/test-auto-resume-bulk-chrome.mjs': ['front', OWN_WINDOW, "send('Target.createTarget', { url: 'about:blank', newWindow: true })"],
    'scripts/test-channel-api-chrome.mjs': ['front', "p1 is shot before the next newPage() opens; p3, p9, p10 and pH are each shot before a later page opens", "await p1.shot('api-dialog-zh.png'"],   // B-1747 (r3179): the anchor reads the same before and after the guard tool's wrap
    'scripts/test-channel-edit-autosize.mjs': ['front', "the desk page is shot before the phone page opens, and the phone page is the newest when shot", "const P = await page(390, 780, 'after.js');"],
    'scripts/test-channel-outbox-window.mjs': ['front', "p1, p2, p3 and p5 are each shot while newest; ocdPage runs one page at a time, so each p is the newest at its shot", "for (const lang of ['zh', 'en']) await ocdPage(lang);"],
    'scripts/test-channel-reauth-line.mjs': ['front', "d is shot before ph opens; ph and lp are each the newest when shot", "const ph = await page(390, 844, 'b=after.js&w=100%25');"],
    'scripts/test-channel-row-notices.mjs': ['front', "d's shots come before r opens; ph is the newest at its shot", "await d.shot('fold.png');"],
    'scripts/test-channels-fold-default.mjs': ['front', "d's shots come before ph opens; ph is the newest at its shot", "await d.shot('desk-filter.png');"],
    'scripts/test-channels-groups-e2e.mjs': ['front', "its one capture is of p2, the newest page then; the next page opens after it", "const png = await p2.cdp('Page.captureScreenshot'"],
    'scripts/test-channels-internal-look.mjs': ['front', "d is shot before ph opens; ph, then p5, are the newest when shot", "const p5 = await page(1100, 900, 'b=after.js', READY);"],
    'scripts/test-channels-list-polish-ui.mjs': ['front', "p1 is probed and shot before p2 opens; p2 is never shot; p3 is the newest when probed", "const C = await probe(p3, 'lark/oc_dm');"],
    'scripts/test-decision-attention-ui.mjs': ['front', "each page() opens a /json/new tab, and every shot is of the newest page, taken before the next page()", "async function page(w, h, query) {"],
    'scripts/test-decision-engine.mjs': ['front', "each shot is of the page just opened; the next page() comes only after its shots", "async function page(w, h, lang) {"],
    'scripts/test-decision-rule.mjs': ['front', "each shot is of the newest /json/new tab; openPluginsDialog is a stub on the harness app, so nothing opens a real tab", "async function page(w, h, lang, ready ="],
    'scripts/test-desktop-app-rung-chrome.mjs': ['front', OWN_WINDOW, "{ url: 'about:blank', newWindow: true }); // each client its OWN window"],
    'scripts/test-desktop-display-modes-chrome.mjs': ['front', "every page is closed (/json/close) before the next opens; in its one two-page stretch p is shot before q and r4 open, and they close before p again", "await r4.close(); await q.close();"],
    'scripts/test-desktop-signin-chrome.mjs': ['front', "all shots are of the first page, the only test tab then; the later pages take no shot", "const p = await page('ja');"],
    'scripts/test-desktop-v2-chrome.mjs': ['front', "each shot is of the newest tab; its page() sections never overlap a shot of an older page", "async function page(w, h, winCss, dpr = 1, at = '/') {"],
    'scripts/test-desktop-v2-latency-chrome.mjs': ['front', "its shots are of the newest page; the page opened later takes no shot", "async function page(w, h, winCss, origin ="],
    'scripts/test-desktop-webrtc-chrome.mjs': ['front', "each page is closed (/json/close) before the next; in the R/B pair R is shot and closed before B opens", "await R.q.close();"],
    'scripts/test-feedback-ui.mjs': ['front', OWN_WINDOW, "bcall('Target.createTarget', { url: 'about:blank', newWindow: true })"],
    'scripts/test-lark-consent-chain.mjs': ['front', "all its shots are of d, taken before L, L3 and c open; the harness stubs window.open", "const L = await page(800, 600, `http://127.0.0.1:${LPORT}/api/channels/oauth/cb/lark?code=c1"],
    'scripts/test-login-grant-chrome.mjs': ['front', "each shot is of the newest tab: p2 opens only after p's shots", "const p2 = await page({ ...o, query: 'mode=head'"],
    'scripts/test-mac-ard-signin-chrome.mjs': ['front', "desk is the only test tab for its shots and is closed before the phone page opens", "const phone = await page(390, 844, `http://${IP}:${PORT}/`);"],
    'scripts/test-machine-app-chrome.mjs': ['front', "one page a section, opened and shot before the next page()", "async function page(w, h, winCss) {"],
    'scripts/test-machine-desktop-apps-chrome.mjs': ['front', "each shot is of the page just opened", "async function page(w, h) {"],
    'scripts/test-phone-composer-chrome.mjs': ['front', "every shot is of the newest page() (its close() drops only the socket, but no older page is shot again)", "async function page(w, h, { phone, theme = 'dark', css = 'real' })"],
    'scripts/test-refresh-note-chrome.mjs': ['front', OWN_WINDOW, "Target.createTarget', { url: 'about:blank', newWindow: true }"],
    'scripts/test-remoteapp-card.mjs': ['front', "every shot is of the newest page(): p, then ph, then en", "const p = await page(1100, 1700, 'zh');"],
    'scripts/test-resume-account-chrome.mjs': ['front', OWN_WINDOW, "Target.createTarget', { url: 'about:blank', newWindow: true }"],
    'scripts/test-slack-search-chrome.mjs': ['front', "the pr shots come before the second tab pp opens, and pp is the newest at its shot", "const pp = await CDP('zh', 390, 844);"],
    'scripts/test-task-detail-chrome.mjs': ['front', OWN_WINDOW, "Target.createTarget', { url: 'about:blank', newWindow: true }"],
    'scripts/test-usage-window-pivots.mjs': ['front', "all shots are of P, before the second tab Q opens; Q, R, S and X are never captured", "const Q = await page('after.js');"],
    'scripts/test-voice-chrome.mjs': ['front', "each block opens a new page() and captures only that newest page", "async function page(w, h, origin, { touch = false, on = true } = {})"],
    'scripts/test-voice-follow-chrome.mjs': ['front', "p is captured before the next page opens; the later shots are of the page just opened", "async function page(w, h, { touch = false, b = 'page', follow = true } = {})"],
    'scripts/test-voice-teach-chrome.mjs': ['front', "its consent tab and mutant tabs are closed and p brought back to the front before p's shots; every other shot is of the newest page", "await back.cdp('Page.bringToFront');"],
    'scripts/test-webhook-section-place.mjs': ['front', "d's shots come before ph opens; ph is the newest at its shot", "const ph = await page(390, 844, 'b=after.js&w=100%25');"],
  };
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? (x.name === 'node_modules' ? [] : walk(path.join(d, x.name))) : /\.(mjs|js|cjs)$/.test(x.name) ? [path.join(d, x.name)] : []));
  const files = walk(path.join(REPO, 'scripts')).filter((f) => path.basename(f) !== 'test-ci-gate.mjs'), named = new Map(), texts = new Map();
  for (const f of files) { const t = fs.readFileSync(f, 'utf8'), k = path.relative(REPO, f), sh = backgroundShape(t); if (sh) { named.set(k, sh); texts.set(k, t); } }
  const unread = [...named].filter(([k]) => !VERDICTS[k]).map(([k, sh]) => `${k} (capture line ${sh.bare.join(', ')})`);
  const lost = Object.entries(VERDICTS).filter(([k, [, , a]]) => named.has(k) && !texts.get(k).includes(a)).map(([k]) => k);
  const stale = Object.keys(VERDICTS).filter((k) => !named.has(k));
  const real = Object.entries(VERDICTS).filter(([, [v]]) => v === 'REAL');
  // THE RATCHET (主开发 r1125): the REAL list may only SHRINK — a script newly read as REAL is red by name that day (never a row
  // added to pass), and a cured one leaves BOTH this list and its verdict in its cure's own commit (its picture through frontShot)
  const REAL_RATCHET = [];
  const grown = real.filter(([k]) => !REAL_RATCHET.includes(k)).map(([k]) => k), leftOver = REAL_RATCHET.filter((k) => !(VERDICTS[k] && VERDICTS[k][0] === 'REAL'));
  ok(grown.length === 0 && leftOver.length === 0, `…the REAL list is a RATCHET (${REAL_RATCHET.length} today; it only shrinks)${grown.length ? ' — NEW REAL, red by name (bring its page to the front with frontShot): ' + grown.join(', ') : ''}${leftOver.length ? ' — CURED but still on the ratchet (take it off in the cure\'s commit): ' + leftOver.join(', ') : ''}`);
  ok(files.length > 300 && unread.length === 0, `every script that opens a second page and captures with no bring-to-front at its capture is READ — ${files.length} scripts walked, ${named.size} named, ${named.size - unread.length} with a verdict${unread.length ? ' — NOT READ (read it: a verdict below, or bring its page to the front): ' + unread.join(' · ') : ''}`);
  ok(lost.length === 0 && Object.values(VERDICTS).every(([v, why, a]) => (v === 'REAL' || v === 'front') && why.length > 20 && a.length > 8), `…each verdict's reason still stands in its script (its anchor)${lost.length ? ' — GONE in: ' + lost.join(', ') + ' (read it again)' : ''}`);
  ok(stale.length === 0, `…and no verdict outlives its shape (a cured script's row goes)${stale.length ? ': ' + stale.join(', ') : ''}`);
  console.log(`  REAL (${real.length}: a capture of a page behind another — the cure owed, named every run): ${real.map(([k, [, why]]) => `${path.basename(k, '.mjs')}: ${why}`).join(' · ')}`);
  // CONTROLS: the shape, planted, named; each cure of it, or a script without its second page, not named
  const P = (lines) => lines.join('\n');
  const SHAPE = {
    'two new pages, a bare capture': P([`const a = await (await fetch(u + '${NEWP}')).json();`, `const b = await (await fetch(u + '${NEWP}')).json();`, `const s = await A.cdp('${CAP}', {});`]),
    'one page factory called twice (r1354)': P(['async function newPage() {', `  const t = await (await fetch(u + '${NEWP}')).json();`, '  return t;', '}', 'const p1 = await newPage(), p2 = await newPage();', `const s = await p1.cdp('${CAP}');`]),
    'a const page factory called twice (r1354)': P(['const page = async (w) => {', `  const t = await call('${CT}', { url: 'about:blank' });`, '  return t;', '};', 'const a = await page(1), b = await page(2);', '', '', '', '', '', '', '', `const s = await a.cdp('${CAP}');`]),
    'one new page beside the first tab': P([`const first = list.find((t) => t.type === 'page');`, `const t2 = await call('${CT}', { url: 'about:blank' });`, '', '', '', '', '', '', '', `const shot = await A.cdp('${CAP}');`]),
  };
  const NOT = {
    'its page brought to the front': P([`await call('${CT}', {}); await call('${CT}', {});`, `await A.cdp('${['Page', 'bringTo' + 'Front'].join('.')}');`, `const s = await A.cdp('${CAP}');`]),
    'a helper that fronts its page': P([`await call('${CT}', {}); await call('${CT}', {});`, 'const shot = async () => {', '  await ' + 'to' + 'Front(me);', `  return cdp('${CAP}');`, '};']),
    'a page factory called once (r1354)': P(['async function newPage() {', `  const t = await (await fetch(u + '${NEWP}')).json();`, '  return t;', '}', 'const p1 = await newPage();', `const s = await p1.cdp('${CAP}');`]),
    'its picture through frontShot (r1354)': P(['async function newPage() {', `  const t = await (await fetch(u + '${NEWP}')).json();`, '  return t;', '}', 'const p1 = await newPage(), p2 = await newPage();', `const s = await frontShot(FS, p1.key, p1.bring, () => p1.cdp('${CAP}'), { name: 'x' });`]),
    'one page only': P([`const first = list.find((t) => t.type === 'page');`, `const s = await A.cdp('${CAP}');`]),
    'the second page in a comment': P([`const first = list.find((t) => t.type === 'page');`, `// await fetch(u + '${NEWP}')`, `const s = await A.cdp('${CAP}');`]),
  };
  const seenShape = Object.entries(SHAPE).map(([k, v]) => [k, backgroundShape(v)]), seenNot = Object.entries(NOT).map(([k, v]) => [k, backgroundShape(v)]);
  ok(seenShape.every(([, r]) => !!r), `CONTROLS: the shape, planted, is NAMED (${seenShape.map(([k, r]) => `${k}: ${r ? 'named' : 'MISSED'}`).join(' · ')})`);
  ok(seenNot.every(([, r]) => !r), `CONTROLS: its cures and its look-alikes are NOT named (${seenNot.map(([k, r]) => `${k}: ${r ? 'NAMED' : 'not named'}`).join(' · ')})`);
  // THE ONE HELPER, its law driven over stand-ins (scripts/cdp-front-shot.mjs): brings the picture's page to the front only when it is
  // not there, hands the front back, retries ONCE said by name, and is red by name on a second miss
  {
    const FS = await import('./cdp-front-shot.mjs');
    const log = [], said = [], st = FS.frontState(), mk = (k) => () => { log.push('front ' + k); return Promise.resolve(true); };
    FS.becameFront(st, 'B', mk('B'));
    const q = { sleep: async () => {}, say: (m) => said.push(m), name: 'the picture x.png', ms: 50 };
    const r1 = await FS.frontShot(st, 'A', mk('A'), async () => { log.push('capture A'); return 'pngA'; }, q);
    const okBack = r1 === 'pngA' && log.join(' > ') === 'front A > capture A > front B' && st.front.key === 'B' && said.length === 0;
    log.length = 0; const r2 = await FS.frontShot(st, 'B', mk('B'), async () => { log.push('capture B'); return 'pngB'; }, q);
    const okNoBring = r2 === 'pngB' && log.join(' > ') === 'capture B';
    log.length = 0; let n = 0;
    const r3 = await FS.frontShot(st, 'A', mk('A'), () => (n++ ? Promise.resolve('late') : new Promise(() => {})), q);
    const okRetry = r3 === 'late' && said.some((x) => /the picture x\.png: the picture x\.png: no answer in 50 ms — once more/.test(x)) && said.some((x) => /came on its one retry/.test(x)) && st.front.key === 'B';
    let threw = ''; try { await FS.frontShot(st, 'A', mk('A'), () => new Promise(() => {}), q); } catch (e) { threw = String(e.message); }
    ok(okBack && okNoBring && okRetry && /^the picture x\.png did not come twice, its page brought to the front each time — /.test(threw), `the ONE helper (cdp-front-shot.mjs) over stand-ins: a picture of a page behind brings it to the front and hands the front back («${'front A > capture A > front B'}»); a picture of the page in front brings nothing; a capture that never answers is retried ONCE, said; two misses are red by name («${threw.slice(0, 80)}»)`, { okBack, okNoBring, okRetry, said, threw });
    // pageClosed (r1354): a tab the suite CLOSED leaves the front unknown (Chrome hands it to a NEIGHBOUR tab), so the next picture
    // brings its own page and hands nothing back to a page that is gone; closing a page NOT in front keeps the front
    const sc = FS.frontState(), clog = [], mc = (k) => () => { clog.push('front ' + k); return Promise.resolve(true); };
    FS.becameFront(sc, 'C', mc('C')); FS.pageClosed(sc, 'B'); const keptC = !!sc.front && sc.front.key === 'C';
    FS.pageClosed(sc, 'C'); const forgot = sc.front === null;
    const r4 = await FS.frontShot(sc, 'A', mc('A'), async () => { clog.push('capture A'); return 'pngA'; }, q);
    // bringTab (r1354): the browser's own door brings a tab with no page socket; a tab that is gone is refused by name
    const asked = [], fakeFetch = (u) => { asked.push(u); const gone = u.endsWith('/gone'); return Promise.resolve({ ok: !gone, status: gone ? 404 : 200 }); };
    const okTab = await FS.bringTab(9, 'T1', { fetchFn: fakeFetch })().then((v) => v === true, () => false);
    let goneSaid = ''; try { await FS.bringTab(9, 'gone', { fetchFn: fakeFetch })(); } catch (e) { goneSaid = String(e.message); }
    ok(okTab && asked[0] === 'http://127.0.0.1:9/json/activate/T1' && /could not be brought to the front \(\/json\/activate answered 404\)/.test(goneSaid), `…and bringTab: a tab is brought through the browser's own door (${asked[0]}); a tab that is gone is refused by name («${goneSaid.slice(0, 90)}»)`, { asked, goneSaid });
    ok(keptC && forgot && r4 === 'pngA' && clog.join(' > ') === 'front A > capture A' && sc.front.key === 'A', `…and pageClosed: a closed tab's front is forgotten, so the next picture brings its own page and hands nothing back («${clog.join(' > ')}»); closing a page not in front keeps the front`, { keptC, forgot, clog, front: sc.front && sc.front.key });
  }
  console.log(`  (§2o read ${files.length} scripts in ${Date.now() - t0} ms)`);
}
// ── §2p A WAIT THAT RUNS OUT SAYS SO (主开发 r1141 (2), 2026-11-21, lane bl-tests-chrome — the class of 2.369.414's mirror: the
// control of test-browser-resume-ui was read as a PRODUCT verdict because its settle() returned its last read when its bound ran
// out, with no timed-out mark). THE SHAPE (scripts/last-read-waits.mjs, read from the code, the Node code AND the page code a
// suite ships in template literals): a bounded poll that returns its READ when a separate test on it passes, and the same read
// (or one more) when its bound runs out. Its caller cannot tell «the state came» from «the bound ran out» and judges the
// product on a state that never came. Cured shapes are not named: a timed-out mark (a new object, a null or a false on
// exhaustion), or a wait whose test IS its read's truthiness. Its BREAK FORM too (r1372): a test that breaks the loop, then the read
// returned whichever way the loop ended. EVERY TIER is read (r1372: the fast tier held 2 of 773). THE RATCHET (per suite, the count it
// holds today) may only SHRINK: a wait more than its row is red by name that day; a cured one lowers its row in its cure's own commit.
// THE SPOTS IT DOES NOT READ, said: a wait SPLIT over helpers (the read in one function, its loop in another) — KNOWN, counted nine on
// 2026-11-21 and each read (none split: five honest, two the break form now read here, two silent timeouts cured through the mark);
// PAGE CODE BUILT FROM PIECES (a literal whose loop is itself an interpolated const) — NOT READ, by rule: page code that polls keeps
// its loop in its own literal.
console.log('\n§2p a wait that runs out says so: no suite returns its last read as an answer when its bound runs out (a ratchet, every tier)');
{
  const t0 = Date.now();
  const acorn = createRequire(import.meta.url)('acorn');
  const { lastReadWaits } = await import('./last-read-waits.mjs');
  const RATCHET = {};   // 2026-11-21: 35 waits in 20 heavy suites; each cure lowered its row — EMPTY since test-browser-resume-ui's last 3 fell to 0 at bl-browser-a's cure (block line 105) on the 2.369.416 train: the next one is a NEW one, RED by name
  const heavy = SUITES, per = new Map(), unread = [];   // every tier (r1372); the name kept for the lines below
  for (const x of heavy) {
    const f = path.join(REPO, 'scripts', x.name + '.mjs'); if (!fs.existsSync(f)) continue;
    const w = ONE_PASS.lastReads.get(f) || lastReadWaits(fs.readFileSync(f, 'utf8'), acorn);   // THE ONE PASS's result for this file
    for (const e of w.filter((y) => y.error)) unread.push(`${x.name}: ${e.error}`);
    const real = w.filter((y) => !y.error); if (real.length) per.set(x.name, real);
  }
  const sum = [...per.values()].reduce((a, w) => a + w.length, 0);
  const grown = [...per].filter(([k, w]) => w.length > (RATCHET[k] || 0)).map(([k, w]) => `${k} ${w.length} (its row ${RATCHET[k] || 0}): ${w.map((y) => `line ${y.line}${y.page ? ' (page code)' : ''} ${y.hit}`).join('; ')}`);
  const fell = Object.keys(RATCHET).filter((k) => (per.get(k) || []).length < RATCHET[k]).map((k) => `${k} ${(per.get(k) || []).length} < its row ${RATCHET[k]}`);
  ok(heavy.length > 1000 && grown.length === 0, `no suite returns its last read as an answer when its bound runs out beyond the ratchet — ${heavy.length} suites read (every tier), ${sum} wait(s) in ${per.size}${grown.length ? ' — NEW, red by name (give it a timed-out mark): ' + grown.join(' · ') : ''}`);
  ok(fell.length === 0, `…the ratchet only shrinks: a cured wait lowers its row in its cure's own commit${fell.length ? ' — lower: ' + fell.join(', ') : ''}`);
  ok(unread.length === 0, `…and every suite parses (an unparsable one would hide the shape)${unread.length ? ': ' + unread.slice(0, 4).join(', ') : ''}`);
  console.log(`  THE NAMED (${sum}, each a cure owed): ${[...per].map(([k, w]) => `${k} ${w.map((y) => y.line + (y.page ? 'p' : '')).join('/')}`).join(' · ')}`);
  // CONTROLS: the shape planted (Node code; page code in a template literal) is NAMED; its cures and look-alikes are NOT
  const POLL = (body) => `const sleep = (ms) => new Promise((r) => setTimeout(r, ms));\nconst settle = async () => { let r = null; for (let i = 0; i < 40; i++) { r = await read(); if (${'r.more && r.more.marked'}) return r; await sleep(25); } ${body} };`;
  const PAGE = (body) => "await ev(`const read = () => ({ more: document.querySelector('.m') }); for (let i = 0; i < 200; i++) { const r = read(); if (${cond}) return r; await new Promise((q) => setTimeout(q, 25)); } " + body + "`);";
  const BRK = (body) => `const sleep = (ms) => new Promise((r) => setTimeout(r, ms));\nconst byText = async (n) => { let o = []; for (let i = 0; i < 40; i++) { o = await open(); if (o.length >= n) break; await sleep(25); } ${body} };`;
  const NAMED = { 'the break form': BRK('return o.sort((a, b) => a - b);'), 'its last read, returned': POLL('return r;'), 'one more read, returned': POLL('return read();'), 'in page code, one more read': PAGE('return read();') };
  const NOT = { 'the break form, marked': BRK("return (o.length >= n ? o : markTimedOut(o, 40 * 25, 'byText')).sort((a, b) => a - b);"), 'the one mark (markTimedOut)': POLL("return markTimedOut(r, 40 * 25, 'settle');"), 'a timed-out mark': POLL('return { ...r, timedOut: true };'), 'a null when it runs out': POLL('return null;'), 'its test IS its read': 'const until = async (f) => { for (let i = 0; i < 9; i++) { const v = await f(); if (v) return v; await sleep(9); } return f(); };', 'in page code, a timed-out mark': PAGE('return { timedOut: true, last: read() };') };
  const seen = (o) => Object.entries(o).map(([k, v]) => [k, lastReadWaits(v, acorn).filter((y) => !y.error).length]);
  const sN = seen(NAMED), sX = seen(NOT);
  // THE ONE PASS (主开发 r3135 (2)): over this section's planted texts the pass's road gives lastReadWaits the answer its own parse gives
  const passP = Object.entries({ ...NAMED, ...NOT }).filter(([, v]) => JSON.stringify(ONE_PASS.perFile(v, { suite: true }).lastReads) !== JSON.stringify(lastReadWaits(v, acorn))).map(([k]) => k);
  ok(!passP.length && Object.values(NAMED).every((v) => ONE_PASS.perFile(v, { suite: true }).lastReads.filter((y) => !y.error).length > 0), `THE ONE PASS (r3135 (2)): over this section's planted texts the pass hands lastReadWaits what its own parse gives — each named shape found through it too${passP.length ? ' — DIFFERS: ' + passP.join(', ') : ''}`);
  ok(sN.every(([, n]) => n === 1), `CONTROLS: the shape, planted, is NAMED (${sN.map(([k, n]) => `${k}: ${n}`).join(' · ')})`);
  ok(sX.every(([, n]) => n === 0), `CONTROLS: its cures and look-alikes are NOT named (${sX.map(([k, n]) => `${k}: ${n}`).join(' · ')})`);
  // THE ONE MARK (scripts/lib/timed-out.mjs, 主开发 r1197): a wait that runs out answers its read with its TRUTHINESS KEPT — a null stays
  // a null and an undefined an undefined (a judge reading «nothing there» never goes green over a state that never came), a number or a
  // string stays itself, a list or an object carries `timedOut` beside its fields — and the state that never came is said on a line
  {
    const TO = await import('./lib/timed-out.mjs');
    const said = [], say = (m) => said.push(m);
    const cases = [['a null', null], ['an undefined', undefined], ['a number', 0], ['a string', 'x'], ['a list', []], ['an object', { a: 1 }]];
    const got = cases.map(([k, v]) => { const r = TO.markTimedOut(v, 1500, 'the probe', { say }); return [k, Boolean(v) === Boolean(r) && (v && typeof v === 'object' ? r === v && /^the probe: the state it waits for did not come in 1\.5 s$/.test(r.timedOut) && r.a === v.a : r === v)]; });
    ok(got.every(([, y]) => y) && said.length === cases.length && said.every((m) => /^    \(the probe: the state it waits for did not come in 1\.5 s .*its last read /.test(m)) && TO.never(null) === '' && /THE STATE NEVER CAME: the probe: /.test(TO.never(TO.markTimedOut({}, 1500, 'the probe', { say }))),
      `the ONE mark (scripts/lib/timed-out.mjs): each read keeps its truthiness and carries the mark where it can — ${got.map(([k, y]) => `${k} ${y ? 'kept' : 'BROKEN'}`).join(' · ')}; every one said on its own line; never() names it`, { got, said });
  }
  console.log(`  (§2p read ${heavy.length} suites, every tier, in ${Date.now() - t0} ms)`);
}
console.log('\n§2r no real agent CLI on the hosted runner but the legs sanctioned BY NAME; the real turns once a hosted run (B-ec25 remainder, r117 + r140)');
{
  // THE RULINGS (the coordinator, 2026-11-20: r117 part 4, r140 (b)): every hosted heavy suite runs with VS_NO_REAL_CLI=1 (a scratch hub's
  // boot probes and a self-found claude are refused by name — src/machine-probes.js realCliRefusal). Sanctioned BY NAME on the Actions
  // runner only (VS_REAL_CLI_SANCTIONED, a `;` list): the two legs that run the installed claude against a LOOPBACK stand-in with a made-up
  // key — ONE list for every major. test-stdout-registry's wire leg LEFT the list (the coordinator's r2084, the block's hosted run
  // 44980743210): no sign-in reaches it on the runner, so a sanction for it proved nothing; it is named red if it comes back, and it may
  // not read the sanction. The one row with a real turn, test-chat-e2e (fast), runs it once a run: the CI sign-in goes to the fast job's
  // Node 22 jobs alone and every other major's job runs under the flag. No row joins the list but by the owner's word. PURE judge over the
  // workflow text + the files that read the sanction; the mutants below go through the SAME judge.
  const C = await import('./ci.mjs');
  const SANCTIONS = { 'test-claude-steer-chrome §A': 'scripts/test-claude-steer-chrome.mjs', 'test-claude-wrapper-queue §A': 'scripts/test-claude-wrapper-queue.mjs' };
  const LEFT = { 'test-stdout-registry ⓕ': 'r2084: no sign-in reaches it on the runner, it could measure nothing there' };   // legs that left the list, named if they return
  const SANC_LINE = "const REAL_CLI_SANCTIONED = String(process.env.VS_REAL_CLI_SANCTIONED || '').split(';').map((x) => x.trim()).includes(REAL_CLI_SANCTION) && process.env.GITHUB_ACTIONS === 'true';";
  const FENCE = { 'scripts/test-claude-steer-chrome.mjs': "const NO_REAL_CLI = process.env.VS_NO_REAL_CLI === '1' && !REAL_CLI_SANCTIONED;", 'scripts/test-claude-wrapper-queue.mjs': "const NO_REAL_CLI = process.env.VS_NO_REAL_CLI === '1' && !REAL_CLI_SANCTIONED;" };
  /** every step whose run line runs suites (`node scripts/ci.mjs --heavy …` / `--fast…`) → { kind, line, env: Map } */
  const suiteSteps = (text) => {
    const lines = text.split('\n'), out = [];
    lines.forEach((l, i) => {
      const m = /^(\s*)- run: node scripts\/ci\.mjs (--heavy(?=\s)|--fast)/.exec(l);
      if (!m) return;
      const env = new Map(); let j = i + 1;
      const ind = m[1].length + 2;
      if (j < lines.length && new RegExp(`^ {${ind}}env:\\s*$`).test(lines[j])) {
        for (j++; j < lines.length; j++) {
          const e = lines[j];
          if (/^\s*#/.test(e) || !e.trim()) continue;
          const kv = new RegExp(`^ {${ind + 2}}([A-Z_][A-Z0-9_]*):\\s*(.*)$`).exec(e);
          if (!kv) break;
          env.set(kv[1], kv[2].replace(/\s+#.*$/, '').replace(/^'(.*)'$|^"(.*)"$/, (_, x, y) => x ?? y));
        }
      }
      out.push({ kind: m[2] === '--fast' ? 'fast' : 'heavy', line: i + 1, env });
    });
    return out;
  };
  /** a value by major: `${{ matrix.node == P && 'X' || 'Y' }}` → { primary: P, on: X, off: Y }; a plain value → { primary: null, on: v, off: v } */
  /** the sign-in's expression names exactly ONE major, the primary: `${{ matrix.node == P && secrets.VIBESPACE_CI_OAT || '' }}` */
  const byMajorOat = (v, P) => v === '${{ matrix.node == ' + P + ' && secrets.VIBESPACE_CI_OAT || \'\' }}';
  const byMajor = (v) => { const m = /^\$\{\{ matrix\.node == (\d+) && '([^']*)' \|\| '([^']*)' \}\}$/.exec(String(v ?? '')); return m ? { primary: Number(m[1]), on: m[2], off: m[3] } : { primary: null, on: v, off: v }; };
  const names = (x) => String(x ?? '').split(';').map((y) => y.trim()).filter(Boolean).sort();
  const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  /** → the problems (none = the rules hold): the workflow text, and { file → text } of every file that names the sanction */
  const judge = (yml, readers) => {
    const steps = suiteSteps(yml), heavy = steps.filter((x) => x.kind === 'heavy'), probs = [];
    const hn = C.workflowHeavyNodesAt(yml), fp = C.workflowFastPartsAt(yml);
    if (!heavy.length) probs.push('no heavy suite step found (`- run: node scripts/ci.mjs --heavy …`)');
    const ALL = Object.keys(SANCTIONS);
    for (const h of heavy) {
      if (h.env.get('VS_NO_REAL_CLI') !== '1') probs.push(`the heavy step at line ${h.line} sets no VS_NO_REAL_CLI '1' (${h.env.has('VS_NO_REAL_CLI') ? `'${h.env.get('VS_NO_REAL_CLI')}'` : 'absent'})`);
      const v = byMajor(h.env.get('VS_REAL_CLI_SANCTIONED'));
      if (!h.env.has('VS_REAL_CLI_SANCTIONED')) { probs.push(`the heavy step at line ${h.line} sanctions nothing`); continue; }
      for (const [left, why] of Object.entries(LEFT)) if (names(v.on).includes(left) || names(v.off).includes(left)) probs.push(`the heavy step at line ${h.line} sanctions ${left}, which LEFT the list (${why})`);
      if (!same(names(v.on), ALL) || !same(names(v.off), ALL)) probs.push(`the sanction list is «${names(v.on).join('; ')}»${v.primary === null ? '' : ` on Node ${v.primary} and «${names(v.off).join('; ')}» on its other majors`}, not exactly «${ALL.join('; ')}» on every major`);
    }
    for (const f of steps.filter((x) => x.kind === 'fast')) {
      if (f.env.has('VS_REAL_CLI_SANCTIONED')) probs.push(`the fast step at line ${f.line} carries a sanction (the heavy job's alone)`);
      if (fp && fp.nodes && fp.nodes.length > 1) {
        const P = fp.primary, oat = '${{ matrix.node == ' + P + ' && secrets.VIBESPACE_CI_OAT || \'\' }}', flag = '${{ matrix.node != ' + P + ' && \'1\' || \'\' }}';
        if (f.env.get('VIBESPACE_CI_OAT') !== oat) probs.push(`the fast step at line ${f.line} hands the CI sign-in as «${f.env.get('VIBESPACE_CI_OAT')}», not to the Node ${P} jobs alone («${oat}») — test-chat-e2e's real turn would run once per major`);
        if (f.env.get('VS_NO_REAL_CLI') !== flag) probs.push(`the fast step at line ${f.line} sets VS_NO_REAL_CLI «${f.env.get('VS_NO_REAL_CLI')}», not «${flag}» on every other major`);
      }
    }
    // every line that runs ci.mjs's tiers is a step this judge reads (a `run: |` block or another argument order would be unread)
    const runs = yml.split('\n').filter((l) => !/^\s*#/.test(l) && /scripts\/ci\.mjs\b[^\n]*\s--(?:heavy(?=\s|$)|fast)/.test(l)).length;
    if (runs !== steps.length) probs.push(`${runs} lines run ci.mjs --heavy / --fast, the judge reads ${steps.length} suite steps — a step in another shape (a run: | block, another argument order) is unread`);
    for (const h of heavy) if (hn && hn.all && hn.all.length > 1 && h.env.has('VIBESPACE_CI_OAT') && h.env.get('VIBESPACE_CI_OAT') !== '${{ matrix.node == ' + hn.primary + ' && secrets.VIBESPACE_CI_OAT || \'\' }}') probs.push(`the heavy step at line ${h.line} hands the CI sign-in as «${h.env.get('VIBESPACE_CI_OAT')}» on an axis job — not to the Node ${hn.primary} shards alone`);
    const named = yml.split('VS_REAL_CLI_SANCTIONED:').length - 1;
    if (named !== heavy.length) probs.push(`the workflow names VS_REAL_CLI_SANCTIONED ${named} time(s), its heavy suite steps are ${heavy.length}`);
    const others = Object.keys(readers).filter((f) => !Object.values(SANCTIONS).includes(f)).sort();
    if (others.length) probs.push(`the sanction is read by ${others.join(', ')} — only the sanctioned suites may`);
    for (const [name, file] of Object.entries(SANCTIONS)) {
      const own = readers[file];
      if (own === undefined) { probs.push(`${file} reads no sanction (its leg «${name}» would skip on the runner)`); continue; }
      if (!own.includes(`const REAL_CLI_SANCTION = '${name}';`) || !own.includes(SANC_LINE) || !own.includes(FENCE[file])) probs.push(`${file}'s fence is not «const REAL_CLI_SANCTION = '${name}';» + the list line (on the Actions runner only) + «${FENCE[file]}»`);
    }
    return probs;
  };
  const yml = fs.readFileSync(path.join(REPO, '.github/workflows/ci.yml'), 'utf8');
  // the readers: ONE fixed-string git grep over every tracked file of the code (scripts/ with its fixtures, src/, data/bin/,
  // server.js — 2 600 files, 116 MB: a walk in JS would add ~0.3 s to an over row); 1 = none found, anything else is a failure
  const gg = spawnSync('git', ['-C', REPO, 'grep', '-l', '-F', 'VS_REAL_CLI_SANCTIONED', '--', 'scripts', 'src', 'data/bin', 'server.js'], { env: GIT_ENV, encoding: 'utf8' });
  ok(gg.status === 0 || gg.status === 1, `the readers' search ran (git grep exit ${gg.status}${gg.stderr ? ': ' + String(gg.stderr).trim().slice(0, 120) : ''})`);
  const found = String(gg.stdout || '').split('\n').filter(Boolean).filter((rel) => rel !== 'scripts/test-ci-gate.mjs');
  const readers = Object.fromEntries(found.map((rel) => [rel, fs.readFileSync(path.join(REPO, rel), 'utf8')]));
  const steps = suiteSteps(yml);
  const real = judge(yml, readers);
  const hv = steps.find((x) => x.kind === 'heavy'), hs = hv && byMajor(hv.env.get('VS_REAL_CLI_SANCTIONED'));
  ok(real.length === 0, `the hosted heavy step runs under VS_NO_REAL_CLI '1' and sanctions BY NAME «${hs ? names(hs.on).join('; ') : '?'}» on every major (the wire leg ⓕ left it: r2084); the fast job's sign-in and real turn on its Node 22 jobs alone; the sanction read by ${Object.keys(readers).join(', ') || 'none'} — ${steps.map((x) => `${x.kind}@${x.line} {${[...x.env.keys()].join(', ')}}`).join(' · ')}${real.length ? ' — ' + real.join(' · ') : ''}`);
  // THE COUNT, STATED (r144): how many jobs of a run carry the CI sign-in — the fast parts and the heavy shards of ONE major each
  { const fpC = C.workflowFastPartsAt(yml), shC = C.workflowShardsAt(yml), hnC = C.workflowHeavyNodesAt(yml), fs1 = steps.find((x) => x.kind === 'fast'), hs1 = steps.find((x) => x.kind === 'heavy');
    const carry = (st, slots, majors, primary) => (!st || !st.env.has('VIBESPACE_CI_OAT') ? 0 : slots * (byMajorOat(st.env.get('VIBESPACE_CI_OAT'), primary) ? 1 : majors));
    const fastN = carry(fs1, fpC ? fpC.n : 1, fpC && fpC.nodes ? fpC.nodes.length : 1, fpC && fpC.primary), heavyN = carry(hs1, shC ? shC.n : 0, hnC && hnC.all ? hnC.all.length : 1, hnC && hnC.primary);
    ok(fastN === 2 && heavyN === 7, `the CI sign-in reaches ${fastN + heavyN} jobs of a run: fast ${fastN} of ${fpC && fpC.nodes ? fpC.n * fpC.nodes.length : '?'} (the Node 22 parts), heavy ${heavyN} of ${shC ? shC.n : '?'} — of ${shC && hnC && hnC.all ? shC.n * hnC.all.length : '?'} on a ci/cut… or ci/proof… run (the Node 22 shards); its one reader is test-chat-e2e (fast): ONE real turn a run, and test-stdout-registry's wire leg starts no claude on the runner (it left the sanction list, r2084)`); }
  // CONTROLS — each planted fault, through the same judge, is named (the anchors are this tree's own lines)
  const FLAG = "          VS_NO_REAL_CLI: '1'\n", SANC = /( {10}VS_REAL_CLI_SANCTIONED: ')([^']*)('\n)/;
  const FAST_OAT = "          VIBESPACE_CI_OAT: ${{ matrix.node == 22 && secrets.VIBESPACE_CI_OAT || '' }}\n", FAST_FLAG = "          VS_NO_REAL_CLI: ${{ matrix.node != 22 && '1' || '' }}\n";
  const steerSrc = readers['scripts/test-claude-steer-chrome.mjs'] || '', wqSrc = readers['scripts/test-claude-wrapper-queue.mjs'] || '';
  const CONTROLS = [
    ['the flag removed', () => judge(anchored(yml, FLAG, '', 'heavy-flag'), readers), /sets no VS_NO_REAL_CLI '1' \(absent\)/],
    ['the flag set to 0', () => judge(anchored(yml, FLAG, "          VS_NO_REAL_CLI: '0'\n", 'heavy-flag-0'), readers), /sets no VS_NO_REAL_CLI '1' \('0'\)/],
    ['a third leg sanctioned', () => judge(anchored(yml, SANC, '$1$2; test-chat-attachments-chrome §A$3', 'heavy-sanction-3rd'), readers), /the sanction list is «.*test-chat-attachments-chrome §A.*», not exactly/],
    // stale-pins: kept — the 788feacd5 / e44bb4a98 form of the line (the wire leg on the Node 22 shard), rebuilt for the control
    ['the wire leg back on the Node 22 shard (the old by-major form)', () => judge(anchored(yml, SANC, "          VS_REAL_CLI_SANCTIONED: ${{ matrix.node == 22 && '$2; test-stdout-registry ⓕ' || '$2' }}\n", 'heavy-wire-back'), readers), /sanctions test-stdout-registry ⓕ, which LEFT the list/],
    ['the wire leg back on every major', () => judge(anchored(yml, SANC, '$1$2; test-stdout-registry ⓕ$3', 'heavy-wire-every'), readers), /sanctions test-stdout-registry ⓕ, which LEFT the list/],
    ['the wire leg reading the sanction again', () => judge(yml, { ...readers, 'scripts/test-stdout-registry.mjs': "const REAL_CLI_SANCTIONED = String(process.env.VS_REAL_CLI_SANCTIONED || '');" }), /read by scripts\/test-stdout-registry\.mjs/],
    ['the sanction on the fast step too', () => judge(anchored(yml, FAST_FLAG, FAST_FLAG + "          VS_REAL_CLI_SANCTIONED: 'test-chat-e2e'\n", 'fast-sanction'), readers), /the fast step at line \d+ carries a sanction/],
    ['the fast sign-in to every major', () => judge(anchored(yml, FAST_OAT + FAST_FLAG, '          VIBESPACE_CI_OAT: ${{ secrets.VIBESPACE_CI_OAT }}\n' + FAST_FLAG, 'fast-oat-all'), readers), /hands the CI sign-in as «\$\{\{ secrets\.VIBESPACE_CI_OAT \}\}», not to the Node 22 jobs alone/],
    ['the fast job\'s other majors without the flag', () => judge(anchored(yml, FAST_FLAG, '', 'fast-flag'), readers), /sets VS_NO_REAL_CLI «undefined», not/],
    // the heavy step's sign-in line is named by ITS OWN comment line above it (r2070): the line after it is the train's to move — B-ba47's
    // two VS_UI_SHOTS_DIR comment lines came in between and the old anchor («…\n          VS_UI_SHOTS_DIR») went, crashing the suite
    ['the heavy sign-in handed plainly on the axis job', () => judge(anchored(yml, "heavy 7 (test-ci-gate §2r).\n          VIBESPACE_CI_OAT: ${{ matrix.node == 22 && secrets.VIBESPACE_CI_OAT || '' }}\n", 'heavy 7 (test-ci-gate §2r).\n          VIBESPACE_CI_OAT: ${{ secrets.VIBESPACE_CI_OAT }}\n', 'heavy-oat-plain'), readers), /heavy step at line \d+ hands the CI sign-in as «\$\{\{ secrets\.VIBESPACE_CI_OAT \}\}» on an axis job/],
    ['a second heavy step in a run: | block, no flag', () => judge(anchored(yml, '      - name: Upload the failed suites\' whole logs + chrome-suite screenshots (failure only)\n', '      - run: |\n          node scripts/ci.mjs --heavy --dirty-ok --host=hosted --shard ${{ matrix.shard }}/7\n      - name: Upload the failed suites\' whole logs + chrome-suite screenshots (failure only)\n', 'heavy-block-step'), readers), /3 lines run ci\.mjs --heavy \/ --fast, the judge reads 2 suite steps/],
    ['a second reader (a product file)', () => judge(yml, { ...readers, 'src/server/cli-env.js': "if (process.env.VS_REAL_CLI_SANCTIONED) run();" }), /read by src\/server\/cli-env\.js/],
    ['the fence dropped from the steer suite', () => judge(yml, { ...readers, 'scripts/test-claude-steer-chrome.mjs': anchored(steerSrc, FENCE['scripts/test-claude-steer-chrome.mjs'], 'const NO_REAL_CLI = false;', 'steer-fence') }), /test-claude-steer-chrome\.mjs's fence is not/],
    ['the sanction honoured off the runner', () => judge(yml, { ...readers, 'scripts/test-claude-wrapper-queue.mjs': anchored(wqSrc, " && process.env.GITHUB_ACTIONS === 'true';", ';', 'wq-actions-only') }), /test-claude-wrapper-queue\.mjs's fence is not/],
  ];
  const seen = CONTROLS.map(([k, run, want]) => { const p = run(); return [k, p.length > 0 && p.some((x) => want.test(x)), p.join(' · ').slice(0, 160)]; });
  ok(seen.every(([, hit]) => hit), `CONTROLS: each planted fault is named — ${seen.map(([k, hit, p]) => `${k}: ${hit ? 'named' : 'MISSED'} («${p}»)`).join(' · ')}`);
  // THE WORKFLOWS PARSE (lane bl-ci, 2026-11-21): the side run 44949388570 ran NO job — GitHub refused ci.yml at its line 271, a PLAIN
  // step name holding «: » inside its parenthesis («mapping values are not allowed here»). Every leg above reads the file as TEXT, so a
  // file GitHub cannot parse passed them all. No YAML library is in the tree; the census reads what breaks a PLAIN scalar: a value written
  // unquoted (not ' " [ { | >) that holds «: » or ends in «:» before its comment (« #»). Block scalars (| >) are skipped whole.
  const plainColons = (text) => {
    const out = []; let block = -1, n = 0;
    text.split('\n').forEach((line, i) => {
      const ind = line.length - line.trimStart().length;
      if (block >= 0) { if (!line.trim() || ind > block) return; block = -1; }
      const t = line.trim();
      if (!t || t.startsWith('#')) return;
      const m = /^\s*(?:-\s+)?[A-Za-z0-9_.-]+:(?:\s+(.*))?$/.exec(line);
      const v = m ? (m[1] || '').trim() : '';
      if (!v) return;
      if (/^[|>]/.test(v)) { block = ind; return; }
      if (/^['"[{]/.test(v)) return;
      n++;
      if (/:\s|:$/.test(v.replace(/\s+#.*$/, ''))) out.push(`line ${i + 1}: ${t.slice(0, 120)}`);
    });
    return { out, n };
  };
  const WFS = fs.readdirSync(path.join(REPO, '.github', 'workflows')).filter((f) => /\.ya?ml$/.test(f)).sort();
  const wfr = WFS.map((f) => [f, plainColons(fs.readFileSync(path.join(REPO, '.github', 'workflows', f), 'utf-8'))]);
  ok(wfr.length >= 3 && wfr.every(([, r]) => r.out.length === 0) && wfr.reduce((a, [, r]) => a + r.n, 0) > 100,
    `THE WORKFLOWS PARSE: no plain YAML value holds «: » (${wfr.map(([f, r]) => `${f} ${r.n}`).join(', ')} plain values read)${wfr.some(([, r]) => r.out.length) ? ' — ' + wfr.flatMap(([f, r]) => r.out.map((x) => f + ' ' + x)).join(' | ') : ''}`);
  {
    // RED on 20fcb0a3b's file: that file is today's with ONE name — the cured one put back — and the census names exactly its line
    const yml = fs.readFileSync(path.join(REPO, '.github', 'workflows', 'ci.yml'), 'utf-8');
    const CURED = "      - name: Install claude CLI, the tree's pinned build (B-28b1, scripts/ci-claude.mjs pin, as the fast job)\n";
    const OLD = CURED.replace('(B-28b1, ', '(B-28b1: ');   // stale-pins: kept — the control rebuilds the 20fcb0a3b line
    const at = yml.split('\n').indexOf(CURED.slice(0, -1)) + 1;
    const was = plainColons(yml.split(CURED).join(OLD));
    ok(yml.split(CURED).length === 2 && was.out.length === 1 && was.out[0].startsWith(`line ${at}: `) && /B-28b1: scripts/.test(was.out[0]),
      `CONTROL: on 20fcb0a3b's file (this one with that name put back) the census NAMES exactly its line ${at} — the line GitHub refused (${was.out.join(' | ')})`);
    const neg = plainColons(yml + "\n      - name: 'a quoted name: fine'\n        run: |\n          echo 'a block: never read'\n");
    ok(neg.out.length === 0, '…and passes a QUOTED value and a block scalar\'s line that hold «: » (YAML reads both)', neg.out.join(' | '));
  }
}

// ── §2q THE ONE SUITE-BUILT CLIENT BUNDLE (主开发 r1291 / r1305, row B-1217, lane bl-tests-a, 2026-11-21 — the hotfix's hosted run
// 44903979657: test-chat-needs-card-chrome built its mutants UNMINIFIED and fed each to the page as one base64 body through the
// debugging door; on a slow shard the page took over 30 s to take it in). A suite's changed src/client.js is built by
// scripts/client-bundle.mjs (buildClientBundle / buildClientBundleApi): the product's own options, read through symbolicate's ONE
// parser of package.json's client step. THE CENSUS (ownClientBuilds over every tracked scripts/ file): a file that builds
// src/client.js its own way is RED BY NAME unless it is a named row — the tools and the fixture each with its reason, and the
// suites whose OWN scratch hub serves the built client by the product's route (the slow-intake fault does not apply there:
// 主开发 r1305 — ONE closed debt list, it only shrinks: a row whose file no longer builds its own way is stale and red). No file of
// any row may fulfil a /bundle.js through the debugging door with an own-way build.
// WHAT THE CENSUS CANNOT SEE (it reads one line at a time; an API build only with client.js on its own line or the next two):
// an esbuild command split across lines (esbuild on one, src/client.js on the next); a path built by path.join('src', 'client.js')
// or by concatenation; a wrapper of the suite's own around esbuild.build called with src/client.js more than two lines from it;
// an entry file of the suite's own that re-exports src/client.js. Those are a reader's to see (主开发 r1453, round wjxrsyg87).
console.log('\n§2q one suite-built client bundle: a suite builds src/client.js as the product does, through scripts/client-bundle.mjs — every other way is a named row');
{
  const t2q = Date.now();   // PRINTED at the section's end (its share of the suite's time), never judged
  const CB = await import('./client-bundle.mjs');
  const TOOLS = {
    'scripts/ci.mjs': 'reachContext READS the client step out of package.json (a regex literal naming esbuild + src/client.js); it builds nothing',
    'scripts/symbolicate.mjs': 'THE parser of the client step (clientBuildOptions — the helper reads the product through it) and an in-memory rebuild of the served bundle to map a stack, byte-identical by construction',
    'scripts/dbg-comm-surfaces.mjs': 'a debugging script, in no tier (it is never a gate) — built by hand when a lane looks at a page',
    'scripts/dbg-huge-paging.mjs': 'a debugging script, in no tier (it is never a gate) — built by hand when a lane looks at a page',
  };
  const FIXTURE = {
    'scripts/test-incident-recorder.mjs': 'builds a two-file FIXTURE client with the product\'s own options (symbolicate.clientBuildOptions) plus an external source map — the symbolication proof; it loads no page',
  };
  // the suites whose own scratch hub serves the client they built (public/bundle.js by the hub's route) — CLOSED (主开发 r1305)
  const HUB_ROAD = new Set([
    "scripts/test-ax-budget.mjs",
    "scripts/test-boot-reload-ready.mjs",
    "scripts/test-browser-live-input.mjs",
    "scripts/test-browser-live.mjs",
    "scripts/test-browser-profiles-ui.mjs",
    "scripts/test-browser-replay-ui.mjs",
    "scripts/test-browser-switcher-ui.mjs",
    "scripts/test-browser-who-ui.mjs",
    "scripts/test-cache-warmth-chrome.mjs",
    "scripts/test-card-list-indent-chrome.mjs",
    "scripts/test-channel-lark-threads-ui.mjs",
    "scripts/test-channel-names-ui.mjs",
    "scripts/test-channel-revisions-ui.mjs",
    "scripts/test-channel-threads-ui.mjs",
    "scripts/test-channel-window-render.mjs",
    "scripts/test-channels-aggregate-ui.mjs",
    "scripts/test-channels-e2e.mjs",
    "scripts/test-channels-groups-e2e.mjs",
    "scripts/test-channels-list-polish-ui.mjs",
    "scripts/test-channels-panel-redraw.mjs",
    "scripts/test-chat-paging.mjs",
    "scripts/test-chat-send-landing.mjs",
    "scripts/test-claude-steer-chrome.mjs",
    "scripts/test-claude-wrapper-queue.mjs",
    "scripts/test-cli-missing-chrome.mjs",
    "scripts/test-connection-notice-chrome.mjs",
    "scripts/test-connection-notice-slowlink-chrome.mjs",
    "scripts/test-desktop-move.mjs",
    "scripts/test-desktop-resume-paging.mjs",
    "scripts/test-desktop-xpra-window-scale.mjs",
    "scripts/test-desktop-xpra-window-seamless.mjs",
    "scripts/test-dialog-yield-chrome.mjs",
    "scripts/test-exit-hop-chrome.mjs",
    "scripts/test-exit-late-chrome.mjs",
    "scripts/test-exit-slow-chrome.mjs",
    "scripts/test-feed-miss-ui.mjs",
    "scripts/test-global-search-ui.mjs",
    "scripts/test-integrations-ui.mjs",
    "scripts/test-midturn-order-chrome.mjs",
    "scripts/test-minimap-jump.mjs",
    "scripts/test-mobile-back-chrome.mjs",
    "scripts/test-new-session-dialog.mjs",
    "scripts/test-pair-dialog-polish.mjs",
    "scripts/test-phone-desktop-sync.mjs",
    "scripts/test-phone-refusal-wrap-chrome.mjs",
    "scripts/test-phone-resume-keeps-layout-ui.mjs",
    "scripts/test-phone-titlebar-ui.mjs",
    "scripts/test-plugin-consent-chrome.mjs",
    "scripts/test-popover-frame-close.mjs",
    "scripts/test-queue-steer.mjs",
    "scripts/test-reach-model.mjs",
    "scripts/test-reattach-stagger-ui.mjs",
    "scripts/test-reconnect-storm.mjs",
    "scripts/test-record-clear-client.mjs",
    "scripts/test-resume-pages-follow-chrome.mjs",
    "scripts/test-session-title-ui.mjs",
    "scripts/test-slack-search-chrome.mjs",
    "scripts/test-split-restore-hidden.mjs",
    "scripts/test-stage-overlap.mjs",
    "scripts/test-tab-close-confirm-ui.mjs",
    "scripts/test-taskbar-group-ui.mjs",
    "scripts/test-tasks-mirror-race.mjs",
    "scripts/test-title-chips-ui.mjs",
    "scripts/test-toolbar-fold-ui.mjs",
    "scripts/test-tray-voice-phone.mjs",
    "scripts/test-vault-chrome.mjs",
    "scripts/test-window-reveal-desktop-ui.mjs"
  ]);
  // (the helper itself, and THIS suite — its own planted shapes below — are not read)
  const files = String(git(REPO, ['ls-files', 'scripts'])).split('\n').filter((f) => /\.(mjs|cjs|js)$/.test(f) && f !== 'scripts/client-bundle.mjs' && f !== 'scripts/test-ci-gate.mjs');
  // THE census, ONE function for the tree and for the planted control below: [file, text] pairs in, each text read once (an
  // own-way file's text is kept for the door check, every other one dropped) → what builds its own way, what is not a named row,
  // which row is stale, which own-way build is fed to a page through the debugging door
  const censusOf = (pairs, rows) => {
    const own = new Map(), text = new Map();
    for (const [f, t] of pairs) { const h = CB.ownClientBuilds(t); if (h.length) { own.set(f, h); text.set(f, t); } }
    const unnamed = [...own.keys()].filter((f) => !rows.has(f)).map((f) => `${f}:${own.get(f).map((h) => h.line).join(',')}`);
    const stale = [...rows].filter((f) => !own.has(f));
    const door = [...own.keys()].filter((f) => { const L = text.get(f).split('\n'); return L.some((l, i) => /Fetch\.fulfillRequest/.test(l) && /bundle\.js/.test(L.slice(Math.max(0, i - 3), i + 2).join(' '))); });
    return { own, unnamed, stale, door };
  };
  const rows = new Set([...Object.keys(TOOLS), ...Object.keys(FIXTURE), ...HUB_ROAD]);
  const { own, unnamed, stale, door } = censusOf((function* () { for (const f of files) yield [f, fs.readFileSync(path.join(REPO, f), 'utf8')]; })(), rows);
  console.log(`  · ${own.size} file(s) build src/client.js their own way: ${Object.keys(TOOLS).length} tools, ${Object.keys(FIXTURE).length} fixture, ${HUB_ROAD.size} on their hub's road (closed); every door-served bundle goes through the helper`);
  ok(!unnamed.length, `every file that builds src/client.js its own way is a NAMED row — none new${unnamed.length ? ' — NOT NAMED (build through scripts/client-bundle.mjs, or name its row with its reason): ' + unnamed.join(' ') : ''}`);
  ok(!stale.length, `no named row is stale (its file still builds its own way; the closed list only shrinks)${stale.length ? ' — STALE: ' + stale.join(' ') : ''}`);
  ok(!door.length, `no own-way build is fed to a page through the debugging door (Fetch.fulfillRequest of /bundle.js)${door.length ? ' — ' + door.join(' ') : ''}`);
  // the helper: the product's own options, through the one parser
  const args = CB.productClientArgs(REPO);
  ok(args[0] === 'src/client.js' && args.includes('--minify') && args.includes('--bundle') && !args.some((a) => a.startsWith('--outfile')), `the helper builds with the product's own client step (${args.join(' ')}) — minified, its outfile left out`);
  // the census over planted shapes, and its CONTROL: a planted suite building its own way is found (red by name)
  const shapes = {
    cli: "execSync(`${path.join(repo, 'node_modules/.bin/esbuild')} src/client.js --bundle --outfile=m.js --format=iife`, { cwd: MUT });",
    argv: "execFileSync(ESBUILD, ['src/client.js', '--bundle', '--outfile=public/bundle.js'], { cwd: wt });",
    api: "await esbuild.build({ entryPoints: [path.join(wt, 'src/client.js')], bundle: true });",
    helper: "buildClientBundle({ repo, root: MUT, outFile: path.join(MUT, 'm.js') }); // src/client.js esbuild",
    comment: '// esbuild src/client.js --bundle (a comment)',
  };
  const seen = Object.fromEntries(Object.entries(shapes).map(([k, v]) => [k, CB.ownClientBuilds(v).map((h) => h.how).join()]));
  ok(seen.cli === 'cli' && seen.argv === 'argv' && seen.api === 'api' && seen.helper === '' && seen.comment === '', `the census reads the three own ways (command line, argv, the JS API) and never the helper or a comment (${JSON.stringify(seen)})`);
  // CONTROL (主开发 r1453 (a)): a PLANTED tree through the same censusOf — an own-way suite no row names, a named own-way suite fed
  // to its page through the debugging door, a row whose file now builds through the helper, and the two clean shapes (a named
  // suite on its hub's road; a helper-built bundle fed through the door) — each red found, by name, and nothing else
  const DOOR = "await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/bundle.js*', requestStage: 'Request' }] });\n"
    + "onPaused = (p) => cdp('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, body: B });";
  const P = (n) => `scripts/test-planted-${n}.mjs`;
  const plantedTree = [[P('unnamed'), shapes.cli], [P('door'), shapes.argv + '\n' + DOOR], [P('gone'), shapes.helper],
    [P('hub-road'), shapes.api], [P('helper-door'), shapes.helper + '\n' + DOOR]];
  const pc = censusOf(plantedTree, new Set([P('door'), P('gone'), P('hub-road')]));
  const pcSeen = { unnamed: pc.unnamed, stale: pc.stale, door: pc.door };
  ok(JSON.stringify(pcSeen) === JSON.stringify({ unnamed: [P('unnamed') + ':1'], stale: [P('gone')], door: [P('door')] }),
    `CONTROL: over a planted tree the census names each red — the unnamed own-way suite, the stale row, the own-way build fed through the door — and passes the named hub-road suite and the helper-built bundle fed through the door (${JSON.stringify(pcSeen)})`);
  console.log(`  · §2q took ${Date.now() - t2q} ms (the census read ${files.length} file(s) once each)`);
}
} finally {
  for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
}

printProfile();
report();

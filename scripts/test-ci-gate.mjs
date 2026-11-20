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
// test-ci-gate-reaper.mjs §9–§10 · test-ci-gate-hang.mjs §11 · test-ci-gate-watchdog.mjs §12; what they share is
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
import { anchored } from './scratch.mjs';
import { callArgs } from './lib/check.mjs'; // B-1388: a helper's Nth argument (the swap census's argument scanner)
import { GIT_REDIRECTORS, gitEnvFrom } from './git-env.mjs';
import { REPO, GIT_ENV, ok, tmpDirs, mktmp, git, makeRepo, commit, STUB_SLICE, stubGateRepo, writeMarker, report } from './ci-gate-kit.mjs'; // the shared kit (lane fast-tier-ratchet: the gate is seven ≤ 10 s parts)

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
  ok(FAST_SUM_CAP_MS === 1486 * 1000, `the fast tier's sum cap is 1486 s (2026-11-19, int413: +36 s UP by arithmetic — the merged stated truth of the picks so far: 1485.587 s over 747 fast rows; 2026-11-19, .413, bl-tests-a: +1 s UP by arithmetic — B-0f3d's restated test-dir-complete over checkpoint 2 with B-08d5's row: 1481.537 s over 747 fast rows; 2026-11-19, int413: +31 s UP by arithmetic — the merged stated truth of the picks so far: 1480.137 s over 746 fast rows; 2026-11-19, int413: +13 s UP by arithmetic — the merged stated truth of the picks so far: 1462.921 s over 735 fast rows; 2026-11-19, lane bl-loop-a ckpt61 starter-emfile: + test-hub-start-failures 2.3 s by its measure (split out of test-hub-program-starts, whose row is the base's); the stated sum 1447.248 + 2.3 = 1449.548 s ⇒ 1450 by arithmetic. Before: 2026-11-19, int411: +195 s UP by arithmetic — the merged stated truth of the picks so far: 1447.248 s over 728 fast rows; 2026-11-19, int411: +190 s UP by arithmetic — the merged stated truth of the picks so far: 1442.098 s over 726 fast rows; 2026-11-18, int411: +182 s UP by arithmetic — the merged stated truth of the picks so far: 1434.178 s over 726 fast rows; 2026-11-18, int411: +181 s UP by arithmetic — the merged stated truth of the picks so far: 1430.678 s over 725 fast rows; 2026-11-18, int411: +175 s UP by arithmetic — the merged stated truth of the picks so far: 1424.658 s over 724 fast rows; 2026-11-18, int411: +167 s UP by arithmetic — the merged stated truth of the picks so far: 1416.258 s over 724 fast rows; 2026-11-18, int411: +165 s UP by arithmetic — the merged stated truth of the picks so far: 1414.858 s over 724 fast rows; 2026-11-18, int411: +163 s UP by arithmetic — the merged stated truth of the picks so far: 1412.688 s over 722 fast rows; 2026-11-18, int411: +151 s UP by arithmetic — the merged stated truth of the picks so far: 1400.688 s over 719 fast rows; 2026-11-18, int411: +150 s UP by arithmetic — the merged stated truth of the picks so far: 1399.588 s over 719 fast rows; 2026-11-18, int411: +147 s UP by arithmetic — the merged stated truth of the picks so far: 1396.088 s over 718 fast rows; 2026-11-18, int411: +145 s UP by arithmetic — the merged stated truth of the picks so far: 1394.844 s over 718 fast rows; 2026-11-18, int411: +142 s UP by arithmetic — the merged stated truth of the picks so far: 1391.944 s over 718 fast rows; 2026-11-18, int411: +145 s UP by arithmetic — the merged stated truth of the picks so far: 1394.344 s over 718 fast rows; 2026-11-18, int411: +115 s UP by arithmetic — the merged stated truth of the picks so far: 1364.344 s over 718 fast rows; 2026-11-18, int411: +109 s UP by arithmetic — the merged stated truth of the picks so far: 1358.444 s over 717 fast rows; 2026-11-18, lane gmail-connect-wall's restack moved onto 2.369.412's checkpoint b3ebb776e: +8 s UP by arithmetic — 1321.336 s over 694 + B-94d3 part one's 18 «-pins» rows 7.7 s + test-vault-otp-field 0.2 s = 1329.236 s over 713; 2026-11-18, int411: +72 s UP by arithmetic — the merged stated truth of the picks so far: 1321.336 s over 694 fast rows; 2026-11-18, int411: +69 s UP by arithmetic — the merged stated truth of the picks so far: 1318.936 s over 693 fast rows; 2026-11-18, int411: +66 s UP by arithmetic — the merged stated truth of the picks so far: 1315.106 s over 693 fast rows; 2026-11-18, int411: +65 s UP by arithmetic — the merged stated truth of the picks so far: 1314.806 s over 693 fast rows; 2026-11-18, int411: +64 s UP by arithmetic — the merged stated truth of the picks so far: 1313.406 s over 692 fast rows; 2026-11-18, int411: +55 s UP by arithmetic — the merged stated truth of the picks so far: 1304.106 s over 689 fast rows; 2026-11-18, int411: +52 s UP by arithmetic — the merged stated truth of the picks so far: 1301.406 s over 687 fast rows; 2026-11-18, int411: +38 s UP by arithmetic — the merged stated truth of the picks so far: 1287.796 s over 686 fast rows; 2026-11-18, int411: +22 s UP by arithmetic — the merged stated truth of the picks so far: 1271.675 s over 645 fast rows; 2026-11-18, int411: +15 s UP by arithmetic — the merged stated truth of the picks so far: 1264.620 s over 640 fast rows; 2026-11-18, int411: +8 s UP by arithmetic — the merged stated truth of the picks so far: 1257.720 s over 634 fast rows; 2026-11-18, int411: +7 s UP by arithmetic — the merged stated truth of the picks so far: 1256.220 s over 633 fast rows; 2026-11-18, bl-browser-b -restack-411: +2 s UP by arithmetic — test-browser-passkey restated 9.2 → 11.5 s with its named debt B-1d75, the stated sum 1253.520 → 1255.820 s over 633 fast rows; 2026-11-18, bl-browser-b B-b56d: +4 s UP by arithmetic — test-browser-prompts restated 1.7 → 5.9 s by its measured run, the stated sum 1249.320 → 1253.520 s over 633 fast rows; 2026-11-18, int410: +90 s UP by arithmetic — the merged stated truth of the picks so far: 1249.353 s over 634 fast rows; 2026-11-18, int410: +88 s UP by arithmetic — the merged stated truth of the picks so far: 1247.853 s over 634 fast rows; B-a2c9 (bl-ci 2026-11-18, restacked onto int410's block-8a checkpoint ececa0a1f): +51 s by arithmetic — the train's 1195.703 s over 635 fast rows + this unit's restatements (the eight read on the test machine put in the box's scale, test-stash-strip moved heavy, test-oat-mint 12.1 → 9.1: +49.850 s) = 1245.553 s over 634 fast rows + 0.5 s a later row of the stack states (test-ci-heavy-queue 8.4 → 8.9, B-88e5) = 1246.053 s; 1247 = the next whole second above it; before: 2026-11-18, int410: +36 s UP by arithmetic — the merged stated truth of the picks so far: 1195.553 s over 634 fast rows; 2026-11-18, int410: +30 s UP by arithmetic — the merged stated truth of the picks so far: 1189.353 s over 632 fast rows; 2026-11-18, int410: +28 s UP by arithmetic — the merged stated truth of the picks so far: 1187.953 s over 632 fast rows; 2026-11-18, int410: +22 s UP by arithmetic — the merged stated truth of the picks so far: 1181.720 s over 630 fast rows; 2026-11-18, int410: +13 s UP by arithmetic — the merged stated truth of the picks so far: 1172.281 s over 604 fast rows; 2026-11-18, the hotfix 2.369.409 «one ask per file per synchronous run»: +5 s UP by arithmetic — 1154.839 s over 599 + test-pool-pass-reads 4.4 s as measured = 1159.239 s over 600; 2026-11-17, the hotfix 2.369.408 «the X picture follows the tab on show» and its cure rounds: +5 s UP by arithmetic — 1149.839 s over 599, test-browser-picture 1.5 → 6.5 s = 1154.839 s; 2026-11-17, int407: +39 s UP by arithmetic — 1110.989 s over 591 rows + test-channel-store-loop-free 7.0 + test-channel-store-writer-laws 7.8 + test-agent-lock 0.9 + test-hub-boot 5.0 + test-separation-ratchets 4.0 + test-keeper-sweep-yields 6.1 + test-loop-census 5.6 + test-loop-day-report 0.3 (new) + test-store-write-census 6.5 → 8.6 + test-loop-hold 0.1 → 0.15 (restated) = 1149.839 s over 599; 2026-11-17, the channel store's .407 prep-mirror cure: +2 s UP by arithmetic — test-channel-store-writer-laws restated 5.6 → 7.8 s by its (k) legs = 1127.939 s over 593; 2026-11-17, channel-store-off-loop cure r1 moved onto 2.369.406: +5 s UP by arithmetic — 1120.139 s over 592 + the new row test-channel-store-writer-laws 5.6 s = 1125.739 s over 593; 2026-11-17, channel-store-off-loop c1 moved onto 2.369.406: +10 s UP by arithmetic — the release's 1110.989 s over 591 + test-channel-store-loop-free 7.0 s (new) + test-store-write-census 6.5 → 8.6 s = 1120.089 s over 592; 2026-11-16, int406: +10 s UP by arithmetic — the release's rows as stated, 1100.089 s over 588, + the three new fast rows of this train, each lane's own stated measurement: test-grants-read-lookup 6.7 s, test-reading-truth 0.6 s, test-resume-all-paced 3.6 s = 1110.989 s over 591 (each lane had raised the cap alone from 1100.089; the train sums the new rows once); 2026-11-16, lane grants-read-is-a-lookup for 2.369.406 on the release 2.369.405: +6 s UP by arithmetic — 70efb5e10's 1100.089 s over 588 + the new test-grants-read-lookup 6.7 s = 1106.789 s over 589; 2026-11-16, lane vault-login on the release 2.369.403: +9 s UP by arithmetic — the release's 1091.489 s + test-browser-login restated 1.0 → 9.6 s = 1100.089 s over 588; 2026-11-15, int403: +7 s UP by arithmetic — the train's rows as stated, 1085.689 s over 588 fast rows (2.369.402's 1084.219 s over 585 + the three units' own rows; vault-login is off this release), + test-oat-mint restated 9.1 → 12.1 s (+3.000; alone ×3: 12.05 / 12.12 / 12.16 s; its over names B-fe02) + test-csp-report restated 4.6 → 7.4 s (+2.800; alone ×3: 7.57 / 7.45 / 7.41 s) = 1091.489 s over 588; 2026-11-14, int402: +15 s UP by arithmetic — 2.369.401's rows as stated, 1069.280 s over 575, + the ten units' own rows and the train's (585): int402 +6.100 (test-suite-files-parse 4.100; test-user-state-bounds 7.800 → 9.800, law A's roads over 3 rounds), fable-52-cli-321 r16 +3.603 (test-status-bar-chips 0.197 → 2.900, test-fable-cap-pool-storm 1.400 → 2.300), ui-controls-and-bugs +1.600 (test-control-says-why 0.900, test-write-only-secrets 0.700), chat-attachments-persist +1.200 (test-chat-attachments 1.100, test-transcript-parity 1.300 → 1.400), machine-needs-at-pairing +1.200 (test-ffmpeg-install 0.510, test-machine-setup 0.440, test-machine-needs 0.250), queued-is-not-woke +0.600 (test-wait-watch), B-6ded +0.251 (test-usage-walk-parity 0.717 → 0.968), oat-add-door +0.200 (test-oat-add-door), chrome-157 +0.103 (test-cdp-census 0.117 → 0.220), artifacts-by-intent +0.082 (test-artifacts-intent 0.110 new, five rows restated −0.028); stream-recovery and the cpu-capture cure 0 = 1084.219 s; 2026-11-14, int402: +13 s UP by arithmetic — 2.369.401's rows as stated, 1069.280 s over 575, + the ten units' own rows and the train's (585): int402 +4.100 (test-suite-files-parse), fable-52-cli-321 r16 +3.603 (test-status-bar-chips 0.197 → 2.900, test-fable-cap-pool-storm 1.400 → 2.300), ui-controls-and-bugs +1.600 (test-control-says-why 0.900, test-write-only-secrets 0.700), chat-attachments-persist +1.200 (test-chat-attachments 1.100, test-transcript-parity 1.300 → 1.400), machine-needs-at-pairing +1.200 (test-ffmpeg-install 0.510, test-machine-setup 0.440, test-machine-needs 0.250), queued-is-not-woke +0.600 (test-wait-watch), B-6ded +0.251 (test-usage-walk-parity 0.717 → 0.968), oat-add-door +0.200 (test-oat-add-door), chrome-157 +0.103 (test-cdp-census 0.117 → 0.220), artifacts-by-intent +0.082 (test-artifacts-intent 0.110 new, five rows restated −0.028); stream-recovery and the cpu-capture cure 0 = 1082.219 s; 2026-11-13, fable-52-cli-321 r16 port onto 2.369.399: +3 s UP by arithmetic — test-fable-cap-pool-storm 1.4 → 2.3 + test-status-bar-chips 0.197 → 2.9 on the .399 rows' 1069.095 s over 574; before it, int399: +2 s UP by arithmetic — the .399 rows as stated: 1067.750 s (.398) + connection-notice-once A 0.070 (test-connection-notice) + machine-needs-at-pairing 0.025 (test-installed-apps 0.375 → 0.400 s by its own measurement) + the usage-walk pin 1.250 (test-ledger-readers-census) = 1069.095 s over 574 rows; pair-dialog-polish, file-preview-mount, the law 1 follow-up, k3-hours-units and job-logs-sweep K7 + K10 add none; 2026-11-12, int398: +2 s UP by arithmetic — the .398 rows as stated: 1065.600 s (.397) + mount-class-by-source 0.250 (test-fs-canary 6.7 → 6.95 s by its own measurement) + job-logs-sweep 0.100 (test-job-logs-sweep 0.1) + queued-is-not-woke law 1 1.300 (test-queued-wake 1.2, test-spend-paths 4.4 → 4.5) + reply-door-follows-enter 0.500 (test-reply-door 0.5) = 1067.750 s over 572 rows; the §30 cure, K2 / K3 / round 2, the Plugins modal close and the echo seam add none; 2026-11-12, int397: +62 s UP by arithmetic — the .397 rows as stated: 1003.125 s (.396) + the seam 5.075 (test-browser-passkey 4.8 → 9.2, test-freeze-probe 0.025 → 0.7) + usage-relearn-stepped 14.3 (test-usage-relearn-cap 8.2, test-usage-relearn-stepped 6.1) + hub-sync-holds 14.2 (test-hub-sync-holds 7.8, test-loop-child-census 3.0, test-update-clean 3.4) + ledger-boot-load 10.2 (test-ledger-boot-load 4.4, test-ledger-boot-fail 6.0, test-usage-relearn-cap 8.2 → 8.0 by its own measurement) + sidebar-echo-order 17.6 (test-user-state-bounds 7.8, test-user-state-echo 9.8) + account-reset-door 1.1 (test-account-reset-door, 0.95 then 1.1 by K1's own measurement) = 1065.600 s over 569 rows; the hub-loop-stalls test commit, passkey round 3 and oat-chip-icon add none (the float row left the train before the bump; sidebar-echo-order's keepalive commit restates no row); sidebar-echo-order's own 1021 on its base is superseded; 2026-11-12, lane sidebar-echo-order: +17 s UP by arithmetic on its own base — the .396 tree's 1003.125 s over 559 fast rows + test-user-state-echo 9.80 (new) + test-user-state-bounds 7.80 (new) = 1020.725 s over 561 fast rows; 2026-11-11, int396: +32 s UP by arithmetic — the .396 rows as stated: 971.295 s (.395) + hub-loop-stalls 16.5 (test-store-writer-laws 8.0, test-store-write-census 6.5, test-store-writer-r4 2.0) + the groups stack 9.23 (test-roster-per-pass 6.80, test-groups-sweep-on-change 1.65, test-membership-index 0.78) + usage B 6.1 (test-usage-ledger-walk 3.6 → 9.7) = 1003.125 s over 559 rows; window-close and the mkdir pin add none; 2026-11-11, int394: +1 s UP by arithmetic — the .393 tree's 970.325 s over 552 fast rows + test-vault-masker-once 0.80 (new, the vault masker built once per vault state) = 971.125 s over 553; 2026-11-11, int393: +1 s UP by arithmetic — the .392 tree's 969.165 s over 549 fast rows + test-cli-self-measure 0.76, test-cpu-capture 0.30, test-loop-hold 0.10 (new: cli-self-measure, hub-loop-stalls) = 970.325 s over 552 (fable-52-cli-321 left the train: its restated rows are not here); 2026-11-11, int392: +4 s UP by arithmetic — the .391 tree's 965.565 s over 548 fast rows + test-usage-ledger-walk 3.60 (new, the usage-ledger-walk hotfix, as stated: measured in a depth-1 copy, its archive legs a named SKIP) = 969.165 s over 549; 2026-11-10, int391: +4 s UP by arithmetic — the .390 tree's 961.375 s over 546 fast rows + test-agy-models-door 3.90 (new, agy-models) + test-still-press 0.29 (new, dialog-press) = 965.565 s over 548 fast rows; 2026-11-10, int390: +6 s UP by arithmetic — the .389 tree's 955.275 s over 544 fast rows + test-jobs-addressed 2.80 (new, jobs-addressed-push) + test-seen-marks +1.00, test-channel-groups +0.50, test-stash-strip +0.40 (restated, report-mark-on-ack) + test-claude-update-needs-nothing 0.70 (new, cli-update-needs-nothing) + test-vault-paste +0.70 (restated, login-request-card) = 961.375 s over 546 fast rows; 2026-11-10, int389: +12 s UP by arithmetic — the .388 tree's 943.27 s over 542 fast rows + test-ci-heavy-verdict 3.60 (new, ci-heavy-verdict r4) + test-ci-heavy-queue 8.40 (new, the queue) = 955.27 s over 544; 2026-11-09, int388: +6 s UP to the MERGED stated truth — the .388 tree's 943.28 s over 542 rows: the .387 base's 937.99 s + test-midturn-order 0.12 (new) + test-paced-wake-retry 4.20 (new) + test-path-linkify +0.53 + test-user-todos-layout +0.34 + test-channel-outbox +0.10 — each row its lane's full-speed measure; 938 s since 2026-11-06, int383: +10 s UP to the MERGED measured truth — the .383 tree's 937.56 s over 539 rows: the .382 base's 927.90 s + test-engine-distribution +8.80 + usage-two-rings' rows +0.42 + test-roster-row-fold +0.44; 928 s since 2026-11-06, int382: +6 s UP to the MERGED measured truth — the .382 tree's 927.90 s over 536 rows: the .381 base's 921.54 s + test-channel-outbox +0.70 + tailnet-names' rows +1.67 + phone-resume-keeps-layout's rows +4.00; 922 s since 2026-11-05, int381: +1 s UP to the MERGED measured truth — the .381 tree's 921.54 s over 534 rows: the .380 base's 920.14 s + test-layout-dup-storm restated +1.20 + test-channel-send-files restated +0.20; 921 s since 2026-11-05, int380: +1 s UP to the MERGED measured truth — the .380 tree's 920.14 s over 534 rows: the b7c910c3c base's 919.57 s + test-layout-dup-storm 0.40 (new, .379) + test-cache-warmth restated +0.02 + test-message-origin 0.14 (new); 920 s since 2026-11-02, int372: +1 s UP to the measured truth — the .372 picks' measured fast deltas on the .371 base's 918.31 s: test-agy-wall-signal 0.29 (new), test-browser-builds restated 9.1 → 9.5 (engine-spi-egress L1b) — each lane alone under 919, the train 919.00 s; 919 s since 2026-11-01, int370: +1 s UP to the measured truth — held-except-doors' measured fast delta on the .369 base's 917.69 s, the train 918.21 s; 918 s since 2026-10-31, int367: +4 s UP to the measured truth — the union of the .367 picks' measured fast deltas, +7.15 s on the .366 base's 910.54 s: vault-standing-request +3.00, passkey-browse-yourself +3.40, touch-chip-cause +0.75 — each lane alone under 914, the train 917.69 s; 914 s since 2026-10-27, int360: +4 s for the union of the .360 picks' measured new fast suites — 909.23 s on the .359 base + 3.42 s; 910 s since 2026-10-25, lane engine-distribution: +6 s for P4's measured legs — the restated sum 907 s; 904 s since 2026-10-20, lane fast-tier-ratchet: the honest restated sum 883.7 s + 20 s — UP to the truth from 640 s, DOWN by the speed-ups; 600 s by policy until 2.369.316, 480 s until 2.369.263) — moving it is a deliberate edit here (${FAST_SUM_CAP_MS / 1000} s)`);
  ok(budget < FAST_SUM_CAP_MS, `the fast tier's measured sum stays under ${FAST_SUM_CAP_MS / 1000} s (${Math.round(budget / 1000)} s over ${fast.length} suites — the rule's point, re-measured)`);
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
  ok(JSON.stringify(slowRows) === JSON.stringify(overRows) && overRows.length <= 12,
    `the over-list == the fast rows ≥ 10 s by their stated time (${overRows.length}: ${overRows.join(', ') || 'none'}) — no silent slow row, no paid debt kept`);
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
  ok(hook.indexOf('--check-heavy') < hook.indexOf('node scripts/ci.mjs ||'),
    'the hook asks for the heavy verdict BEFORE it spends the fast tier');
  ok(/node scripts\/ci\.mjs --fast-part=\$\{\{ matrix\.part \}\}\/2 --keep-going\s*$/m.test(wf) && wf.includes('node scripts/ci.mjs --heavy'),
    'the Actions mirror runs BOTH tiers (the fast tier as its parts, each to its end: --keep-going names every red — B-d24c)');
  // THE FAST TIER IN PARTS (B-7353): the hosted fast job is a matrix of parts, each a cut of the tier by the rows' stated times
  { const C = await import('./ci.mjs');
    const fp = C.workflowFastPartsAt(wf), tierRows = fast;
    ok(fp && fp.n === 2 && fp.slots.join() === '1,2' && /name: fast \$\{\{ matrix\.part \}\}\/2/.test(wf) && /ci-fast-fail-logs-\$\{\{ github\.sha \}\}-\$\{\{ matrix\.part \}\}/.test(wf),
      `ci.yml's fast job is a matrix of ${fp ? fp.n : '?'} parts, named fast i/n, its fail logs one artifact per part (two jobs cannot share an artifact name)`);
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
console.log('\n§2e no fast suite asserts a wall-clock bound on its own run');
{
  const WC = await import('./wall-clock-census.mjs');
  const suites = WC.censusOver(SUITES);
  const baseline = JSON.parse(fs.readFileSync(WC.BASELINE, 'utf-8'));
  const v = WC.ratchetVerdict(suites, baseline);
  const by = {};
  for (const x of suites) for (const f of x.findings) by[f.kind] = (by[f.kind] || 0) + 1;
  const held = suites.flatMap((x) => x.findings.filter((f) => f.kind === 'LITERAL').map((f) => `${x.name}:${f.line} ${f.text}`));
  console.log(`    ${suites.length} fast suites · ${Object.entries(by).map(([k, n]) => `${n} ${k}`).join(' · ')}`);
  for (const h of held) console.log('      held by the ratchet: ' + h);
  const nFast = SUITES.filter((r) => r.tier === 'fast').length;
  ok(suites.length === nFast && nFast > 300, `the census read every fast suite (${suites.length} of ${nFast})`);
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
  const AENV = { CI_APT_STATE: aptState, CI_APT_OS_RELEASE: osRel };
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
  // the bound itself, over a stub apt-get that never answers (a stalled mirror): the call is killed, the step red BY NAME
  const stub = path.join(mktmp('aptstub'), 'bin');
  fs.mkdirSync(stub);
  fs.writeFileSync(path.join(stub, 'apt-get'), '#!/bin/bash\nexec sleep 30\n', { mode: 0o755 });
  const hung = spawnSync('bash', [path.join(REPO, 'scripts', 'ci-apt.sh'), 'dtach'], { encoding: 'utf-8', env: { PATH: `${stub}:${process.env.PATH}`, CI_APT_SOURCES_DIR: dir, CI_APT_SUDO: '', CI_APT_BOUND: '0.3' , ...AENV } });
  okd(hung.status === 124 && /^::warning::ci-apt: apt-get … update passed its 0\.3 s bound \(a stalled mirror\)$/m.test(hung.stderr) && /^::error::ci-apt: apt-get … update passed its 0\.3 s bound \(a stalled mirror\)$/m.test(hung.stderr)
    && /ONCE more against http:\/\/archive\.ubuntu\.com\/ubuntu/.test(hung.stdout) && !/install -y/.test(hung.stdout + hung.stderr),
    `an apt call past its bound is killed; a stalled update is tried ONCE more on the second mirror (a warning), and when that stalls too the step goes red naming it — the install never starts (exit ${hung.status})`, hung.stdout + hung.stderr);
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
  const DOOR = /^bash scripts\/ci-npm\.sh (?:ci|install -g(?: [@\w./-]+)+)$/;
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
  okd(!v.bad.length && v.doorSteps === 4 && v.suiteSteps === 2,
    `every npm install goes through scripts/ci-npm.sh (${v.doorSteps} steps: the claude CLI + npm ci in fast and heavy) and both scripts/ci.mjs steps are one plain line, once per job, after the door's npm ci (${v.suiteSteps})`, v.bad.join('\n'));
  // the controls: mutant copies of ci.yml, each RED for its own reason
  const ci = files.find(([f]) => f === 'ci.yml')[1];
  const FAST_RUN = '      - run: node scripts/ci.mjs --fast-part=${{ matrix.part }}/2 --keep-going\n', HEAVY_RUN = /( {6}- run: )(node scripts\/ci\.mjs --heavy [^\n]*)/;
  const MUTANTS = [
    ['the fast job\'s npm ci bare again', (t) => t.replace('run: bash scripts/ci-npm.sh ci', 'run: npm ci'), /an install outside the door: npm ci$/m],
    ['the claude CLI installed bare', (t) => t.replace('run: bash scripts/ci-npm.sh install -g', 'run: npm i -g'), /an install outside the door: npm i -g @anthropic-ai\/claude-code/],
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
    ['dtach unbounded', 'yml', (t) => t.replace(/        run: bash scripts\/ci-apt\.sh dtach\n( {8}#[^\n]*\n)?        timeout-minutes: 6\n/, '        run: bash scripts/ci-apt.sh dtach\n'), /job fast: «Install dtach [^»]*» has no timeout-minutes/],
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
  for (const f of files) for (const h of oldPageLoops(fs.readFileSync(f, 'utf8'), acorn)) (h.error ? unread : found).push(`${path.relative(REPO, f)}:${h.line}${h.error ? ' ' + h.error.slice(0, 60) : ''}`);
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
} finally {
  for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
}

report();

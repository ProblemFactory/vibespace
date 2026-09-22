#!/usr/bin/env node
// rate_limit_event passive quota capture (B-e5c9). ONE shared implementation
// (src/rate-limit-capture.js) drives BOTH local and remote chat sessions —
// this pins the parse + the identity-group cache discipline that the server
// wiring depends on. Real captured-sample shapes + the anti-poison fetchedAt
// rule (a resetsAt-only event must not promote a stale file to "freshest").
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { parseRateLimitEvent, captureRateLimitEvent, lanesOf, lanesSnapshot } = require(REPO + '/src/rate-limit-capture.js');

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };

// ── parse ──
// the EXACT shape captured from a real 2.1.226 buffer (5h, allowed, overage)
const real = parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', resetsAt: 1786332600, rateLimitType: 'five_hour', overageStatus: 'rejected', overageDisabledReason: 'org_level_disabled_until', isUsingOverage: false }, uuid: 'x', session_id: 's' });
ok(real && real.kind === 'fiveHour' && real.status === 'allowed' && real.resetsAt === 1786332600, 'parses a real captured 5h event');
ok(real.utilization === null, 'no utilization in that sample → null (not fabricated)');
ok(real.overage.status === 'rejected' && real.overage.inUse === false, 'overage fields carried');

const withU = parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'seven_day', utilization: 63, resetsAt: 1786900000 } });
ok(withU.kind === 'sevenDay' && withU.utilization === 0.63, 'integer-percent utilization normalized to 0..1');

const rej = parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: 'five_hour', resetsAt: 1786900000 } });
ok(rej.status === 'rejected', 'rejected status parsed (structured exhaustion signal)');

ok(parseRateLimitEvent({ type: 'assistant' }) === null, 'non-event returns null');
ok(parseRateLimitEvent({ type: 'rate_limit_event' }) === null, 'event with no info returns null');
// camelCase defensive path (2.227.6 — a future JSONL copy)
const camel = parseRateLimitEvent({ type: 'rate_limit_event', rateLimitInfo: { status: 'allowed', rate_limit_type: 'five_hour', used_percentage: 42 } });
ok(camel && camel.kind === 'fiveHour' && camel.utilization === 0.42, 'both key casings accepted');

// ── capture: identity-group cache discipline ──
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-rle-'));
const read = (id) => { try { return JSON.parse(fs.readFileSync(path.join(dir, id + '.json'), 'utf8')); } catch { return null; } };

// a utilization reading writes the bucket + bumps fetchedAt (becomes an anchor)
const r1 = captureRateLimitEvent({ cacheDir: dir, key: 'sub-A', identityIds: ['sub-A'], ev: withU, now: 1000 });
ok(r1.ok && r1.wroteReading && !r1.dead, 'utilization reading writes + flags a reading');
ok(read('sub-A').sevenDay.utilization === 0.63 && read('sub-A').fetchedAt === 1000, 'reading lands + fetchedAt bumped');

// a resetsAt-ONLY event (no utilization, allowed) must NOT promote the file
const noReading = parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'seven_day', resetsAt: 1786999999 } });
const r2 = captureRateLimitEvent({ cacheDir: dir, key: 'sub-A', identityIds: ['sub-A'], ev: noReading, now: 5000 });
ok(r2.ok && !r2.wroteReading, 'resetsAt-only event is not a reading');
ok(read('sub-A').sevenDay.resetsAt === 1786999999, 'resetsAt updated in place');
ok(read('sub-A').fetchedAt === 1000, 'fetchedAt NOT bumped by a non-reading (anti-poison: no false anchor promotion)');

// rejected ⇒ dead bucket, utilization 1, self-expiring reset
const r3 = captureRateLimitEvent({ cacheDir: dir, key: 'sub-A', identityIds: ['sub-A'], ev: rej, now: 9000 });
ok(r3.dead && read('sub-A').fiveHour.utilization === 1 && read('sub-A').fiveHour.status === 'limited', 'rejected marks the bucket dead (utilization 1)');

// identity group: freshest file is the base; siblings marked WITHOUT gaining freshness
fs.writeFileSync(path.join(dir, 'gid-fresh.json'), JSON.stringify({ fetchedAt: 8000, fiveHour: { utilization: 0.1 } }));
fs.writeFileSync(path.join(dir, 'gid-stale.json'), JSON.stringify({ fetchedAt: 100, fiveHour: { utilization: 0.9 } }));
const deadEv = parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: 'five_hour' } });
captureRateLimitEvent({ cacheDir: dir, key: '__global__', identityIds: ['__global__', 'gid-fresh', 'gid-stale'], ev: deadEv, now: 12000 });
ok(read('__global__').fiveHour.utilization === 1 && read('__global__').fiveHour.utilization === 1, 'primary (__global__) marked dead');
ok(read('gid-fresh').fiveHour.utilization === 1 && read('gid-fresh').fetchedAt === 8000, 'existing sibling marked dead but fetchedAt UNTOUCHED');
ok(read('gid-stale').fiveHour.utilization === 1 && read('gid-stale').fetchedAt === 100, 'stale sibling marked dead, still stale (never promoted)');
ok(read('__global__').fetchedAt === 12000, 'primary reading is dead ⇒ fetchedAt bumped (it IS a reading)');

// never CREATE a sibling that did not exist
ok(read('nonexistent') === null && !fs.existsSync(path.join(dir, 'never.json')), 'a missing sibling is never created');

// unknown bucket type surfaces, never silently drops
const scoped = parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'weekly_scoped_fable' } });
const rS = captureRateLimitEvent({ cacheDir: dir, key: 'sub-A', identityIds: ['sub-A'], ev: scoped, now: 20000 });
ok(!rS.ok && rS.unknownType === 'weekly_scoped_fable', 'unknown bucket type surfaces unknownType (no silent drop)');

fs.rmSync(dir, { recursive: true, force: true });
// ── ④ scoped weekly capture (2.340.0): seven_day_<model> → scopedWeekly ─────
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rlc-scoped-'));
  fs.writeFileSync(path.join(dir, 'sub-s1.json'), JSON.stringify({ fetchedAt: Date.now() - 60000, sevenDay: { utilization: 0.4 } }));
  const ev = parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { rateLimitType: 'seven_day_opus', status: 'allowed_warning', utilization: 0.91, resetsAt: Math.floor(Date.now() / 1000) + 86400 } });
  ok(ev.kind === 'scoped' && ev.scopedName === 'opus', '④ seven_day_opus parses as a scoped reading');
  const r = captureRateLimitEvent({ cacheDir: dir, key: 'sub-s1', identityIds: ['sub-s1'], ev });
  ok(r.ok && r.wroteReading, '④ scoped reading is written (freshest-bump discipline applies)');
  const cache = JSON.parse(fs.readFileSync(path.join(dir, 'sub-s1.json'), 'utf-8'));
  const s = (cache.scopedWeekly || []).find((x) => x.name === 'opus');
  ok(s && Math.abs(s.utilization - 0.91) < 1e-9 && s.asOf > 0, '④ scopedWeekly entry carries utilization + asOf', JSON.stringify(s));
  const evR = parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { rateLimitType: 'seven_day_opus', status: 'rejected' } });
  captureRateLimitEvent({ cacheDir: dir, key: 'sub-s1', identityIds: ['sub-s1'], ev: evR });
  const cache2 = JSON.parse(fs.readFileSync(path.join(dir, 'sub-s1.json'), 'utf-8'));
  ok((cache2.scopedWeekly || []).find((x) => x.name === 'opus')?.utilization === 1, '④ scoped rejection marks the bucket dead (utilization 1)');
  const evO = parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { rateLimitType: 'seven_day_overage_included', status: 'allowed' } });
  ok(evO.kind === 'scoped' && evO.modelCap === true && evO.scopedName === null, '④ seven_day_overage_included is the MODEL-CAP lane: a scoped lane the type does not NAME (inc-mubu23bd-5vxi)');
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── ⑤ the monthly-spend-cap reject (live incident 2026-08-20) UNDER THE LANE
//     RULE (inc-mubu23bd-5vxi): a rejected `seven_day_overage_included` is the
//     account's MODEL-CAP lane — marked dead on THAT lane with the EVENT's
//     resetsAt, the plan week untouched, the overage fields landing as before.
//     With nothing on the account naming the cap it is the placeholder
//     `model:cap` / "Model cap" — never the plan; with a cap sharing the reset
//     it is that cap. (2.361.2 wrote the plan week dead here: the pool then
//     read the account as plan-exhausted for a wall that was the bucket's.)
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rlc-ovg-'));
  fs.writeFileSync(path.join(dir, 'sub-m1.json'), JSON.stringify({ fetchedAt: 1000, sevenDay: { utilization: 0.53, status: 'allowed' } }));
  // shape from the REAL captured buffer record (2026-08-20)
  const ev = parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', resetsAt: 1787328000, rateLimitType: 'seven_day_overage_included', overageStatus: 'rejected', overageDisabledReason: 'org_level_disabled_until', isUsingOverage: false } });
  ok(ev.kind === 'scoped' && ev.modelCap && ev.status === 'rejected' && ev.windows === null, '⑤ the 2.361.2 record (no unifiedWindows) parses as a rejected MODEL-CAP lane that states no other window');
  const r = captureRateLimitEvent({ cacheDir: dir, key: 'sub-m1', identityIds: ['sub-m1'], ev, now: 1787194614944 });
  ok(r.ok && r.dead, '⑤ capture reports dead (caller triggers immediate pool eval)');
  const c = JSON.parse(fs.readFileSync(path.join(dir, 'sub-m1.json'), 'utf-8'));
  const ph = (c.scopedWeekly || []).find((s) => s.name === 'Model cap');
  ok(Math.abs(c.sevenDay.utilization - 0.53) < 1e-9 && c.sevenDay.status === 'allowed', '⑤ the PLAN week is untouched (2.361.2 wrote it dead — the incident)', JSON.stringify(c.sevenDay));
  ok(ph && ph.utilization === 1 && ph.status === 'limited' && ph.resetsAt === 1787328000, '⑤ …the un-named model cap is marked dead until the EVENT reset (not a 24h guess), under the placeholder', JSON.stringify(c.scopedWeekly));
  ok((c.limits || []).some((l) => l.limitId === 'model:cap' && l.scope === 'model' && l.family === null) && r.modelCapLane && r.modelCapLane.named === false, '⑤ …as `model:cap` (scope model, family null) — the ladder says nothing named it', JSON.stringify(r.modelCapLane));
  ok(c.overage && c.overage.disabledReason === 'org_level_disabled_until', '⑤ monthly-spend-cap state (overage fields) lands in the cache');
  // the warning form: the representative utilization goes to the lane its type names
  const evW = parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed_warning', resetsAt: 1787677200, rateLimitType: 'seven_day_overage_included', utilization: 0.77, isUsingOverage: false, surpassedThreshold: 0.75 } });
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'rlc-ovg2-'));
  fs.writeFileSync(path.join(dir2, 'sub-m2.json'), JSON.stringify({ fetchedAt: 1000, fiveHour: { utilization: 0.2 }, sevenDay: { utilization: 0.4, resetsAt: 1787677200 } }));
  captureRateLimitEvent({ cacheDir: dir2, key: 'sub-m2', identityIds: ['sub-m2'], ev: evW, now: 2000 });
  const c2 = JSON.parse(fs.readFileSync(path.join(dir2, 'sub-m2.json'), 'utf-8'));
  ok(Math.abs(c2.sevenDay.utilization - 0.4) < 1e-9 && c2.sevenDay.status !== 'allowed_warning', '⑤ an overage-included WARNING never touches the plan week (2.361.2 wrote its 0.77 there)', JSON.stringify(c2.sevenDay));
  const ph2 = (c2.scopedWeekly || []).find((s) => s.name === 'Model cap');
  ok(ph2 && Math.abs(ph2.utilization - 0.77) < 1e-9 && ph2.status === 'allowed_warning', '⑤ …the warning and its utilization ride the model-cap lane', JSON.stringify(c2.scopedWeekly));
  // the same rejection on an account whose Fable cap shares the reset ⇒ THAT cap
  const dir3 = fs.mkdtempSync(path.join(os.tmpdir(), 'rlc-ovg3-'));
  fs.writeFileSync(path.join(dir3, 'sub-m3.json'), JSON.stringify({ fetchedAt: 1000, sevenDay: { utilization: 0.53, resetsAt: 1787328000 }, scopedWeekly: [{ name: 'Fable', utilization: 0.6, resetsAt: 1787328000 }] }));
  const r3 = captureRateLimitEvent({ cacheDir: dir3, key: 'sub-m3', identityIds: ['sub-m3'], ev, now: 1787194614944 });
  const c3 = JSON.parse(fs.readFileSync(path.join(dir3, 'sub-m3.json'), 'utf-8'));
  ok(r3.modelCapLane && r3.modelCapLane.named && r3.modelCapLane.limitId === 'model:fable' && (c3.scopedWeekly || []).find((s) => s.name === 'Fable')?.utilization === 1 && !(c3.scopedWeekly || []).some((s) => s.name === 'Model cap') && Math.abs(c3.sevenDay.utilization - 0.53) < 1e-9,
    '⑤ …and on an account whose FABLE cap shares the reset, the rejection marks Fable (an existing model limit with the same reset IS the lane), nothing else', JSON.stringify({ lane: r3.modelCapLane, scoped: c3.scopedWeekly, sevenDay: c3.sevenDay }));
  // r2: a model-cap rejection that states NO reset, on an account where nothing names the cap — the
  // dead mark must carry a DEADLINE (it had none: bucketRemaining never rolled it, every family read 0 %)
  const ev0 = parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: 'seven_day_overage_included' } });
  const NOW0 = 1787194614;
  const dir4 = fs.mkdtempSync(path.join(os.tmpdir(), 'rlc-ovg4-'));
  fs.writeFileSync(path.join(dir4, 'sub-m4.json'), JSON.stringify({ fetchedAt: 1000, sevenDay: { utilization: 0.53, resetsAt: 1787328000 } }));
  const r4 = captureRateLimitEvent({ cacheDir: dir4, key: 'sub-m4', identityIds: ['sub-m4'], ev: ev0, now: NOW0 * 1000 });
  const c4 = JSON.parse(fs.readFileSync(path.join(dir4, 'sub-m4.json'), 'utf-8'));
  const ph4 = (c4.scopedWeekly || []).find((s) => s.name === 'Model cap');
  ok(r4.dead && ph4 && ph4.utilization === 1 && ph4.resetsAt === NOW0 + 24 * 3600, '⑤ r2: a no-reset rejection marks the placeholder dead with the bounded 24 h guess (the plan lanes\' own ladder) — never a deadline-less 0 %', JSON.stringify(c4.scopedWeekly));
  const dir5 = fs.mkdtempSync(path.join(os.tmpdir(), 'rlc-ovg5-'));
  fs.writeFileSync(path.join(dir5, 'sub-m5.json'), JSON.stringify({ fetchedAt: 1000, sevenDay: { utilization: 0.53, resetsAt: 1787328000 }, scopedWeekly: [{ name: 'Model cap', utilization: 0.7, resetsAt: 1787300000 }] }));
  captureRateLimitEvent({ cacheDir: dir5, key: 'sub-m5', identityIds: ['sub-m5'], ev: ev0, now: NOW0 * 1000 });
  const ph5 = (JSON.parse(fs.readFileSync(path.join(dir5, 'sub-m5.json'), 'utf-8')).scopedWeekly || []).find((s) => s.name === 'Model cap');
  ok(ph5 && ph5.utilization === 1 && ph5.resetsAt === 1787300000, '⑤ r2: …the lane\'s own stored FUTURE reset outranks the guess', JSON.stringify(ph5));
  const evW7 = parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: 'seven_day_overage_included', unifiedWindows: { seven_day: { utilization: 0.5, resetsAt: 1787328000 } } } });
  const dir6 = fs.mkdtempSync(path.join(os.tmpdir(), 'rlc-ovg6-'));
  fs.writeFileSync(path.join(dir6, 'sub-m6.json'), JSON.stringify({ fetchedAt: 1000 }));
  captureRateLimitEvent({ cacheDir: dir6, key: 'sub-m6', identityIds: ['sub-m6'], ev: evW7, now: NOW0 * 1000 });
  const ph6 = (JSON.parse(fs.readFileSync(path.join(dir6, 'sub-m6.json'), 'utf-8')).scopedWeekly || []).find((s) => s.name === 'Model cap');
  ok(ph6 && ph6.utilization === 1 && ph6.resetsAt === 1787328000, '⑤ r2: …and the record\'s own plan weekly reset outranks the guess (every weekly window on an account shares it)', JSON.stringify(ph6));
  {
    const { accountRemaining } = require(REPO + '/src/account-pool-auto.js');
    const { projectCacheForFamily } = require(REPO + '/src/model-family.js');
    const at = (t) => accountRemaining(projectCacheForFamily(c4, 'opus'), t).remaining;
    ok(at(NOW0) === 0 && at(NOW0 + 24 * 3600 + 61) === 47, '⑤ r2: …so every family reads 0 % now and the PLAN week (47 %) a minute after the guessed deadline — the member is not parked for good', JSON.stringify([at(NOW0), at(NOW0 + 24 * 3600 + 61)]));
  }
  for (const d of [dir, dir2, dir3, dir4, dir5, dir6]) fs.rmSync(d, { recursive: true, force: true });
}

// ── ⑥ reading attribution wiring ──
// B-b3cd's rule ("the OTel-observed org must match the link, else re-attribute
// the reading to the observed org") was REFUTED on 2026-09-07: organization.id
// is the identity the CLI cached in its config dir at SPAWN, and the credential
// file IS re-read on a re-point's mtime bump — so the rule filed a hot-switched
// session's readings under the account it STARTED on, permanently. A member
// whose login had been wiped on 09-02 kept "reporting" until 09-07.
// Now: a READING is keyed to the same thing a REJECTION is — the validated
// credential slot, resolved ONCE per turn (readingSlotFor / rejectionSlotFor);
// the observation only corroborates.
{
  const fs2 = await import('node:fs');
  const eng = fs2.readFileSync(new URL('../src/server/usage-pool-engine.js', import.meta.url), 'utf8');
  const engCode = eng.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  ok(!/\borgVerifiedKey\b/.test(engCode), '⑥ REFUTED AND REMOVED: no executable line calls orgVerifiedKey — nothing may key a reading on the observed org (the comments keep the record)');
  ok(/function corroborateReading\(session, key, what\)[\s\S]{0,800}observedOrgFor\?\.\(session\?\.claudeSessionId\)/.test(eng), '⑥ the observation survives as CORROBORATION: same query, logs + telemetry, no return into the key');
  // 2026-09-08 (inc-mts8a8mr-ulmm): the READING half also hands its own window
  // to the resolver (the lag shadow is strictly additional evidence about which
  // credentials produced it), so the pin allows the extra arguments while still
  // requiring the two resolvers and the same rejected/allowed split.
  ok(/const slot = ev\.status === 'rejected' \? rejectionSlotFor\(session\) : readingSlotFor\(session[^;]*\);/.test(eng), '⑥ rate_limit_event: rejection AND reading both resolve a credential slot (turn-pinned twins)');
  ok(/const target = guardReadingTarget\(key, win, \{ session/.test(eng) && /if \(!target\) \{[\s\S]{0,400}?\n\s*return;\n\s*\}/.test(eng), '⑥ …and a READING is checked against the target\'s own established window before it is written (guardReadingTarget — the VALUE half; an archived one feeds only the slot\'s witness ring, then returns)');
  // 2026-09-09 r2: a REJECTION is judged too, by its own rule. It cannot go
  // through `guardReadingTarget` (that one judges by the weekly window a
  // reading carries, and a rejection deliberately hands it no `win` at all) —
  // it goes through `wallRecordTarget`, the same two-witness rule the turn-end
  // aggregate asks, at the same moment the number is written. Round 1 guarded
  // only the aggregate and the incident's foreign window still landed.
  ok(/writeKey = wallRecordTarget\(session, key, ev\);/.test(eng) && /if \(!writeKey\) \{/.test(eng)
    && /captureRateLimitEvent\(\{ cacheDir: USAGE_CACHE_DIR, key: writeKey,/.test(eng),
    '⑥ …and a REJECTION is judged at the SAME write, by the wall rule (it carries no window for guardReadingTarget to read)');
  ok(/const pinKey = slot\.key \|\| readingSlotFor\(session\)\.key \|\| usageCacheKeyFor\(session\)/.test(eng), '⑥ limit-banner marks land on the slot too (same physics, same resolver)');
  // 2026-09-09 r2: the banner's WRITE may follow a re-file a rejection RECORD
  // of the same turn PROVED (it states no time of its own, so leaving it on the
  // refuted member marks two members for one rejection) — but its SIGNAL keeps
  // the pin's key, because demoteWalledAccount resolves `member` (and the
  // identity group every earlier signal is filtered against) from the LAST
  // signal, and moving it drops the pinned member's own wall from the pass.
  ok(/session\._turnWallRefile;\s*\n\s*if \(refile && refile\.from === key && refile\.to\) \{/.test(eng)
    && /noteWallSignal\(session, \{ bucket: hit\.kind[^}]*key: pinKey,/.test(eng),
    '⑥ …the banner\'s WRITE follows a proven re-file while its SIGNAL keeps the pin (moving the signal drops the pinned member\'s own wall)');
  ok(/function resolveUsageKey\(session\)[\s\S]{0,900}sessionBillingMember\(session, acct\)\.id/.test(eng), '⑥ VALUES follow the credential slot as well — there is no longer a "reading member" different from the billing member');
  ok(/\(prev\.source \|\| 'unknown'\) === \(g\.cache\.source \|\| 'unknown'\)/.test(eng), '⑥ calib pairs are same-source (cross-source offset is attribution, not prediction error — mirrors extractPairs 2.340.0)');
  const sv = fs2.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  ok(/getOtelIngest: \(\) => \{ try \{ return otelIngest; \}/.test(sv), '⑥ server.js hands the engine a lazy otelIngest (TDZ: created later in the file)');
  ok(/observedOrgFor\(sid\)/.test(fs2.readFileSync(new URL('../src/server/otel-ingest.js', import.meta.url), 'utf8')), '⑥ the ingest exposes the per-session observed org');
  // ⑦ a DELETED account's zombie cache file must not join identity groups —
  // it poisoned org→account resolution (OTel booked live spend to the dead
  // id, atype 'unknown', outside every quota view: the org-29c4 implied-full
  // crash, 2026-08-24). A cache file with no roster record contributes
  // nothing true.
  ok(/if \(accountId && !acctRec\) continue;/.test(eng), '⑦ unregistered (deleted) account cache files are excluded from identity groups');
}

// ⑧ B-2c9b: the wall machine's ground-truth demotion rides THIS write path
// with source 'wall' (one write discipline — never a twin writer); the
// default label is unchanged for readings.
{
  const dir8 = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-rle8-'));
  const rd = (id) => JSON.parse(fs.readFileSync(path.join(dir8, id + '.json'), 'utf8'));
  fs.writeFileSync(path.join(dir8, 'sub-W.json'), JSON.stringify({ fetchedAt: 1000, source: 'cli-usage', fiveHour: { utilization: 0.2, resetsAt: 2_000_000_000 } }));
  const wall = captureRateLimitEvent({ cacheDir: dir8, key: 'sub-W', identityIds: ['sub-W'], ev: { kind: 'fiveHour', status: 'rejected', utilization: null, resetsAt: null, overage: {} }, now: 5000, source: 'wall' });
  ok(wall.ok && wall.dead && wall.wroteReading && rd('sub-W').source === 'wall' && rd('sub-W').fetchedAt === 5000, "⑧ source:'wall' labels the demotion write (a reading: fetchedAt bumped)");
  ok(rd('sub-W').fiveHour.utilization === 1 && rd('sub-W').fiveHour.resetsAt === 2_000_000_000, '⑧ …no signal reset ⇒ the cached FUTURE reset is kept (the wall machine\'s resetsAt ladder: signal > cached > bounded guess)');
  const rd2 = captureRateLimitEvent({ cacheDir: dir8, key: 'sub-W', identityIds: ['sub-W'], ev: rej, now: 6000 });
  ok(rd2.ok && rd('sub-W').source === 'rate-limit-event', "⑧ the default label stays 'rate-limit-event' for real events");
  ok(/source: 'wall'/.test(fs.readFileSync(new URL('../src/server/usage-pool-engine.js', import.meta.url), 'utf8')), '⑧ WIRING: the engine\'s demotion passes source wall through captureRateLimitEvent (no second writer)');
  try { fs.rmSync(dir8, { recursive: true, force: true }); } catch { }
}

// ── B-ad05: a partial overage payload keeps the fields it does not restate ──
// `{...stored, ...{status: undefined}}` wiped a 'rejected' to undefined, and a
// record with no status + inUse:false is the shape that reads as usage
// credits ALLOWED — so a disabled org could flip to "allowed" on the next
// event that happened to omit its status.
{
  const dir9 = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-rle9-'));
  const full = parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'five_hour', used_percentage: 10, overageStatus: 'rejected', overageDisabledReason: 'org_level_disabled_until', isUsingOverage: false } });
  captureRateLimitEvent({ cacheDir: dir9, key: 'sub-Z', identityIds: ['sub-Z'], ev: full, now: 1000 });
  const partial = parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'five_hour', used_percentage: 12, isUsingOverage: false } });
  ok(partial.overage.status === undefined && partial.overage.inUse === false, 'B-ad05 control: the partial event states inUse only');
  captureRateLimitEvent({ cacheDir: dir9, key: 'sub-Z', identityIds: ['sub-Z'], ev: partial, now: 2000 });
  const c9 = JSON.parse(fs.readFileSync(path.join(dir9, 'sub-Z.json'), 'utf8'));
  ok(c9.overage.status === 'rejected' && c9.overage.disabledReason === 'org_level_disabled_until' && c9.overage.inUse === false && c9.overage.asOf === 2000,
    'B-ad05: a partial overage payload keeps the stored status/disabledReason (an absent field is not "allowed") and re-dates the record', JSON.stringify(c9.overage));
  try { fs.rmSync(dir9, { recursive: true, force: true }); } catch { }
}


// ── ⑨ THE INCIDENT (inc-mubu23bd-5vxi, owner 2026-09-21 15:44 PDT: "刚才7d用量红了，刷新之后变成绿的了") ──
//     The owner's own session record, VERBATIM (claude 2.1.274): the representative claim is the
//     seven_day_overage_included bucket at 0.87 (allowed_warning), and `unifiedWindows` states all three
//     windows — five_hour 0.09, seven_day 0.43, seven_day_overage_included 0.87, both weekly windows on one
//     reset. The isolated /usage panel of the same account at that minute read plan 7d 43 %, 5h 6 %, scoped
//     weekly Fable 86 %. 2.361.2 mapped the type to `sevenDay` and ignored unifiedWindows, so the plan 7d
//     cache was written 86 % right after the panel wrote 43 % — the 7d donut flipped red/green between every
//     event and every panel refresh. Identities below are synthetic; the numbers are the record's.
{
  const OWNER_RECORD = { type: 'rate_limit_event', rate_limit_info: { status: 'allowed_warning', resetsAt: 1790535600, rateLimitType: 'seven_day_overage_included', utilization: 0.87, isUsingOverage: false, surpassedThreshold: 0.75, unifiedWindows: { five_hour: { utilization: 0.09, resetsAt: 1790048400 }, seven_day: { utilization: 0.43, resetsAt: 1790535600 }, seven_day_overage_included: { utilization: 0.87, resetsAt: 1790535600 } } }, uuid: 'e2e00000-0000-4000-8000-000000000001', session_id: 'e2e00000-0000-4000-8000-000000000002' };
  const ev = parseRateLimitEvent(OWNER_RECORD);
  ok(ev.kind === 'scoped' && ev.modelCap === true && ev.scopedName === null && Math.abs(ev.utilization - 0.87) < 1e-9 && ev.resetsAt === 1790535600, '⑨ the representative claim is the MODEL-CAP lane (un-named by the type), 0.87, on the weekly reset');
  ok(ev.windows && Math.abs(ev.windows.fiveHour.utilization - 0.09) < 1e-9 && ev.windows.fiveHour.resetsAt === 1790048400 && Math.abs(ev.windows.sevenDay.utilization - 0.43) < 1e-9 && ev.windows.sevenDay.resetsAt === 1790535600 && Math.abs(ev.windows.modelCap.utilization - 0.87) < 1e-9,
    '⑨ …and `unifiedWindows` yields the three windows: 5h 0.09, plan 7d 0.43, model cap 0.87', JSON.stringify(ev.windows));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rlc-owner-'));
  const KEY = 'sub-fixture-max';
  // the account's cache as the incident left it: the plan week holding the BUCKET's number (source
  // rate-limit-event) and the Fable cap right — the production file's shape, numbers verbatim
  fs.writeFileSync(path.join(dir, KEY + '.json'), JSON.stringify({ fiveHour: { utilization: 0.09, resetsAt: 1790048400 }, sevenDay: { utilization: 0.86, resetsAt: 1790535600, status: 'allowed_warning' }, scopedWeekly: [{ name: 'Fable', utilization: 0.87, resetsAt: 1790535600, severity: 'normal' }], fetchedAt: 1790031730410, source: 'rate-limit-event', scopedFetchedAt: 1790030899274, overage: { inUse: false, asOf: 1790031730410, status: 'rejected', disabledReason: 'org_level_disabled' }, overallStatus: 'allowed' }));
  // the account's established window, as its verified panel stamped it (the production sidecar's shape:
  // the panel is MINUTE-precise — 1790535540 — while the API's record says 1790535600; every sidecar on
  // this instance is 60 s off its account's live events, so the fixture pins that delta, not a clean match)
  fs.writeFileSync(path.join(dir, '.window-' + KEY), JSON.stringify({ sevenDay: 1790535540, fiveHour: 1790048340, scoped: { fable: 1790535540 }, at: 1790030899275, source: 'on-demand', verifiedAt: 1790030899275, verifiedBy: 'api-phase' }));
  const r = captureRateLimitEvent({ cacheDir: dir, key: KEY, identityIds: [KEY], ev, now: 1790031750000 });
  const c = JSON.parse(fs.readFileSync(path.join(dir, KEY + '.json'), 'utf-8'));
  ok(r.ok && r.wroteReading && !r.dead && r.modelCapLane && r.modelCapLane.named && r.modelCapLane.limitId === 'model:fable', "⑨ the sidecar's scoped window (fable, same reset) NAMES the lane: model:fable", JSON.stringify(r.modelCapLane));
  ok(/established window/.test(r.modelCapLane.why), "⑨ r2: …through the production 60 s delta (the sidecar's minute-precise 1790535540 vs the record's 1790535600) — the jitter the ladder relies on is exercised, not assumed", r.modelCapLane.why);
  ok(Math.abs(c.sevenDay.utilization - 0.43) < 1e-9 && c.sevenDay.resetsAt === 1790535600 && c.sevenDay.status === 'allowed', "⑨ plan 7d reads 0.43 — the plan week, from unifiedWindows.seven_day, its status from its own number (not the bucket's warning)", JSON.stringify(c.sevenDay));
  ok(Math.abs(c.fiveHour.utilization - 0.09) < 1e-9 && c.fiveHour.resetsAt === 1790048400, '⑨ 5h reads 0.09 from unifiedWindows.five_hour', JSON.stringify(c.fiveHour));
  const fable = (c.scopedWeekly || []).find((s) => s.name === 'Fable');
  ok(fable && Math.abs(fable.utilization - 0.87) < 1e-9 && fable.status === 'allowed_warning' && fable.resetsAt === 1790535600 && !(c.scopedWeekly || []).some((s) => s.name === 'Model cap'), "⑨ Fable reads 0.87 with the representative's warning — one scoped entry, no placeholder", JSON.stringify(c.scopedWeekly));
  const plan = (c.limits || []).find((l) => l.limitId === 'plan'), fl = (c.limits || []).find((l) => l.limitId === 'model:fable');
  ok(plan && plan.windows.find((w) => w.kind === '7d').usedPct === 43 && plan.windows.find((w) => w.kind === '5h').usedPct === 9 && fl && fl.windows[0].usedPct === 87, '⑨ the typed limits agree: plan 7d 43 / 5h 9, model:fable 87', JSON.stringify((c.limits || []).map((l) => [l.limitId, l.windows.map((w) => [w.kind, w.usedPct])])));
  ok(JSON.stringify(r.lanes) === JSON.stringify(['scoped:fable', 'fiveHour', 'sevenDay']), '⑨ the capture reports every lane it wrote, the representative first', JSON.stringify(r.lanes));
  // r2 (nit): a NON-representative window keeps the stored status when its number did not move
  const evW = parseRateLimitEvent({ ...OWNER_RECORD, rate_limit_info: { ...OWNER_RECORD.rate_limit_info, rateLimitType: 'seven_day', utilization: 0.84, unifiedWindows: { five_hour: { utilization: 0.09, resetsAt: 1790048400 }, seven_day: { utilization: 0.84, resetsAt: 1790535600 }, seven_day_overage_included: { utilization: 0.87, resetsAt: 1790535600 } } } });
  captureRateLimitEvent({ cacheDir: dir, key: KEY, identityIds: [KEY], ev: evW, now: 1790031760000 });
  const ev5r = parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', resetsAt: 1790048400, rateLimitType: 'five_hour', unifiedWindows: { five_hour: { utilization: 0.10, resetsAt: 1790048400 }, seven_day: { utilization: 0.84, resetsAt: 1790535600 }, seven_day_overage_included: { utilization: 0.87, resetsAt: 1790535600 } } } });
  captureRateLimitEvent({ cacheDir: dir, key: KEY, identityIds: [KEY], ev: ev5r, now: 1790031770000 });
  const cK = JSON.parse(fs.readFileSync(path.join(dir, KEY + '.json'), 'utf-8'));
  ok(cK.sevenDay.status === 'allowed_warning' && Math.abs(cK.sevenDay.utilization - 0.84) < 1e-9 && (cK.scopedWeekly || []).find((s) => s.name === 'Fable')?.status === 'allowed_warning',
    '⑨ r2: a plan week WARNED at 0.84 by its own representative keeps the warning when a five_hour event restates 0.84 (a sibling window withdraws nothing; the Fable warning likewise)', JSON.stringify({ s: cK.sevenDay, sc: cK.scopedWeekly }));
  const ev5m = parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', resetsAt: 1790048400, rateLimitType: 'five_hour', unifiedWindows: { five_hour: { utilization: 0.11, resetsAt: 1790048400 }, seven_day: { utilization: 0.20, resetsAt: 1790535600 }, seven_day_overage_included: { utilization: 0.87, resetsAt: 1790535600 } } } });
  captureRateLimitEvent({ cacheDir: dir, key: KEY, identityIds: [KEY], ev: ev5m, now: 1790031780000 });
  const cM = JSON.parse(fs.readFileSync(path.join(dir, KEY + '.json'), 'utf-8'));
  ok(cM.sevenDay.status === 'allowed' && Math.abs(cM.sevenDay.utilization - 0.20) < 1e-9, '⑨ r2: …and when the number MOVES the status is what the new number implies', JSON.stringify(cM.sevenDay));
  // CONTROL: the same record on an account whose sidecar and cache name NO cap ⇒ the placeholder, never the plan
  const dirP = fs.mkdtempSync(path.join(os.tmpdir(), 'rlc-owner-ph-'));
  fs.writeFileSync(path.join(dirP, 'sub-fresh.json'), JSON.stringify({ fetchedAt: 1000, sevenDay: { utilization: 0.1, resetsAt: 1790535600 } }));
  const rP = captureRateLimitEvent({ cacheDir: dirP, key: 'sub-fresh', identityIds: ['sub-fresh'], ev: parseRateLimitEvent(OWNER_RECORD), now: 2000 });
  const cP = JSON.parse(fs.readFileSync(path.join(dirP, 'sub-fresh.json'), 'utf-8'));
  ok(rP.modelCapLane && !rP.modelCapLane.named && Math.abs(cP.sevenDay.utilization - 0.43) < 1e-9 && (cP.scopedWeekly || []).find((s) => s.name === 'Model cap')?.utilization === 0.87 && (cP.limits || []).some((l) => l.limitId === 'model:cap'),
    '⑨ CONTROL: with nothing naming the cap, the bucket is the PLACEHOLDER (model:cap) and the plan week still reads 0.43', JSON.stringify({ lane: rP.modelCapLane, sevenDay: cP.sevenDay, scoped: cP.scopedWeekly }));
  // …and the placeholder FOLDS into the named cap the moment a panel names it with the same reset
  const usageWrite = require(REPO + '/src/usage-cache-write.js');
  const { familyOfScopedBucket } = require(REPO + '/src/model-family.js');
  usageWrite.writeCacheObject({ cacheDir: dirP, key: 'sub-fresh', obj: { fetchedAt: 3000, source: 'on-demand', fiveHour: { utilization: 0.1 }, sevenDay: { utilization: 0.43, resetsAt: 1790535600 }, scopedWeekly: [{ name: 'Fable', utilization: 0.86, resetsAt: 1790535600 }] }, measuredAt: 3000, source: 'on-demand', familyOf: familyOfScopedBucket, backend: 'claude' });
  const cF = JSON.parse(fs.readFileSync(path.join(dirP, 'sub-fresh.json'), 'utf-8'));
  ok(!(cF.limits || []).some((l) => l.limitId === 'model:cap') && (cF.limits || []).find((l) => l.limitId === 'model:fable')?.windows[0].usedPct === 86 && (cF.scopedWeekly || []).length === 1 && cF.scopedWeekly[0].name === 'Fable',
    '⑨ …a later panel naming Fable on the same reset FOLDS the placeholder into it (the newer measurement wins; one entry — never dropped, never the plan)', JSON.stringify({ limits: (cF.limits || []).map((l) => l.limitId), scoped: cF.scopedWeekly }));
  // CONTROL: a seven_day_opus record with unifiedWindows — the named model lane, plus the plan windows, no duplicate
  const evOpus = parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed_warning', resetsAt: 1790535600, rateLimitType: 'seven_day_opus', utilization: 0.91, unifiedWindows: { five_hour: { utilization: 0.2, resetsAt: 1790048400 }, seven_day: { utilization: 0.5, resetsAt: 1790535600 }, seven_day_opus: { utilization: 0.91, resetsAt: 1790535600 } } } });
  ok(evOpus.kind === 'scoped' && evOpus.scopedName === 'opus' && !evOpus.modelCap && evOpus.windows.scoped.opus && Math.abs(evOpus.windows.scoped.opus.utilization - 0.91) < 1e-9, '⑨ CONTROL: seven_day_<model> still names its model; its window rides `windows.scoped`');
  const dirO = fs.mkdtempSync(path.join(os.tmpdir(), 'rlc-owner-opus-'));
  const rO = captureRateLimitEvent({ cacheDir: dirO, key: 'sub-o', identityIds: ['sub-o'], ev: evOpus, now: 5000 });
  const cO = JSON.parse(fs.readFileSync(path.join(dirO, 'sub-o.json'), 'utf-8'));
  ok(JSON.stringify(rO.lanes) === JSON.stringify(['scoped:opus', 'fiveHour', 'sevenDay']) && Math.abs(cO.sevenDay.utilization - 0.5) < 1e-9 && (cO.scopedWeekly || []).length === 1 && Math.abs(cO.scopedWeekly[0].utilization - 0.91) < 1e-9 && cO.scopedWeekly[0].status === 'allowed_warning',
    '⑨ CONTROL: …written as opus + 5h + plan 7d, the warning on opus only, no second opus entry', JSON.stringify({ lanes: rO.lanes, scoped: cO.scopedWeekly, sevenDay: cO.sevenDay }));
  // CONTROL: the measured five_hour shape — no top-level utilization, the windows carry the numbers
  const ev5 = parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', resetsAt: 1789653600, rateLimitType: 'five_hour', overageStatus: 'rejected', overageDisabledReason: 'org_level_disabled', isUsingOverage: false, unifiedWindows: { five_hour: { utilization: 0.74, resetsAt: 1789653600 }, seven_day: { utilization: 0.11, resetsAt: 1790240400 }, seven_day_overage_included: { utilization: 0.22, resetsAt: 1790240400 } } } });
  ok(ev5.kind === 'fiveHour' && Math.abs(ev5.utilization - 0.74) < 1e-9, "⑨ CONTROL: a five_hour record with no top-level utilization takes its own window's 0.74 (measured shape)");
  const dir5 = fs.mkdtempSync(path.join(os.tmpdir(), 'rlc-owner-5h-'));
  fs.writeFileSync(path.join(dir5, '.window-sub-5'), JSON.stringify({ sevenDay: 1790240400, scoped: { fable: 1790240400 }, source: 'on-demand', verifiedBy: 'api-phase' }));
  const r5 = captureRateLimitEvent({ cacheDir: dir5, key: 'sub-5', identityIds: ['sub-5'], ev: ev5, now: 6000 });
  const c5 = JSON.parse(fs.readFileSync(path.join(dir5, 'sub-5.json'), 'utf-8'));
  ok(JSON.stringify(r5.lanes) === JSON.stringify(['fiveHour', 'sevenDay', 'scoped:fable']) && Math.abs(c5.sevenDay.utilization - 0.11) < 1e-9 && (c5.scopedWeekly || []).find((s) => s.name === 'Fable')?.utilization === 0.22 && c5.overage.disabledReason === 'org_level_disabled',
    '⑨ CONTROL: …every window lands on its own lane (5h 0.74, plan 0.11, Fable 0.22 via the sidecar) and the overage state rides along', JSON.stringify({ lanes: r5.lanes, c5: { f: c5.fiveHour, s: c5.sevenDay, sc: c5.scopedWeekly } }));
  // CONTROL: a seven_day record whose account has NO bucket (two windows only) — nothing scoped is invented
  const ev7 = parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed_warning', resetsAt: 1789318800, rateLimitType: 'seven_day', utilization: 0.84, isUsingOverage: false, surpassedThreshold: 0.75, unifiedWindows: { five_hour: { utilization: 0.1, resetsAt: 1789291800 }, seven_day: { utilization: 0.84, resetsAt: 1789318800 } } } });
  ok(ev7.kind === 'sevenDay' && ev7.windows.modelCap === null && JSON.stringify(lanesOf(ev7).map((l) => l.kind)) === JSON.stringify(['sevenDay', 'fiveHour']), '⑨ CONTROL: an account without the bucket states two windows and gets two lanes — no model cap is invented', JSON.stringify(lanesOf(ev7)));
  ok(JSON.stringify(lanesSnapshot(parseRateLimitEvent(OWNER_RECORD), { named: true })) === JSON.stringify({ fiveHour: { utilization: 0.09, resetsAt: 1790048400 }, sevenDay: { utilization: 0.43, resetsAt: 1790535600 } }) && lanesSnapshot(parseRateLimitEvent(OWNER_RECORD)).scopedWeekly[0].name === 'Model cap',
    '⑨ the snapshot for the window guard leaves the UN-NAMED cap out (`named:true`); the auto-resume snapshot keeps it under the placeholder name');
  for (const d of [dir, dirP, dirO, dir5]) fs.rmSync(d, { recursive: true, force: true });
}

// ── ⑨b THE STREAM-WRITTEN CAP IS AN ANCHOR THE ESTIMATOR CAN LEARN FROM (r2) ──
//     Every anchor/overlay site takes the file-level `scopedFetchedAt` as a scoped bucket's `asOf`, and
//     the stream never bumped it — so three stream-written Fable anchors shared the last panel's stamp
//     and usage-estimator discarded every pair as "the same reading" while the overlay fed the pool.
{
  const { UsageAnchors } = require(REPO + '/src/usage-anchors.js');
  const est = require(REPO + '/src/usage-estimator.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rlc-anchor-'));
  const KEY = 'sub-anc';
  const T0 = 1790031750000, MIN = 60000, PANEL = T0 - 3600000;
  fs.writeFileSync(path.join(dir, KEY + '.json'), JSON.stringify({ fetchedAt: PANEL, source: 'on-demand', fiveHour: { utilization: 0.09, resetsAt: 1790048400 }, sevenDay: { utilization: 0.43, resetsAt: 1790535600 }, scopedWeekly: [{ name: 'Fable', utilization: 0.80, resetsAt: 1790535600 }], scopedFetchedAt: PANEL }));
  fs.writeFileSync(path.join(dir, '.window-' + KEY), JSON.stringify({ sevenDay: 1790535540, scoped: { fable: 1790535540 }, verifiedBy: 'api-phase' }));
  const anchors = new UsageAnchors({ dataDir: path.join(dir, 'data') });
  const evAt = (u) => parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed_warning', resetsAt: 1790535600, rateLimitType: 'seven_day_overage_included', utilization: u, unifiedWindows: { five_hour: { utilization: 0.09, resetsAt: 1790048400 }, seven_day: { utilization: 0.43, resetsAt: 1790535600 }, seven_day_overage_included: { utilization: u, resetsAt: 1790535600 } } } });
  const AT = [T0, T0 + 10 * MIN, T0 + 20 * MIN];
  const stamps = [];
  [0.84, 0.86, 0.88].forEach((u, i) => {
    captureRateLimitEvent({ cacheDir: dir, key: KEY, identityIds: [KEY], ev: evAt(u), now: AT[i] });
    const c = JSON.parse(fs.readFileSync(path.join(dir, KEY + '.json'), 'utf-8'));
    stamps.push({ scopedFetchedAt: c.scopedFetchedAt, asOf: (c.scopedWeekly || []).find((s) => s.name === 'Fable')?.asOf });
    anchors.maybeRecord({ identityKey: 'acct:' + KEY, accountId: KEY, cache: c, costSince: i ? { total: 8, byFamily: { fable: 8, opus: 0, sonnet: 0, other: 0 }, requests: 1 } : null });
  });
  ok(stamps.every((s, i) => s.scopedFetchedAt === AT[i] && s.asOf === AT[i]), "⑨b every stream write stamps the file-level scopedFetchedAt with the READING's clock (the panel's own rule), equal to the entry's asOf", JSON.stringify(stamps));
  const lines = fs.readFileSync(path.join(dir, 'data', 'usage-anchors', 'anchors-acct_' + KEY + '.ndjson'), 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
  ok(lines.length === 3 && lines.every((l, i) => (l.buckets.scopedWeekly || []).find((s) => s.name === 'Fable')?.asOf === AT[i]), '⑨b …so three anchors carry three DIFFERENT scoped asOf stamps', JSON.stringify(lines.map((l) => l.buckets.scopedWeekly)));
  const pairs = est.extractPairs(lines);
  ok(Array.isArray(pairs['scoped:fable']) && pairs['scoped:fable'].length === 2 && pairs['scoped:fable'].every((p) => Math.abs(p.du - 0.02) < 1e-9 && p.cost === 8), '⑨b …and the estimator forms TWO scoped:fable pairs (Δu 0.02 over $8 each) — a stream-written cap movement IS rate information', JSON.stringify(pairs));
  const stale = lines.map((l) => ({ ...l, buckets: { ...l.buckets, scopedWeekly: l.buckets.scopedWeekly.map((s) => ({ ...s, asOf: PANEL })) } }));
  ok(!est.extractPairs(stale)['scoped:fable'] && est.extractPairs(stale).sevenDay?.length === 2, '⑨b CONTROL: the same anchors sharing ONE scoped asOf (the pre-r2 shape) form no scoped pair while the plan pairs still form — the guard the fix had to feed correctly');
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── ⑩ THE CENSUS: every site in the tree that spells the type — a second mapping cannot drift ──
{
  const { execFileSync } = await import('node:child_process');
  // THE SCOPE IS A SOURCE LISTING, NOT A WORKTREE WALK (the quota-model census's
  // rule): tracked + untracked-but-not-ignored, so a brand-new module is visible
  // to its own census while the gitignored agentd BUNDLE (a build product that
  // carries the parse's own line) is not a second mapping.
  const ls = (args) => execFileSync('git', ['-C', REPO, 'ls-files', '-z', ...args], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 }).toString('utf8').split('\0').filter(Boolean);
  const scope = [...new Set([...ls([]), ...ls(['--others', '--exclude-standard'])])].filter((f) => (/^src\//.test(f) || /^data\/bin\//.test(f) || f === 'server.js') && !/^scripts\/test-/.test(f));
  ok(scope.includes('src/rate-limit-capture.js') && scope.includes('data/bin/vibespace-usage') && scope.length > 50, `⑩ the census scope is a source listing and non-vacuous (${scope.length} files)`);
  const files = scope.filter((f) => { try { return fs.readFileSync(path.join(REPO, f), 'utf8').includes('seven_day_overage_included'); } catch { return false; } }).sort();
  const ALLOW = {
    'src/rate-limit-capture.js': 'THE parse — the only executable type-to-lane mapping',
    'src/record-shape.js': 'the declared schema (enum + the unifiedWindows nested shape)',
    'src/server/usage-pool-engine.js': 'the essay that says why it is NOT deferred (no executable mapping)',
    'src/auto-resume-signal.js': 'a comment naming the codex twin',
    'src/quota-model.js': 'the naming ladder\x27s essay (comment only — the PURE rule takes a reset and a map, never the type)',
  };
  ok(files.length > 0 && files.every((f) => ALLOW[f]), `⑩ every file that spells seven_day_overage_included is allowlisted with a reason: ${files.join(', ')}`, files.filter((f) => !ALLOW[f]).join(', '));
  const dead = Object.keys(ALLOW).filter((f) => !files.includes(f));
  ok(!dead.length, `⑩ no DEAD allowlist entry (dead: ${JSON.stringify(dead)})`);
  ok(!fs.readFileSync(path.join(REPO, 'src/weekly-lanes-unfold.js'), 'utf8').includes('seven_day_overage_included') && !fs.readFileSync(path.join(REPO, 'src/server/migrations.js'), 'utf8').includes('seven_day_overage_included'),
    '⑩ the repair migration and its registry note describe the type without spelling it (the parse stays the ONE spelling)');
  const exec = (f) => fs.readFileSync(path.join(REPO, f), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).filter((l) => l.includes('seven_day_overage_included'));
  ok(exec('src/server/usage-pool-engine.js').length === 0 && exec('src/auto-resume-signal.js').length === 0 && exec('src/quota-model.js').length === 0, "⑩ …and outside the parse and the schema no EXECUTABLE line compares against the type (the engine's deferral set no longer names it)", JSON.stringify(exec('src/server/usage-pool-engine.js')));
  const cap = exec('src/rate-limit-capture.js');
  ok(cap.length === 1 && /MODEL_CAP_TYPE = 'seven_day_overage_included'/.test(cap[0]), '⑩ …the parse spells it ONCE, as MODEL_CAP_TYPE (the window key reuses it)', JSON.stringify(cap));
  const tool = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-usage'), 'utf8');
  ok(!tool.includes('seven_day_overage_included') && /rl\.model_scoped/.test(tool), '⑩ the statusline twin never sees the type (2.1.274 ships the bucket NAMED, as rate_limits.model_scoped[]) and reads that list instead');
}

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

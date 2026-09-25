#!/usr/bin/env node
// THE RESOURCE VERDICT (src/runaway-guard.js, 2026-09-25) — FAST, PURE, no
// process, no fs beyond reading the module's own source for the negative
// controls (scripts/mutant-copy.mjs writes their copies to scratch).
//
// The owner's ruling (2026-09-25 00:12 UTC, verbatim): "不是就算是单一内存2G也不好
// 啊，chrome这么吃内存，完全可能超过这个量吧。这个keeper到底是干啥的，没必要别乱加
// 会影响使用的feature". The incident: a Google Chrome desktop app stopped 3 s
// after ready at "RSS 2.0 GB (limit 2.0 GB)" — a SUM of VmRSS over 25
// processes that share their pages (the same box: 891 chrome pids ΣVmRSS
// 94.67 GB vs ΣPss 15.09 GB). What this suite pins:
//   ① the verdict: memory judged by the sample's own metric (pss / anon), a
//      summed-RSS sample NOT judged (memGuard 'unavailable'), the metric
//      named in the sentence; the CPU rule unchanged (hot → sustained → over,
//      a drop resets; the set's cpuTicks already own + reaped, 2026-09-14);
//      no sample ⇒ no claim;
//   ② the REPORT LEVEL (report-only keepers): a fire when a crossing begins;
//      r2: re-armed only by REPORT_REARM_SAMPLES clear samples in a row (under
//      90 % of the line), never within REPORT_NOTICE_FLOOR_MS of the last
//      notice, and a notice nobody received (serverNotice → 0) re-sent under
//      the same key; a missing sample changes nothing;
//   ③ the words: the notice sentence (the user's own lever), memoryText;
//   ④ the numbers: providerGuard / guardFor (a browser row by the browser
//      floor, never an app-id literal), the module imports only the home;
//   ⑤ negative controls: a copy comparing rssBytes trips on the incident
//      fixture; a copy that forgets the 'rss' skip judges a summed RSS; a copy
//      without the hysteresis/floor toasts 5× on the oscillation fixture; a
//      copy that latches an undelivered notice never re-sends it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const RG = require('../src/runaway-guard.js');
const L = require('../src/keeper-limits.js');
const cli = require('../src/cli-identity.js');
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MUT = mutantCopies('runaway-guard', repo);

let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? '\n    ' + JSON.stringify(d) : '')); } return !!c; };
const GiB = 2 ** 30, MiB = 2 ** 20;

// the incident fixture: 25 Chrome processes, ~82 MB VmRSS each (2.0 GB summed) sharing their pages, ~30 MB PSS each
const incidentMembers = Array.from({ length: 25 }, (_, i) => ({ starttime: 1000 + i, cpuTicks: 10, reapedTicks: 0, rssBytes: 86 * MiB, anonBytes: 25 * MiB, pssBytes: 30 * MiB }));
const incident = cli.setSample(incidentMembers, { reaped: true });

console.log('① the verdict');
{
  ok(incident.memMetric === 'pss' && incident.rssBytes > L.GUARD_MEM_BYTES && incident.memBytes < L.GUARD_MEM_BYTES, `the incident fixture (the ONE set rule): ΣVmRSS ${(incident.rssBytes / GiB).toFixed(2)} GB > 2 GiB, ΣPss ${(incident.memBytes / MiB).toFixed(0)} MB`, incident);
  const v0 = RG.resourceVerdict(incident, null, 0, 1000);
  ok(v0.over === null && v0.memGuard === 'pss' && v0.cpuPct === null, 'the incident sample is NOT over (memory is the footprint), memGuard names the metric judged, no rate yet', v0);
  const big = RG.resourceVerdict({ cpuTicks: 0, memBytes: 6.2 * GiB, memMetric: 'pss', rssBytes: 40 * GiB }, null, 0, 1000);
  ok(big.over === 'memory (PSS) 6.2 GB (limit 2.0 GB)' && big.overKind === 'memory', 'a PSS footprint over the number ⇒ over, the sentence NAMES the metric', big);
  const anon = RG.resourceVerdict({ cpuTicks: 0, memBytes: 2.5 * GiB, memMetric: 'anon' }, null, 0, 1000);
  ok(anon.memGuard === 'anon' && anon.over === 'memory (anon+shm) 2.5 GB (limit 2.0 GB)', 'the RssAnon+RssShmem fallback of ONE process is judged and named "anon+shm"', anon);
  const anonSum = RG.resourceVerdict({ cpuTicks: 0, memBytes: 22.87 * GiB, memMetric: 'anon-sum' }, null, 0, 1000);
  ok(anonSum.memGuard === 'unavailable' && anonSum.over === null, 'an \'anon-sum\' sample (RssAnon+RssShmem over SEVERAL processes) is never judged — a per-process sum again', anonSum);
  // the multi-pid anon fixture: four processes sharing a CoW heap (each RssAnon counts the shared 150 MB) — the set
  // rule names it anon-sum, and its sum exceeds the set's true footprint (ΣPss) by the shared pages × (sharers − 1)
  const cow = Array.from({ length: 4 }, (_, i) => ({ starttime: 50 + i, cpuTicks: 1, reapedTicks: 0, rssBytes: 300 * MiB, anonBytes: 210 * MiB, pssBytes: i === 0 ? null : 110 * MiB }));
  const cowSet = cli.setSample(cow, { reaped: true });
  const truePss = 4 * (60 + 150 / 4) * MiB;
  ok(cowSet.memMetric === 'anon-sum' && cowSet.memBytes === 4 * 210 * MiB && cowSet.memBytes > truePss, `a 4-process set without every smaps_rollup ⇒ 'anon-sum' (${(cowSet.memBytes / MiB).toFixed(0)} MB) — over the shared-once footprint (${(truePss / MiB).toFixed(0)} MB), so it is recorded, not judged`, cowSet);
  const one = cli.setSample([cow[0], { cpuTicks: 0, reapedTicks: 0, rssBytes: 0, anonBytes: 0, pssBytes: 0, starttime: 9 }], { reaped: true });
  ok(one.memMetric === 'anon' && one.memBytes === 210 * MiB, 'ONE process with an address space (plus a zombie) keeps \'anon\' — the one-pid serve\'s exact fallback', one);
  const rss = RG.resourceVerdict({ cpuTicks: 0, memBytes: 90 * GiB, memMetric: 'rss', rssBytes: 90 * GiB }, null, 0, 1000);
  ok(rss.memGuard === 'unavailable' && rss.over === null, 'a SUMMED-RSS sample is never judged on memory (memGuard unavailable, 90 GB ⇒ over null)', rss);
  const none = RG.resourceVerdict({ cpuTicks: 0 }, null, 0, 1000);
  ok(none.memGuard === 'unavailable' && none.over === null, 'a sample with no memory reading at all is not judged on memory either');
  ok(JSON.stringify(RG.resourceVerdict(null, null, 0, 1000)) === JSON.stringify({ cpuPct: null, hotSince: 0, over: null, overKind: null, hotMin: null, memGuard: null, clear: null }), 'no sample ⇒ no claim (memGuard null — the report level ignores it)');
  // CPU, unchanged
  const lim = { ...L, GUARD_CPU_SUSTAIN_MS: 1000 };
  const t0 = 10_000;
  let v = RG.resourceVerdict({ cpuTicks: 200, memBytes: 1, memMetric: 'pss' }, { at: t0, cpuTicks: 0 }, 0, t0 + 1000, { limits: lim });
  ok(Math.round(v.cpuPct) === 200 && v.hotSince === t0 + 1000 && v.over === null, '200 % over one second ⇒ hot starts, not over yet', v);
  v = RG.resourceVerdict({ cpuTicks: 400, memBytes: 1, memMetric: 'pss' }, { at: t0 + 1000, cpuTicks: 200 }, t0 + 1000, t0 + 2000, { limits: lim });
  ok(/^200% CPU sustained for \d+ min \(limit 150%\)$/.test(v.over || '') && v.overKind === 'cpu', 'sustained past the limit ⇒ over, the sentence names the numbers', v);
  v = RG.resourceVerdict({ cpuTicks: 410, memBytes: 1, memMetric: 'pss' }, { at: t0 + 2000, cpuTicks: 400 }, t0 + 1000, t0 + 3000, { limits: lim });
  ok(v.hotSince === 0 && v.over === null, 'CPU drops ⇒ hot resets (a spike is not sustained)');
  // the 2026-09-14 reaped-ticks rule: a set counts own + reaped work, so a burner child that exited between two
  // samples is still in the delta (its ticks moved from the child's own into the parent's reaped)
  const before = cli.setSample([{ cpuTicks: 5, reapedTicks: 0, rssBytes: 1, anonBytes: 1, pssBytes: 1 }, { cpuTicks: 500, reapedTicks: 0, rssBytes: 1, anonBytes: 1, pssBytes: 1 }], { reaped: true });
  const after = cli.setSample([{ cpuTicks: 5, reapedTicks: 700, rssBytes: 1, anonBytes: 1, pssBytes: 1 }], { reaped: true });
  const vr = RG.resourceVerdict(after, { at: 0, cpuTicks: before.cpuTicks }, 0, 1000, { limits: L });
  ok(before.cpuTicks === 505 && after.cpuTicks === 705 && Math.round(vr.cpuPct) === 200, 'the reaped-ticks rule: a child that burned 200 ticks and was reaped between samples is still 200 % in the set\'s delta', { before, after, vr });
  ok(cli.setSample([{ cpuTicks: 5, reapedTicks: 700, rssBytes: 1, anonBytes: 1, pssBytes: 1 }], { reaped: false }).cpuTicks === 5, '…and the browser tree walk (reaped:false) counts own work only, as it always did');
}

console.log('② the report level');
{
  const over = { over: 'memory (PSS) 6.2 GB (limit 2.0 GB)', memGuard: 'pss', clear: false };
  const clear = { over: null, memGuard: 'pss', clear: true };
  const under = { over: null, memGuard: 'pss', clear: false };      // under the line, inside the re-arm band
  const noSample = { over: null, memGuard: null, clear: null };
  const H = 3600e3;
  const run = (seq, t0 = 0, step = 60e3, opts = {}) => { let st = null; const fires = []; seq.forEach((v, i) => { const r = RG.reportTransition(st, v, { now: t0 + i * step, ...opts }); st = r.state; fires.push(r.fire ? st.crossings : 0); }); return { fires, st }; };
  let r = run([clear, over, over, noSample, over, clear, clear, clear, over], 0, H);
  ok(JSON.stringify(r.fires) === JSON.stringify([0, 1, 0, 0, 0, 0, 0, 0, 2]), 'fires when over BEGINS; not again while it lasts (a missing sample changes nothing); again only after REPORT_REARM_SAMPLES clear samples in a row; each crossing numbered', r.fires);
  ok(L.REPORT_REARM_SAMPLES === 3 && L.REPORT_REARM_FRACTION === 0.9 && L.REPORT_NOTICE_FLOOR_MS === H, 'the numbers live in the constants home: 3 clear samples, 90 % of the threshold, a 1 h floor per session');
  r = run([over, clear, clear, over, clear, clear, clear, over], 0, H);
  ok(JSON.stringify(r.fires) === JSON.stringify([1, 0, 0, 0, 0, 0, 0, 2]), 'HYSTERESIS: two clear samples then over again is the SAME crossing (the run resets); three re-arm it', r.fires);
  r = run([over, under, under, under, under, over], 0, H);
  ok(JSON.stringify(r.fires) === JSON.stringify([1, 0, 0, 0, 0, 0]), 'HYSTERESIS: a reading merely under the line (inside the 90 % band) never re-arms', r.fires);
  // the review's repro: a reading oscillating across the line at the 60 s cadence, through the REAL verdict
  let st = null; const osc = [];
  for (let i = 0; i < 10; i++) { const v = RG.resourceVerdict({ cpuTicks: 0, memBytes: (i % 2 ? 1.95 : 2.05) * GiB, memMetric: 'pss' }, { at: 0, cpuTicks: 0 }, 0, 60e3 * (i + 1)); const x = RG.reportTransition(st, v, { now: 60e3 * (i + 1) }); st = x.state; osc.push(x.fire ? 1 : 0); }
  ok(osc.join('') === '1000000000' && st.crossings === 1, `OSCILLATION 2.05 / 1.95 GiB around a 2 GiB line, ten 60 s ticks ⇒ exactly ONE notice (was 1010101010) — ${osc.join('')}`);
  st = null; const wide = [];
  for (let i = 0; i < 20; i++) { const v = RG.resourceVerdict({ cpuTicks: 0, memBytes: (i % 4 === 0 ? 6.2 : 0.9) * GiB, memMetric: 'pss' }, { at: 0, cpuTicks: 0 }, 0, 60e3 * (i + 1)); const x = RG.reportTransition(st, v, { now: 60e3 * (i + 1) }); st = x.state; wide.push(x.fire ? 1 : 0); }
  ok(wide.filter(Boolean).length === 1, `FLOOR: 6.2 GB / three clear 0.9 GB samples, twenty 60 s ticks (re-armed every cycle) ⇒ ONE notice inside the hour — ${wide.join('')}`);
  r = run([over, clear, clear, clear, over, over], 0, 10 * 60e3);
  ok(JSON.stringify(r.fires) === JSON.stringify([1, 0, 0, 0, 0, 0]) && r.st.reported === false, 'FLOOR: a re-armed crossing 40 min after the last notice waits (armed, not fired)…', r);
  const late = RG.reportTransition(r.st, over, { now: H + 1 });
  ok(late.fire === true && late.state.crossings === 2, '…and the first over sample past the hour fires it');
  ok(RG.reportTransition(undefined, over).fire === true && RG.reportTransition(undefined, undefined).fire === false, 'a fresh state fires on the first over; no verdict never fires');
  // DELIVERY: server.js latches a notice key only when a client received it (returns 0 otherwise)
  let a = RG.reportTransition(null, over, { now: 0 });
  ok(a.fire && a.notify, 'a new crossing asks for the notice (fire + notify)');
  let d = RG.reportDelivery(a.state, 0);
  ok(d.pending === true && d.reported === true && d.crossings === 1, 'serverNotice → 0 (nobody connected) ⇒ pending, the crossing stays counted');
  let b2 = RG.reportTransition(d, over, { now: 60e3 });
  ok(b2.fire === false && b2.notify === true && b2.state.crossings === 1, 'the next sample STILL over re-sends the SAME key (notify without fire: no second log / telemetry)');
  let c = RG.reportTransition(RG.reportDelivery(b2.state, 2), over, { now: 120e3 });
  ok(c.notify === false && c.state.pending === false, 'delivered (> 0) ⇒ said; the sample after sends nothing');
  ok(RG.reportDelivery(a.state, undefined).pending === false, 'no answer (an unwired or older notice) counts as said — only an explicit 0 is "nobody saw it"');
  const dropped = RG.reportTransition(RG.reportDelivery(a.state, 0), clear, { now: 60e3 });
  ok(dropped.state.pending === false && dropped.notify === false, 'a reading back under drops a pending notice (it would describe a state that ended)');
}

console.log('③ the words');
{
  const v = RG.resourceVerdict({ cpuTicks: 0, memBytes: 6.2 * GiB, memMetric: 'pss' }, null, 0, 1);
  ok(RG.resourceNoticeText({ who: 'Google Chrome', where: 'Desktop panel', verdict: v, sample: { memBytes: 6.2 * GiB, memMetric: 'pss' } }) === 'Google Chrome is using 6.2 GB (PSS) — Stop it from the Desktop panel if that is not what you expect', 'the memory notice: who, the reading with its metric, the user\'s OWN lever — no threat, no countdown');
  const vc = RG.resourceVerdict({ cpuTicks: 280 * 300, memBytes: 1, memMetric: 'pss' }, { at: 0, cpuTicks: 0 }, 1, 300_000 + 1, { limits: L });
  ok(RG.resourceNoticeText({ who: 'The agent browser of profile "Work"', where: 'Browser panel', verdict: vc, sample: {} }) === 'The agent browser of profile "Work" has been using 280% CPU for 5 min — Stop it from the Browser panel if that is not what you expect', 'the CPU notice names the rate and how long', vc);
  ok(RG.memoryText(412 * MiB, 'pss') === '412 MB (PSS)' && RG.memoryText(6.2 * GiB, 'anon') === '6.2 GB (anon+shm)' && RG.memoryText(3 * GiB, 'anon-sum') === '3.0 GB (anon+shm, summed per process)' && RG.memoryText(3 * GiB, 'rss') === '3.0 GB (summed RSS)' && RG.memoryText(null, 'pss') === '' && RG.memoryText(5 * MiB) === '5 MB', 'memoryText: the ONE spelling the panels and notices share (the metric in parentheses)');
}

console.log('④ the numbers');
{
  const g = RG.providerGuard('chromium', L), f = RG.providerGuard('firefox', L), s = RG.providerGuard('opencode', L);
  ok(g.GUARD_MEM_BYTES === 3 * GiB && g.GUARD_CPU_PCT === 250 && f.GUARD_MEM_BYTES === 3 * GiB && s.GUARD_MEM_BYTES === L.GUARD_MEM_BYTES && g.GUARD_SAMPLE_MS === L.GUARD_SAMPLE_MS, 'a browser family reports at the browser floor (3 GiB / 250 %), anything else at the shared numbers; the cadence is shared');
  ok(RG.guardFor({ browser: 'chromium' }, L).GUARD_MEM_BYTES === 3 * GiB && RG.guardFor({ appId: 'google-chrome' }, L).GUARD_MEM_BYTES === L.GUARD_MEM_BYTES && RG.guardFor(null, L).GUARD_MEM_BYTES === L.GUARD_MEM_BYTES, 'guardFor reads the RECORD\'s browser field, never an app id');
  const src = fs.readFileSync(path.join(repo, 'src/runaway-guard.js'), 'utf8');
  const reqs = [...src.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]);
  ok(JSON.stringify(reqs) === JSON.stringify(['./keeper-limits']), 'PURE: the module imports only the constants home', reqs);
  ok(!('GUARD_RSS_BYTES' in L) && L.GUARD_MEM_BYTES === 2 * GiB, 'the number is GUARD_MEM_BYTES (2 GiB, unchanged); the RSS-sum name is gone');
}

console.log('⑤ negative controls (patched copies in scratch)');
{
  const src = fs.readFileSync(path.join(repo, 'src/runaway-guard.js'), 'utf8');
  const needle = "memGuard !== 'unavailable' && sample.memBytes > L.GUARD_MEM_BYTES";
  ok(src.split(needle).length === 2, 'CONTROL setup: the memory comparison is found exactly once');
  const m1 = MUT.load('src/runaway-guard.js', src.replace(needle, 'sample.rssBytes > L.GUARD_MEM_BYTES'), 'rss-sum');
  ok(m1.resourceVerdict(incident, null, 0, 1000).over !== null, 'CONTROL: a copy comparing rssBytes calls the incident fixture OVER — the Chrome incident, reproduced; the shipped verdict does not');
  const m2 = MUT.load('src/runaway-guard.js', src.replace(needle, 'sample.memBytes > L.GUARD_MEM_BYTES'), 'no-skip');
  ok(m2.resourceVerdict({ cpuTicks: 0, memBytes: 90 * GiB, memMetric: 'rss' }, null, 0, 1000).over !== null, 'CONTROL: a copy that forgets the summed-RSS skip judges a 90 GB RSS sum — the shipped verdict leaves it unjudged');
  // the r2 report level: a copy that re-arms on ONE normal sample with no floor (the pre-r2 rule) toasts on every
  // crossing of the oscillation fixture; a copy that treats an undelivered notice as said never re-sends it
  const oscOf = (mod) => { let st = null; const o = []; for (let i = 0; i < 10; i++) { const v = mod.resourceVerdict({ cpuTicks: 0, memBytes: (i % 2 ? 1.95 : 2.05) * GiB, memMetric: 'pss' }, { at: 0, cpuTicks: 0 }, 0, 60e3 * (i + 1)); const x = mod.reportTransition(st, v, { now: 60e3 * (i + 1) }); st = x.state; o.push(x.fire ? 1 : 0); } return o.join(''); };
  const rearm = "pick('REPORT_REARM_SAMPLES')", floor = "pick('REPORT_NOTICE_FLOOR_MS')";
  ok(src.split(rearm).length === 2 && src.split(floor).length === 2 && src.split('pending: delivered === 0').length === 2, 'CONTROL setup: the re-arm count, the floor and the delivery rule are each found exactly once');
  const m3 = MUT.load('src/runaway-guard.js', src.replace(rearm, '0').replace(floor, '0').replace('s.clearRun = verdict.clear ? s.clearRun + 1 : 0;', 's.clearRun = 1;'), 'no-hysteresis');
  ok(oscOf(m3) === '1010101010' && oscOf(RG) === '1000000000', `CONTROL: a copy without the hysteresis or the floor files 5 notices on the oscillation fixture (${oscOf(m3)}) — the shipped level files one`);
  const m4 = MUT.load('src/runaway-guard.js', src.replace('pending: delivered === 0', 'pending: false'), 'no-delivery');
  const undelivered = (mod) => { const a = mod.reportTransition(null, { over: 'x', memGuard: 'pss', clear: false }, { now: 0 }); return mod.reportTransition(mod.reportDelivery(a.state, 0), { over: 'x', memGuard: 'pss', clear: false }, { now: 60e3 }).notify; };
  ok(undelivered(m4) === false && undelivered(RG) === true, 'CONTROL: a copy that latches an undelivered notice as said never re-sends it — the shipped level re-sends the same key');
  for (const r of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 4, label: '⑤ ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

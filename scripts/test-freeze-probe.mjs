#!/usr/bin/env node
// THE FREEZE PROBE's self-gap verdict (2.369.141, owner: "没有实际卡顿但我切回标签页的
// 时候突然提示抓取卡顿现场"): a late 1 s tick is a freeze only when the page was
// visible for the whole gap. PURE function, every branch a leg, the pre-fix rule
// (gap > 4 s && !hidden) as the negative control.
import { selfGapIsFreeze, jankStormVerdict } from '../src/lib/telemetry-client.js';
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + JSON.stringify(e) : ''}`); } };
const T = 1_000_000;
// a real freeze: visible since long ago, ticks 1 s apart, then one 20 s gap
ok(selfGapIsFreeze({ tickGap: 20000, prevTick: T + 100000, now: T + 120000, hiddenNow: false, visibleSince: T, hiddenAt: 0 }) === true, 'a 20 s gap on a page visible throughout is a freeze');
ok(selfGapIsFreeze({ tickGap: 1000, prevTick: T + 100000, now: T + 101000, hiddenNow: false, visibleSince: T, hiddenAt: 0 }) === false, 'a normal 1 s tick is not');
// the owner\'s case: tab hidden at T+50s, back at T+110s, first tick fires at T+110.2s with a 60 s gap
const ret = { tickGap: 60200, prevTick: T + 50000, now: T + 110200, hiddenNow: false, visibleSince: T + 110000, hiddenAt: T + 50000 };
ok(selfGapIsFreeze(ret) === false, 'the first tick after a tab RETURN (gap spans the hidden span) is NOT a freeze (owner\'s false capture)', ret);
ok((ret.tickGap > 4000 && !ret.hiddenNow) === true, 'NEGATIVE CONTROL: the pre-fix rule (gap > 4 s && !hidden) called that same return a freeze');
// hidden right now
ok(selfGapIsFreeze({ tickGap: 9000, prevTick: T + 1000, now: T + 10000, hiddenNow: true, visibleSince: T, hiddenAt: T + 2000 }) === false, 'a gap while hidden now is not a freeze');
// went hidden DURING the gap and came back within it (hiddenAt after prevTick)
ok(selfGapIsFreeze({ tickGap: 8000, prevTick: T + 1000, now: T + 9000, hiddenNow: false, visibleSince: T + 8500, hiddenAt: T + 2000 }) === false, 'a hide+return inside the gap is not a freeze');
// visible for a while, then a gap that starts after the return (prevTick after visibleSince) and no hide since: a freeze
ok(selfGapIsFreeze({ tickGap: 6000, prevTick: T + 20000, now: T + 26000, hiddenNow: false, visibleSince: T + 10000, hiddenAt: T + 5000 }) === true, 'a gap that starts after the return, with no hide since, IS a freeze');
// the return spike: visible 2 s ago, a 5 s gap whose prevTick sits after visibleSince cannot happen (tick every 1 s) — but a late-arriving tick within 3 s of the return is excused
ok(selfGapIsFreeze({ tickGap: 4500, prevTick: T + 30500, now: T + 35000, hiddenNow: false, visibleSince: T + 33000, hiddenAt: T + 30000 }) === false, 'the return spike (visible < 3 s ago) is excused');
ok(selfGapIsFreeze({ tickGap: 4001, prevTick: T + 100000, now: T + 104001, hiddenNow: false, visibleSince: T, hiddenAt: 0, minGapMs: 4000 }) === true && selfGapIsFreeze({ tickGap: 4000, prevTick: T + 100000, now: T + 104000, hiddenNow: false, visibleSince: T, hiddenAt: 0 }) === false, 'the 4 s threshold is exclusive');
// ── the JANK STORM verdict (2.369.143): frames alive but slow ──
{
  const now = T + 100000;
  const storm = [1500, 1200, 1800, 900, 1000].map((gap, i) => ({ t: now - 15000 + i * 3000, gap }));   // 6.4 s of slow frames in 15 s
  const v = jankStormVerdict(storm, { now });
  ok(v.storm === true && v.slowFrames === 5 && v.coveredMs === 6400 && v.worstMs === 1800, "five 0.9–1.8 s frames covering 6.4 s of the last 20 s = a storm (the owner's felt stall: timers alive, frames slow)", v);
  ok(jankStormVerdict([{ t: now - 500, gap: 20000 }], { now }).storm === true, 'one 20 s frame gap is a storm too (it also trips the rAF-dead arm — both may fire)');
  ok(jankStormVerdict([{ t: now - 100, gap: 400 }, { t: now - 5000, gap: 450 }], { now }).storm === false, 'frames under 500 ms never count');
  ok(jankStormVerdict(storm, { now: now + 30000 }).storm === false, 'a storm ages out of the 20 s window');
  ok(jankStormVerdict([{ t: now - 1000, gap: 2000 }, { t: now - 2000, gap: 2000 }], { now }).storm === false && jankStormVerdict([{ t: now - 1000, gap: 3000 }, { t: now - 2000, gap: 3000 }], { now }).storm === true, 'the 6 s coverage threshold (4 s no, 6 s yes)');
  ok(jankStormVerdict([], { now }).storm === false, 'no frames, no storm');
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

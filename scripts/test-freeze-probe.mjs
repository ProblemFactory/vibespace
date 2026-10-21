#!/usr/bin/env node
// THE FREEZE PROBE's PURE verdicts. 2.369.141 (owner: "没有实际卡顿但我切回标签页的时候
// 突然提示抓取卡顿现场") gave the self-gap rule; 2.369.143 the jank storm; 2.369.339
// (inc-mvi50qdh-ygmh «9.1 s» / inc-mvi5ggqh-1tz8 «620.8 s», the owner's idle Windows
// desktop) the PAINT-GAP rule — a gap in painting is jank only with a busy main
// thread or a person there. PURE functions, every branch a leg, the pre-fix / base
// rule as the negative control.
import { selfGapIsFreeze, jankStormVerdict, paintGapKind } from '../src/lib/telemetry-client.js';
import * as tc from '../src/lib/telemetry-client.js';
import fs from 'node:fs';
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + JSON.stringify(e) : ''}`); } };
const T = 1_000_000;
// a real freeze: visible since long ago, ticks 1 s apart, then one 20 s gap
ok(selfGapIsFreeze({ tickGap: 20000, prevTick: T + 100000, now: T + 120000, hiddenNow: false, visibleSince: T, hiddenAt: 0 }) === true, 'a 20 s gap on a page visible throughout is a freeze');
ok(selfGapIsFreeze({ tickGap: 1000, prevTick: T + 100000, now: T + 101000, hiddenNow: false, visibleSince: T, hiddenAt: 0 }) === false, 'a normal 1 s tick is not');
// the owner's case: tab hidden at T+50s, back at T+110s, first tick fires at T+110.2s with a 60 s gap
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
// ── the JANK STORM verdict (2.369.143) — frames alive but slow, AND (2.369.339) the
// main thread busy or a person there; an idle desktop's slow "frames" are not a storm ──
{
  const now = T + 100000;
  const storm = [1500, 1200, 1800, 900, 1000].map((gap, i) => ({ t: now - 15000 + i * 3000, gap }));   // 6.4 s of slow frames in 15 s
  const busy = storm.map((f) => ({ at: f.t, ms: f.gap }));   // a long task spans each slow frame — the main thread WAS busy
  const v = jankStormVerdict(storm, { now, longTasks: busy });
  ok(v.storm === true && v.slowFrames === 5 && v.coveredMs === 6400 && v.worstMs === 1800, "five 0.9–1.8 s frames over a busy main thread cover 6.4 s of the last 20 s = a storm (the owner's felt stall: timers alive, frames slow)", v);
  ok(jankStormVerdict(storm, { now, inputs: storm.map((f) => f.t) }).storm === true, 'a storm the person typed through (inputs during it) fires too');
  const idle = jankStormVerdict(storm, { now });
  ok(idle.storm === false && idle.coveredMs === 0, 'NEGATIVE CONTROL: the SAME slow frames with no busy thread and nobody there are NOT a storm (an idle desktop that stopped painting)', idle);
  ok(jankStormVerdict([{ t: now - 500, gap: 20000 }], { now, longTasks: [{ at: now - 500, ms: 20000 }] }).storm === true, 'one 20 s frame gap with a 20 s long task is a storm too (it also trips the rAF-dead arm — both may fire)');
  ok(jankStormVerdict([{ t: now - 100, gap: 400 }, { t: now - 5000, gap: 450 }], { now, longTasks: [{ at: now - 100, ms: 400 }, { at: now - 5000, ms: 450 }] }).storm === false, 'frames under 500 ms never count, busy or not');
  ok(jankStormVerdict(storm, { now: now + 30000, longTasks: busy }).storm === false, 'a storm ages out of the 20 s window');
  ok(jankStormVerdict([{ t: now - 1000, gap: 2000 }, { t: now - 2000, gap: 2000 }], { now, longTasks: [{ at: now - 1000, ms: 2000 }, { at: now - 2000, ms: 2000 }] }).storm === false && jankStormVerdict([{ t: now - 1000, gap: 3000 }, { t: now - 2000, gap: 3000 }], { now, longTasks: [{ at: now - 1000, ms: 3000 }, { at: now - 2000, ms: 3000 }] }).storm === true, 'the 6 s coverage threshold (4 s no, 6 s yes), both gaps busy');
  ok(jankStormVerdict([], { now }).storm === false, 'no frames, no storm');
}
// ── A TAB RETURN IS NOT A JANK STORM (inc-mudv05ja-n5rv): the auto incident
// "jank storm — 13.3s" was ONE rAF interval spanning a 254 s hidden period — the
// return frame passed the `!document.hidden` gate (already false at the return)
// and the verdict read it 3 s later as 13.3 s of slow frames. The numbers below
// are that bundle's timestamps (numbers only — no names, no paths).
{
  const HID = 1790152237901, VIS = 1790152491821;           // hidden → visible (254 s away)
  const retGap = { t: 1790152491822, gap: 13288 };          // the ring's frame gap, logged 1 ms after the return
  const retTask = [{ at: retGap.t, ms: retGap.gap }];       // make the gap LOOK busy, so ONLY the return filter can drop it
  const verdictAt = VIS + 3000 + 79;                        // the first tick allowed to judge (tickNow − visibleSince ≥ 3000)
  const fgr = tc.frameGapIsReturn;
  ok(typeof fgr === 'function' && fgr({ now: retGap.t, gap: retGap.gap, visibleSince: VIS, hiddenAt: HID }) === true, 'the return frame (starts 13.3 s before the page came back) is a RETURN, never pushed to the frame ring');
  ok(typeof fgr === 'function' && fgr({ now: VIS + 5000, gap: 900, visibleSince: VIS, hiddenAt: HID }) === false, 'a 900 ms frame that starts after the return is a real slow frame');
  ok(typeof fgr === 'function' && fgr({ now: VIS - 100000, gap: 2000, visibleSince: VIS - 200000, hiddenAt: VIS - 100500 }) === true, 'a frame the page went hidden during (hiddenAt after its start) is a return too');
  ok(typeof fgr === 'function' && fgr({ now: 5000, gap: 400, visibleSince: 0, hiddenAt: 0 }) === false, 'no visibility history (visible since install) ⇒ nothing is excused');
  const v = jankStormVerdict([retGap], { now: verdictAt, visibleSince: VIS, longTasks: retTask });
  ok(v.storm === false && v.coveredMs === 0, 'the verdict handed visibleSince never counts the interval that straddles the return — even one that looks busy (the auto incident\'s whole evidence)', v);
  ok(jankStormVerdict([retGap], { now: verdictAt, longTasks: retTask }).storm === true, 'NEGATIVE CONTROL: without visibleSince the pre-fix verdict calls that busy-looking return a 13.3 s storm');
  // the tick lag of the same return (13 356 ms, visibleAgo 69) was already excused by the self-gap rule
  ok(selfGapIsFreeze({ tickGap: 13356, prevTick: VIS + 69 - 13356, now: VIS + 69, hiddenNow: false, visibleSince: VIS, hiddenAt: HID }) === false, 'the same return\'s 13.4 s tick lag is not a renderer freeze');
  // GENUINE-STORM CONTROL: 8 × 900 ms busy slow frames inside a visible 20 s window still fire — before AND after a return
  const genuine = Array.from({ length: 8 }, (_, i) => ({ t: VIS + 10000 + i * 1500, gap: 900 }));
  const genuineTasks = genuine.map((f) => ({ at: f.t, ms: f.gap }));
  const g = jankStormVerdict(genuine, { now: VIS + 22000, visibleSince: VIS, longTasks: genuineTasks });
  ok(g.storm === true && g.slowFrames === 8 && g.coveredMs === 7200, 'eight 900 ms busy frames after the return (7.2 s of a visible 20 s) are still a storm', g);
  ok(jankStormVerdict([retGap, ...genuine], { now: VIS + 22000, visibleSince: VIS, longTasks: [...retTask, ...genuineTasks] }).slowFrames === 8, 'a storm after a return counts its own frames and not the return');
}
// ── PAINT GAP ≠ JANK (2.369.339, inc-mvi50qdh-ygmh «9.1 s» / inc-mvi5ggqh-1tz8
// «620.8 s»): the auto recorder filed two «jank storm» incidents for an idle Windows
// desktop (monitor off / lock screen / an occluded window) — the window simply
// stopped PAINTING; the main thread never blocked (the 1 s timer kept ticking) and
// nobody was there. A paint gap is JANK only with a busy main thread (a long task
// over half of it) or a person present (a pointer/key during it or ≤ 1 s after). ──
{
  const now = T + 100000;
  // the 13:30 incident shape: a 620.8 s paint gap; the two long tasks are minutes
  // before it (690 / 306 ms); no input in the action ring the whole time
  const bigGap = { t: now - 1000, gap: 620780 };
  const farTasks = [{ at: now - 700000, ms: 690 }, { at: now - 680000, ms: 306 }];
  ok(paintGapKind(bigGap, { longTasks: farTasks, inputs: [] }) === 'unpainted', 'the 620 s gap with long tasks minutes before it and no input is UNPAINTED (the window was not painting)');
  // the 13:18 incident shape: a 9.1 s paint gap, same story
  ok(paintGapKind({ t: now - 1000, gap: 9144 }, { longTasks: farTasks, inputs: [] }) === 'unpainted', 'the 9 s gap with no busy thread and nobody there is UNPAINTED');
  // a 9 s gap WITH a 9 s long task over it ⇒ jank (the main thread was busy)
  ok(paintGapKind({ t: now - 1000, gap: 9000 }, { longTasks: [{ at: now - 1000, ms: 9000 }], inputs: [] }) === 'jank', 'a 9 s gap with a 9 s long task over it is JANK (busy main thread)');
  // a 6 s gap with a key press 300 ms after it ends ⇒ jank (a person was there)
  ok(paintGapKind({ t: now - 1000, gap: 6000 }, { longTasks: [], inputs: [now - 700] }) === 'jank', 'a 6 s gap with a key press 300 ms after it is JANK (a person present)');
  // a 71 s compositor stall with no input ⇒ unpainted (the compositor arm must not file it)
  ok(paintGapKind({ t: now, gap: 71266 }, { longTasks: [], inputs: [] }) === 'unpainted', 'a 71 s compositor stall with no input is UNPAINTED (the arm must not file it)');
  // edges
  ok(paintGapKind({ t: now, gap: 6000 }, { longTasks: [], inputs: [now + 1100] }) === 'unpainted', 'an input more than 1 s after the gap does not make it jank');
  ok(paintGapKind({ t: now, gap: 6000 }, { longTasks: [], inputs: [now - 6000] }) === 'jank', 'an input at the very start of the gap makes it jank');
  ok(paintGapKind({ t: now, gap: 10000 }, { longTasks: [{ at: now, ms: 4000 }], inputs: [] }) === 'unpainted', 'a long task covering under half the gap does not make it jank');
  ok(paintGapKind({ t: now, gap: 10000 }, { longTasks: [{ at: now, ms: 5000 }], inputs: [] }) === 'jank', 'a long task covering exactly half the gap makes it jank');
  // THE STORM VERDICT counts only jank gaps now
  const two = [bigGap, { t: now - 3000, gap: 9144 }];
  const vU = jankStormVerdict(two, { now, longTasks: farTasks, inputs: [] });  // visibleSince 0 = visible since install (the window never hid; it stopped painting while visible)
  ok(vU.storm === false && vU.coveredMs === 0 && vU.slowFrames === 0, 'the two incident gaps (unpainted) are NOT a storm — zero slow frames filed', vU);
  const vB = jankStormVerdict(two, { now, longTasks: [{ at: bigGap.t, ms: bigGap.gap }, { at: now - 3000, ms: 9144 }] });
  ok(vB.storm === true && vB.slowFrames === 2, 'RED CONTROL: the base verdict counted every slow frame (no busy/present test) — a busy main thread over them files both incidents again', vB);
}
// ── WIRING PINS: the live loop reads the busy/present facts, names an unpainted gap
// a metric (not an incident), and the recorder carries the new screen facts ──
{
  const src = fs.readFileSync(new URL('../src/lib/telemetry-client.js', import.meta.url), 'utf8');
  ok(/if \(gap >= 300 && !document\.hidden && !frameGapIsReturn\(\{ now, gap, visibleSince, hiddenAt \}\)\)/.test(src), 'WIRING: the rAF loop pushes a frame gap only when it is not a return');
  ok(/jankStormVerdict\(_frameGaps, \{ now: tickNow, visibleSince, longTasks: _longTasks, inputs: _inputs \}\)/.test(src), 'WIRING: the live jank-storm verdict is handed the long tasks and the input stamps');
  ok(/if \(paintGapKind\(f, \{ longTasks, inputs \}\) !== 'jank'\) continue;/.test(src), 'WIRING: the storm verdict drops any gap that is not jank (unpainted never counts)');
  ok(/paintGapKind\(\{ t: ended, gap: ended - stallStart \}, \{ longTasks: _longTasks, inputs: _inputs \}\) === 'jank'/.test(src), 'WIRING: the compositor arm classifies its stall by the same verdict');
  ok(/metric\('paint-gap-s', dur\);/.test(src) && /track\('event', 'paint-gap',/.test(src), 'WIRING: an unpainted compositor stall is a paint-gap metric + a ring line');
  const ci = src.indexOf("paintGapKind({ t: ended, gap: ended - stallStart }");
  const compBlock = src.slice(ci, src.indexOf('stallStart = 0;', ci));
  ok(compBlock.includes("notifyFreeze({ kind: 'compositor'") && compBlock.includes('} else {') && compBlock.includes("metric('paint-gap-s'") && compBlock.indexOf("notifyFreeze({ kind: 'compositor'") < compBlock.indexOf('} else {'), 'WIRING: notifyFreeze for a compositor stall is in the jank branch; the unpainted (else) branch files only a metric — no auto incident');
  ok(/window\.addEventListener\('pointerdown', noteInput/.test(src) && /window\.addEventListener\('keydown', noteInput/.test(src), 'WIRING: the input-stamp ring listens to pointerdown + keydown');
  ok(/document\.addEventListener\('freeze'/.test(src) && /document\.addEventListener\('resume'/.test(src) && /pushScreen\(\{ k: 'focus' \}\)/.test(src) && /pushScreen\(\{ k: 'idle'/.test(src), 'WIRING: installScreenWatch records freeze/resume, focus/blur and the idle verdict');
  ok(/p\.state !== 'granted'\) return;/.test(src), 'WIRING: Idle Detection is read only if the permission is ALREADY granted (never a new prompt)');
  const client = fs.readFileSync(new URL('../src/client.js', import.meta.url), 'utf8');
  ok(/installInputStamp\(\);/.test(client), 'WIRING: client.js installs the input-stamp ring at boot');
  const rec = fs.readFileSync(new URL('../src/lib/incident-recorder.js', import.meta.url), 'utf8');
  ok(/out\.screenEvents = window\.__vsScreenEvents/.test(rec), 'WIRING: the incident snapshot carries screenEvents (the window\'s screen facts reach the bundle)');
  ok(/window\.__vsInputs = recentInputs/.test(src), 'WIRING: the input ring is exposed as window.__vsInputs (like the sibling rings)');
  ok(/out\.inputs = window\.__vsInputs/.test(rec), 'WIRING: the snapshot carries the input ring (the paint-gap verdict\'s present-person evidence)');
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

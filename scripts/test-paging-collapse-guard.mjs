#!/usr/bin/env node
// COLLAPSED-GEOMETRY guard, pinned against the REAL incident numbers
// (inc-mso818ry). The scroll tracer recorded 14 extendTop landings in the
// affected window: 11 landed with a content height of one viewport or less
// (sh 782/923/997 — content-visibility had not resolved the fresh batch yet)
// and 6 of those were yanked back to the live tail by extendBottom within two
// seconds. The three healthy landings measured 1798/1963/2573.
//
// While geometry is collapsed, "at top" and "at bottom" are BOTH true, so the
// handler must make NO boundary decision. This test pins the threshold to the
// field data: every pathological landing must be classified indeterminate and
// every healthy one must not — with the chat viewport heights this window
// actually had (the incident's viewport was 2195x1100; a chat window's list
// is roughly 600-900px tall).
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };

// the SCROLL-handler guard, verbatim from chat-view.js (settling-window model)
const indeterminate = ({ scrollHeight, clientHeight, children, windowStart, windowEnd, total, sinceStructuralMs = 0 }) => {
  const partialWindow = windowStart > 0 || windowEnd < total;
  const settling = sinceStructuralMs < 1500;
  return partialWindow && settling && scrollHeight - clientHeight < clientHeight && children > 10;
};
// the WHEEL-handler bottom-edge predicate (inc-msor3oax): a collapsed list
// emits NO scroll events, so this is the ONLY path that runs — it must be
// able to tell the bottom edge from the top edge at all.
const wheelExtendsBottom = ({ scrollHeight, clientHeight, scrollTop, deltaY }) =>
  deltaY > 0 && scrollHeight - clientHeight > 50 && scrollHeight - scrollTop - clientHeight < 10;

const PATHOLOGICAL = [782, 923, 997];   // recorded collapsed landings
const HEALTHY = [1798, 1963, 2573];     // recorded healthy landings
const VIEWPORTS = [600, 700, 800, 900]; // plausible chat-list heights

for (const ch of VIEWPORTS) {
  for (const sh of PATHOLOGICAL) {
    ok(indeterminate({ scrollHeight: sh, clientHeight: ch, children: 50, windowStart: 3540, windowEnd: 3590, total: 3800, sinceStructuralMs: 30 }),
      `collapsed landing sh=${sh} @ clientHeight=${ch} → NO boundary decision`);
  }
}
// …but the skip can NEVER stick: once heights have had time to resolve, a
// genuinely short partial window must page normally again (else scrolling up
// would stop working forever)
ok(!indeterminate({ scrollHeight: 900, clientHeight: 755, children: 50, windowStart: 3540, windowEnd: 3590, total: 3800, sinceStructuralMs: 4000 }),
  'after the settling window, a short partial view decides normally (the skip cannot stick)');

// ── THE BOUNCE (inc-msor3oax): the capture's exact collapsed geometry ──
ok(!wheelExtendsBottom({ scrollHeight: 755, clientHeight: 755, scrollTop: 0, deltaY: 120 }),
  'collapsed list (sh===ch===755, top of list): a DOWNWARD wheel tick does NOT extend bottom');
ok(!wheelExtendsBottom({ scrollHeight: 755, clientHeight: 755, scrollTop: 0, deltaY: -120 }),
  'an upward tick never hits the bottom branch either');
ok(wheelExtendsBottom({ scrollHeight: 4000, clientHeight: 755, scrollTop: 3245, deltaY: 120 }),
  'a REAL parked-at-the-end list still extends bottom (the 2.193.0 stall fix keeps working)');
ok(!wheelExtendsBottom({ scrollHeight: 4000, clientHeight: 755, scrollTop: 0, deltaY: 120 }),
  'a real list scrolled to the TOP does not extend bottom');
ok(!wheelExtendsBottom({ scrollHeight: 790, clientHeight: 755, scrollTop: 35, deltaY: 120 }),
  'a 35px scrollable range is still too little to distinguish the edges');
for (const ch of [600, 700]) {
  for (const sh of HEALTHY) {
    ok(!indeterminate({ scrollHeight: sh, clientHeight: ch, children: 50, windowStart: 3540, windowEnd: 3590, total: 3800 }),
      `healthy landing sh=${sh} @ clientHeight=${ch} → decisions proceed normally`);
  }
}

// the guard must NEVER fire on a complete window — a short conversation that
// genuinely fits one screen has to keep its pin-to-bottom behaviour
ok(!indeterminate({ scrollHeight: 780, clientHeight: 700, children: 50, windowStart: 0, windowEnd: 40, total: 40 }),
  'a SHORT complete conversation (whole window rendered) still pins normally');
// nor on a nearly-empty list (a fresh view with a handful of messages)
ok(!indeterminate({ scrollHeight: 780, clientHeight: 700, children: 4, windowStart: 10, windowEnd: 60, total: 900 }),
  'a nearly-empty list is not treated as collapsed (needs >10 rendered)');

// ── INTENT GATE (inc-msorcsrl — the mechanism the first two fixes missed) ──
// After paging up, content-visibility resolves the fresh batch and NATIVE
// SCROLL ANCHORING raises scrollTop to keep the view stable. The capture shows
// 85 → 1466 in 26 ms, which no wheel can produce. Without an intent gate the
// "near the end ⇒ extendBottom" rule read that as the user scrolling down.
const extendsBottom = ({ scrollHeight, scrollTop, clientHeight, wheelDir, dirAgeMs }) => {
  const goingUp = wheelDir < 0 && dirAgeMs < 1200;
  return scrollHeight - scrollTop - clientHeight < 300 && !goingUp;
};
const extendsTop = ({ scrollTop, wheelDir, dirAgeMs }) => {
  const goingDown = wheelDir > 0 && dirAgeMs < 1200;
  return scrollTop < 100 && !goingDown;
};
// the captured geometry right before the bounce: st 2297, sh ~3100, ch 755
ok(!extendsBottom({ scrollHeight: 3100, scrollTop: 2297, clientHeight: 755, wheelDir: -1, dirAgeMs: 20 }),
  'content growth pushed the view toward the end while the user wheels UP → NO extendBottom');
ok(extendsBottom({ scrollHeight: 3100, scrollTop: 2297, clientHeight: 755, wheelDir: 1, dirAgeMs: 20 }),
  'the same geometry with the user actually wheeling DOWN still extends (paging down keeps working)');
ok(extendsBottom({ scrollHeight: 3100, scrollTop: 2297, clientHeight: 755, wheelDir: -1, dirAgeMs: 5000 }),
  'a STALE upward direction does not veto forever (keyboard/programmatic scrolling still pages)');
ok(!extendsTop({ scrollTop: 20, wheelDir: 1, dirAgeMs: 20 }),
  'mirror: at the top edge while wheeling DOWN → no extendTop (no reverse bounce)');
ok(extendsTop({ scrollTop: 20, wheelDir: -1, dirAgeMs: 20 }),
  'at the top edge while wheeling UP → extendTop, the normal paging path');

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

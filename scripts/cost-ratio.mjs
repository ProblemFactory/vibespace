// COST, JUDGED RELATIVE TO A CONTROL IN THE SAME RUN (lane mirror-flake-hardening, 2.369.270). A fast suite never
// asserts a wall-clock bound on its own run — rel269's mirror went red on `< 3 s` measured 4335 ms on ubuntu-latest, and
// scripts/wall-clock-census.mjs now holds the fast tier to it. What a "fast" / "linear" / "bounded" claim MEANT is a
// SHAPE, and a shape is a ratio of two runs in one process: a slower or busier machine stretches both.
//   bestMs(fn)                 the best of `reps` timed runs after one warm-up (the fastest is the least disturbed)
//   growth(run, small, big)    run(big) ÷ run(small): linear grows by the size ratio, quadratic by its square, a cap
//                              applied before any work not at all. `inner` repeats a run that is too short to time;
//                              `minMs` picks `inner` from the warm-up so one timed take is at least that long.
// CPU time (process.cpuUsage), not the wall clock: a busy box preempts the process but never charges it — measured
// (this lane): a quadratic control's WALL ratio read 846–2 024 × beside three busy loops on one CPU (55–70 × idle), its
// CPU ratio 59–68 ×.

const cpuMs = (since) => { const u = process.cpuUsage(since); return (u.user + u.system) / 1000; };

/** the best of `reps` timed runs of fn in CPU ms (one warm-up first) — only ever compared with another bestMs of this run */
export function bestMs(fn, { reps = 3, inner = 1, minMs = 0 } = {}) {
  const w = process.cpuUsage();
  fn();
  if (minMs > 0) inner = Math.max(inner, Math.ceil(minMs / Math.max(cpuMs(w), 0.001)));
  let best = Infinity;
  for (let i = 0; i < reps; i++) {
    const c = process.cpuUsage();
    for (let j = 0; j < inner; j++) fn();
    best = Math.min(best, cpuMs(c) / inner);
  }
  return best;
}

/** how many times longer run(big) takes than run(small), best of `reps` each → { smallMs, bigMs, ratio } */
export function growth(run, small, big, opts = {}) {
  const smallMs = bestMs(() => run(small), opts), bigMs = bestMs(() => run(big), opts);
  return { smallMs, bigMs, ratio: bigMs / smallMs };
}

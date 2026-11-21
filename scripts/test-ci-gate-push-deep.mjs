#!/usr/bin/env node
// THE GATE'S OWN GATE, PART 2 AT FULL DEPTH — test-ci-gate-push with CI_GATE_PUSH_DEEP=1: the HEAVY twin (B-e381 r6, lane
// bl-release, 2026-11-21; 主开发 r1063: each gate row states what it reads ALONE and stands under 10 s, its deepest legs going to
// a heavy twin as the consent-road suite did). The fast row runs §3, §4 and §5 without §4's round 5 (a) (the gate-input docs
// derived from the table's own suite sources), round 5 (b) (their pushes, end to end), round 5 (c) (the commit being pushed is
// what the tier gates) and round 6 (one fast subject per push — the multi-ref pushes): ~8 s of its ~15 s, §4 running the real pre-push hook some 35 times. Nothing else differs: this file runs
// the WHOLE suite with them — its own legs, the kit's counter, its own exit code (the suite ends with process.exit).
process.env.CI_GATE_PUSH_DEEP = '1';
await import('./test-ci-gate-push.mjs');

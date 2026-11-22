#!/usr/bin/env node
import './scratch.mjs';   // FIRST after node's own (§113)
// THE GATE'S OWN GATE, PART 1 AT FULL DEPTH — test-ci-gate with CI_GATE_DEEP=1: the HEAVY twin (B-54a9, lane bl-tests-a,
// 2026-11-22; 主开发 r2572 (2): a part whose seconds are real children goes to a heavy twin, its tables fast). The fast row runs
// every section without these legs:
// - §2f's legs over stub apt-gets: the stalled mirror, the second mirror, the install's one more try (each bound a real wait);
// - §2n's egress children: the ten planted suites run through the runner with and without the reader, the retry refusals over
//   them, and B-9dd0's remainder of planted node children with its control.
// Their tables stay in the fast row. Nothing else differs: this file runs the WHOLE suite with them — its own legs, the kit's
// counter, its own exit code (the suite ends with process.exit).
process.env.CI_GATE_DEEP = '1';
await import('./test-ci-gate.mjs');

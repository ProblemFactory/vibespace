#!/usr/bin/env node
// THE GATE'S OWN GATE, PART 3 AT FULL DEPTH — test-ci-gate-tiers with CI_GATE_TIERS_DEEP=1: the HEAVY twin (B-e381 r6, lane
// bl-release, 2026-11-21; 主开发 r1063: each gate row states what it reads ALONE and stands under 10 s, its deepest legs going to
// a heavy twin as the consent-road suite did). The fast row runs every section without its three censuses over the REAL table —
// §6's fixed-port / /tmp-path scan of every gated suite, §8's four real-table selections (one walk of the import graph) and its
// census of every heavy row's product input (with that census's own predicate control): ~8 s of its ~15 s; the stub-tree legs
// of the same rules stay in the fast row. Nothing else differs:
// this file runs the WHOLE suite with them — its own legs, the kit's counter, its own exit code (the suite ends with process.exit).
import './scratch.mjs';
process.env.CI_GATE_TIERS_DEEP = '1';
await import('./test-ci-gate-tiers.mjs');

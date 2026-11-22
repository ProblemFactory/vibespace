#!/usr/bin/env node
// THE PATH FIELD'S ANSWER, ITS POOL HALF (the coordinator's r2332, lane bl-chat-b, 2026-11-22): test-dir-complete read 17 s alone, so its
// sections run in two processes, each a fast row measured alone. This half: ③b / ③c over the REAL one-worker pool and the dead-path
// stand-in — B-d833's held worker, M1's re-ask and the join, the hung and the slow probe, R-a … R-i, the press's mark, the walk's
// skip, M3, the counters' seeded law, S4 / N5, FAILED. The suite's ONE table (SECTIONS in test-dir-complete.mjs) names each section's
// half; this file sets its part IN ITS OWN PROCESS before it loads the sections (no row, kit or machine hands a variable in), and the
// suite run by itself runs the rest. Each run asserts that the two halves are disjoint and cover the table, and that no leg ran outside
// a section. Its legs, the counter and the exit code are the suite's (the suite ends with process.exit).
// Run: node scripts/test-dir-complete-pool.mjs
import './scratch.mjs';
globalThis.__VS_DIR_COMPLETE_PART = 'pool';
await import('./test-dir-complete.mjs');

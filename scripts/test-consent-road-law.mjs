#!/usr/bin/env node
// THE CONSENT ROAD'S LAW AT FULL DEPTH — test-consent-road's ⑭ (the live Connect dialog over the real engine: seeded interleavings
// of press / other road / Cancel / close / reopen) at 100 seeds a world WITH its four seeded RED controls: the HEAVY twin (B-54a9,
// lane bl-tests-a, 2026-11-19). The fast row walks the same law at 50 seeds a world and leaves its controls here — each control
// searches until the seeded driver finds its race (159 / 3 / 59 / 46 seeds at ac70cf7ee, up to three times the law's seeds), 8 of
// the fast row's 19 s. Nothing else differs: this file runs the whole suite with CR_LAW=full — its own legs, its own checker, its
// own exit code (the suite ends with process.exit).
import './scratch.mjs';   // FIRST (B-ba47 B2): it loads scratch.mjs at run time too (a dynamic import) — the re-home comes before any of its code
process.env.CR_LAW = 'full';
await import('./test-consent-road.mjs');

#!/usr/bin/env node
// THE DUPLICATE AND THE STORM, ITS PHONE HALF (the coordinator's r2342 / r2410, lane bl-chat-b, 2026-11-22): test-layout-dup-storm read
// 12.1 / 12.6 s alone, so its sections run in two processes, each a fast row measured alone. This half: §PR … §PR6, the phone-resume
// rounds of lane phone-resume-keeps-layout (a phone never replaces a desktop's rows: a resume re-opens its row as itself, the Resume
// bar and «Try resuming anyway» close nothing, an owed recipe is carried once, the watches die with their window, a remembered
// refusal writes nothing), and §6 PR, their mutants, each red. The suite's ONE table (SECTIONS in test-layout-dup-storm.mjs) names
// each section's half; this file sets its part IN ITS OWN PROCESS before it loads the sections (no row, kit or machine hands a variable
// in), and the suite run by itself runs the rest. Each run asserts that the two halves are disjoint and cover the table, and that no leg
// ran outside a section. Its legs, the counter and the exit code are the suite's (the suite ends with process.exit).
// Run: node scripts/test-layout-dup-storm-phone.mjs
import './scratch.mjs';
globalThis.__VS_DUP_STORM_PART = 'phone';
await import('./test-layout-dup-storm.mjs');

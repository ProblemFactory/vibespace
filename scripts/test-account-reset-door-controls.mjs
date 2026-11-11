#!/usr/bin/env node
// THE ACCOUNT-RESET-DOOR DRILL'S RED CONTROLS (heavy — slow for the fast tier): scripts/test-account-reset-door.mjs with
// RESET_DOOR_CONTROLS=1 — this tree's legs, then the same legs on a git archive of master b6d980014 (and, with RESET_DOOR_ROUNDS=1, the lane's rounds
// 1–3 (18104c29c, db0e0220b, cedee3d11)), each RED for its own defect; a commit not in this clone is a COUNTED skip.
process.env.RESET_DOOR_CONTROLS = '1';
await import('./test-account-reset-door.mjs');

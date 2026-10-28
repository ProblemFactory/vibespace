#!/usr/bin/env node
// `claude -p /usage` panel parser (2.327.0): pinned against a REAL captured
// output (2026-08-11, claude 2.1.x). This is the ⟳ ladder's rung 2 — the only
// no-live-session channel that carries model-scoped weeklies — so format
// drift must fail HERE, not silently degrade every refresh to the token read.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parseCliUsageText } = require('../src/usage-routes.js');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + JSON.stringify(e) : '')); } };

const FIXTURE = `You are currently using your subscription to power your Claude Code usage

Current session: 30% used · resets Aug 12, 12:20am (America/Los_Angeles)
Current week (all models): 5% used · resets Aug 13, 2am (America/Los_Angeles)
Current week (Fable): 9% used · resets Aug 13, 2am (America/Los_Angeles)

What's contributing to your limits usage?
Approximate, based on local sessions on this machine — does not include other devices or claude.ai.

Last 24h · 3474 requests · 7 sessions
  98% of your usage was at >150k context`;

// nowMs: the capture evening (2026-08-11 ~18:00 PDT = 2026-08-12 01:00 UTC)
const NOW = Date.UTC(2026, 7, 12, 1, 0, 0);
const r = parseCliUsageText(FIXTURE, NOW);
ok(!!r, 'fixture parses');
ok(Math.abs(r.fiveHour.utilization - 0.30) < 1e-9, '5h utilization 30% → 0.30', r.fiveHour);
ok(Math.abs(r.sevenDay.utilization - 0.05) < 1e-9, '7d utilization 5% → 0.05', r.sevenDay);
ok(r.scopedWeekly.length === 1 && r.scopedWeekly[0].name === 'Fable' && Math.abs(r.scopedWeekly[0].utilization - 0.09) < 1e-9,
  'scoped weekly: Fable 9%', r.scopedWeekly);
// Aug 12, 12:20am America/Los_Angeles (PDT, UTC-7) = Aug 12 07:20 UTC
ok(r.fiveHour.resetsAt === Math.floor(Date.UTC(2026, 7, 12, 7, 20) / 1000), '5h resetsAt = Aug 12 07:20 UTC (12:20am PDT)', r.fiveHour.resetsAt);
// Aug 13, 2am PDT = Aug 13 09:00 UTC
ok(r.sevenDay.resetsAt === Math.floor(Date.UTC(2026, 7, 13, 9, 0) / 1000), '7d resetsAt = Aug 13 09:00 UTC (2am PDT)', r.sevenDay.resetsAt);
ok(r.scopedWeekly[0].resetsAt === r.sevenDay.resetsAt, 'scoped weekly shares the 7d deadline (nested-window model)');

// honesty: API-key mode / unrecognized output → null, never a fabricated zero
ok(parseCliUsageText('API key detected — usage tracking is unavailable', NOW) === null, 'non-subscription output → null');
ok(parseCliUsageText('', NOW) === null, 'empty output → null');
// resets clause absent → bucket kept, resetsAt absent (cache-merge keeps old)
const r2 = parseCliUsageText('Current session: 12% used\nCurrent week (all models): 3% used', NOW);
ok(r2 && r2.fiveHour.utilization === 0.12 && r2.fiveHour.resetsAt === undefined, 'reset-less lines still parse utilization');
// year rollover: a January reset read in late December belongs to NEXT year
const DEC = Date.UTC(2026, 11, 30, 12, 0);
const r3 = parseCliUsageText('Current session: 1% used · resets Jan 2, 3am (America/Los_Angeles)', DEC);
ok(r3.fiveHour.resetsAt * 1000 > DEC, 'January reset parsed in December lands in the FUTURE (next year)', r3.fiveHour.resetsAt);

// THE TWO ANSWERS WITH NO QUOTA LINE (lane pool-silent-members R3, the owner's probe log 2026-10-28): neither is a parser
// drift (85/85 live-login probes parsed the full panel on the same claude 2.1.312 that day) — the parser gives null, never a
// fabricated zero, and the class names what the CLI said (src/auto-cli-model.js panelAnswerClass)
const { panelAnswerClass } = require('../src/auto-cli-model.js');
const COST = 'Total cost:            $0.0000\nTotal duration (API):  0s\nTotal duration (wall): 1s\nTotal code changes:    0 lines added, 0 lines removed\nUsage:                 0 input, 0 output, 0 cache read, 0 cache write\n';
const HEAD = 'You are currently using your subscription to power your Claude Code usage\n';
ok(parseCliUsageText(COST, NOW) === null && panelAnswerClass({ rawStdout: COST }) === 'no-login', 'R3: the non-subscriber cost summary (an EMPTY folder, the env token stripped) → null, classed no-login — never a zero reading');
ok(parseCliUsageText(HEAD, NOW) === null && panelAnswerClass({ rawStdout: HEAD, folderToken: true }) === 'folder-token' && panelAnswerClass({ rawStdout: HEAD }) === null, 'R3: the bare subscription header (a long-lived token in the folder) → null, classed folder-token; the same header from a live login keeps no class');
ok(!!parseCliUsageText(FIXTURE, NOW) && panelAnswerClass({ rawStdout: FIXTURE, folderToken: true }) === null, 'R3: …a panel WITH its quota lines is never classed (the header above them is the full panel\'s own first line)');

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
// B-e5c9 — passive quota capture from the CLI's rate_limit_event records
// (src/rate-limit-capture.js: ONE implementation for local + remote chat).
// Pins the parse (both casings, integer-% normalize, real captured sample)
// and the cache-write DISCIPLINE: fetchedAt bumps ONLY on a real reading
// (utilization or rejected) — a resetsAt/overage-only event must never
// promote stale utilization to "freshest" (the 2.267.0 anchor-poison class);
// identity siblings update without fetchedAt and are never created.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parseRateLimitEvent, captureRateLimitEvent } = require(new URL('../src/rate-limit-capture.js', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };

// ── parse ──
// the REAL captured sample (this machine's buffer, 2026-08-10): no utilization
const real = parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', resetsAt: 1786332600, rateLimitType: 'five_hour', overageStatus: 'rejected', overageDisabledReason: 'org_level_disabled_until', isUsingOverage: false } });
ok(real && real.kind === 'fiveHour' && real.status === 'allowed' && real.utilization === null && real.resetsAt === 1786332600, 'real captured sample parses (no utilization → null, never fabricated)');
ok(real.overage.status === 'rejected' && real.overage.inUse === false, 'overage fields carried');
const full = parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed_warning', resetsAt: 2000000000, rateLimitType: 'seven_day', utilization: 47, surpassedThreshold: 40 } });
ok(full.kind === 'sevenDay' && full.utilization === 0.47 && full.surpassedThreshold === 40, 'integer % normalizes to 0-1 (get_usage precedent); unknown status values pass through');
const frac = parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'five_hour', utilization: 0.62 } });
ok(frac.utilization === 0.62, 'fractional utilization kept as-is');
const snake = parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', resets_at: 123, rate_limit_type: 'five_hour', used_percentage: 12 } });
ok(snake.kind === 'fiveHour' && snake.resetsAt === 123 && snake.utilization === 0.12, 'snake_case variant accepted (2.227.6 defensive rule)');
ok(parseRateLimitEvent({ type: 'result' }) === null && parseRateLimitEvent(null) === null, 'non-events → null');
ok(parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'opus_weekly' } }).kind === 'other', 'unknown bucket type → kind other (surfaced, not misfiled)');

// ── capture discipline ──
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-rle-'));
const read = (id) => { try { return JSON.parse(fs.readFileSync(path.join(dir, id + '.json'), 'utf-8')); } catch { return null; } };
const write = (id, o) => fs.writeFileSync(path.join(dir, id + '.json'), JSON.stringify(o));

// seed: primary stale file with scoped data + a sibling
write('acct-a', { fiveHour: { utilization: 0.3, resetsAt: 100 }, sevenDay: { utilization: 0.5 }, scopedWeekly: [{ name: 'Fable', utilization: 0.7 }], fetchedAt: 1000, orgEmail: 'u@example.com' });
write('acct-b', { fiveHour: { utilization: 0.31 }, fetchedAt: 900 });

// 1. reading event → bucket + fetchedAt bump on PRIMARY, sibling without bump
const NOW = 5_000_000_000_000;
const r1 = captureRateLimitEvent({ cacheDir: dir, key: 'acct-a', identityIds: ['acct-a', 'acct-b', 'acct-missing'], ev: frac, now: NOW });
ok(r1.ok && r1.wroteReading && !r1.dead, 'utilization event = a reading');
const a1 = read('acct-a');
ok(a1.fiveHour.utilization === 0.62 && a1.fetchedAt === NOW && a1.source === 'rate-limit-event', 'primary bucket updated + fetchedAt bumped');
ok(Array.isArray(a1.scopedWeekly) && a1.scopedWeekly[0].name === 'Fable' && a1.orgEmail === 'u@example.com', 'scoped + org fields preserved (base spread)');
const b1 = read('acct-b');
ok(b1.fiveHour.utilization === 0.62 && b1.fetchedAt === 900, 'sibling bucket updated WIT
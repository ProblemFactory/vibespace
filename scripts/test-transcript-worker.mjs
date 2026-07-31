#!/usr/bin/env node
// Transcript worker contract + main-thread-block regression (2.235.0, the
// lengyue degradation follow-up). Generates a >34MB JSONL (forces the bounded
// tail path + line index), then drives the worker-backed async variants while
// a 25ms-cadence probe measures the MAIN thread's max scheduling delay. The
// point of the feature is that heavy transcript work stops blocking the loop —
// so the test asserts exactly that, plus result parity vs the sync originals.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const codex = require('../src/adapters/codex.js');
const store = require('../src/session-store.js');

let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? ' — ' + e : ''}`); } };

// ── fixture: ~36MB, ~90k lines (above the 34MB head+tail threshold) ──
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-tw-'));
const fp = path.join(dir, 'big.jsonl');
{
  const pad = 'x'.repeat(300);
  const w = fs.createWriteStream(fp);
  for (let i = 0; i < 90000; i++) {
    const role = i % 9 === 0 ? 'user' : 'assistant';
    w.write(JSON.stringify({ type: role, uuid: 'u' + i, timestamp: new Date(1700000000000 + i * 1000).toISOString(), message: { role, content: [{ type: 'text', text: `line ${i} ${pad}` }] } }) + '\n');
  }
  await new Promise((r) => w.end(r));
}
const sizeMB = Math.round(fs.statSync(fp).size / 1048576);
check(`fixture is big enough to trigger bounded path (${sizeMB}MB)`, fs.statSync(fp).size > 34 * 1024 * 1024);

// ── main-thread block probe ──
let maxBlock = 0, probeLast = Date.now(), probeT = setInterval(() => {
  const now = Date.now(); maxBlock = Math.max(maxBlock, now - probeLast - 25); probeLast = now;
}, 25);

// ── worker-backed calls (all three heavy classes) ──
const t0 = Date.now();
const gap = await codex.jsonlGapInfoAsync(fp);          // builds the index worker-side
const turns = await codex.scanJsonlUserTurnsAsync(fp, 'claude');
const slab = await codex.readJsonlLineRangeAsync(fp, 100, 2100);
const recs = await codex.readJsonlBoundedParsedAsync(fp, { tailOnly: true, dropSubagent: true });
const asyncMs = Date.now() - t0;
clearInterval(probeT);

check('gapInfo returns a real gap (elided file)', gap && gap.totalLines === 90000 && gap.tailStartLine > 0, JSON.stringify(gap));
check('userTurns found the user lines', Array.isArray(turns) && turns.length === 10000, `got ${turns?.length}`);
check('lineRange slab parsed', Array.isArray(slab) && slab.length === 2000 && slab[0].uuid === 'u100');
check('boundedParsed returned tail records', Array.isArray(recs) && recs.length > 1000 && recs[recs.length - 1].uuid === 'u89999', `n=${recs?.length}`);
check(`main thread never blocked >150ms during worker calls (max ${maxBlock}ms, total ${asyncMs}ms)`, maxBlock < 150, `maxBlock=${maxBlock}ms`);

// ── parity vs sync originals ──
const gapSync = codex.jsonlGapInfo(fp);
check('gapInfo parity with sync', JSON.stringify(gap) === JSON.stringify(gapSync));
const slabSync = codex.readJsonlLineRange(fp, 100, 2100);
check('lineRange parity with sync', JSON.stringify(slab) === JSON.stringify(slabSync));

// ── negative control: the SYNC path DOES block (proves the probe works) ──
codex.__clearIndexCacheForTest?.();
let maxBlockSync = 0; probeLast = Date.now();
probeT = setInterval(() => { const now = Date.now(); maxBlockSync = Math.max(maxBlockSync, now - probeLast - 25); probeLast = now; }, 25);
const before = Date.now();
const raw = require('fs').readFileSync(fp, 'utf-8'); // the old class of work, inline
let n = 0; for (const line of raw.split('\n')) { if (line) { try { JSON.parse(line); n++; } catch {} } }
await new Promise((r) => setTimeout(r, 60));
clearInterval(probeT);
check(`negative control: inline parse of the same file blocks the loop (${maxBlockSync}ms)`, maxBlockSync > 50, `maxBlockSync=${maxBlockSync}ms (parsed ${n} lines in ${Date.now() - before}ms)`);

// ── warmSessionJsonlAsync end-to-end (cache population path) ──
// findSessionJsonlPath scans ~/.claude/projects + remote cache; simulate via the
// remote-jsonl cache dir the function already scans.
const cacheDir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data', 'remote-jsonl', 'tw-test-host');
fs.mkdirSync(cacheDir, { recursive: true });
const cid = 'a0000000-1111-2222-3333-444444444444';
fs.copyFileSync(fp, path.join(cacheDir, cid + '.jsonl'));
try {
  const warmed = await store.warmSessionJsonlAsync(cid, '/tmp');
  check('warmSessionJsonlAsync warms the cache', warmed === true);
  let mb = 0; probeLast = Date.now();
  probeT = setInterval(() => { const now = Date.now(); mb = Math.max(mb, now - probeLast - 25); probeLast = now; }, 25);
  const t1 = Date.now();
  const msgs = store.parseSessionJsonl(cid, '/tmp'); // sync read hits the warm cache
  const syncHitMs = Date.now() - t1;
  await new Promise((r) => setTimeout(r, 40));
  clearInterval(probeT);
  check(`sync parse after warm is a cache HIT (${syncHitMs}ms, block ${mb}ms)`, syncHitMs < 50 && msgs.length > 1000, `syncHitMs=${syncHitMs} n=${msgs.length}`);
} finally {
  fs.rmSync(cacheDir, { recursive: true, force: true });
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
process.exit(failed ? 1 : 0);

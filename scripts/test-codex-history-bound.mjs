#!/usr/bin/env node
// test-codex-history-bound.mjs — lane resume-all-paced L3 cure (主开发 2026-11-16 23:16Z, P3 + P4 + the limit's scope): THE HISTORY
// WORKER'S HEAP BOUND IS A BOUND UNDER EVERY START OF THE HUB. A Worker's resourceLimits are a HARD limit that a parent
// --max-old-space-size REPLACES (the runtime's rule; usage-cold-worker.js and test-cache-bounds §14 measured it for the usage fold), so
// the codex history read's worker (SafeFs's `history` lane, src/adapters/codex.js) checks its own heap at each page and refuses past
// its bound by name. Each leg runs in a CHILD process started as a hub may be started, over a small stand-in rollout built at run
// time in this run's scratch dir — never a real transcript; no load, no real CLI, no billed turn.
//   ① a hub started WITH a heap option (--max-old-space-size=4096): the history worker's own check refuses a page past its bound
//      (here 8 MB, under any worker's floor) by name — the reader hears «heap bound» and gives the read back (null; the caller parses
//      on the loop, said) WITHOUT the one-shot read — the worker alive (no restart), and the next call is served
//   ② RED CONTROL — the same start, the hard limit ALONE (the worker's resourceLimits at 8 MB, no own check): the page past the bound
//      is SERVED, the worker's heap over it — the hard limit is no bound under a parent heap option
//   ③ the bound is the history lane's only: the pool's own two workers (Claude's history reads, the line index, the turn scans) carry
//      none — and the lane's carries both its hard limit and its own check (768 MB)
//   ④ the control's control — a hub started WITHOUT a heap option, the same hard limit alone: it binds — the worker dies alone
//      (a restart), its call is answered (the reader's one-shot read in the pool serves the records), and the pool serves the next
//      call; so ②'s served page is the parent option's doing, not a limit too small to act
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { scratch } from './scratch.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIR = scratch('codex-hbound');
fs.mkdirSync(DIR, { recursive: true });
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra !== undefined ? '\n    ' + JSON.stringify(extra).slice(0, 1500) : '')); } return !!c; };

// the stand-in rollout: ~3 MB of small codex records (the shape of the attach suite's rig)
const FP = path.join(DIR, 'rollout-2026-11-16T10-00-00-019a6e00-0000-7000-8000-0000000b0a0d.jsonl');
{
  const ts = (i) => new Date(Date.UTC(2026, 10, 16) + i * 1000).toISOString();
  let chunk = '', i = 0;
  while (chunk.length < 3 * 1048576) {
    i++;
    chunk += JSON.stringify({ timestamp: ts(i), type: 'turn_context', payload: { turn_id: 't' + i, cwd: '/srv/stand-in', model: 'gpt-5.1-codex', effort: 'high' } }) + '\n';
    chunk += JSON.stringify({ timestamp: ts(i), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: `step ${i}: run the checks again` }] } }) + '\n';
    chunk += JSON.stringify({ timestamp: ts(i), type: 'response_item', payload: { type: 'function_call_output', call_id: `c${i}`, output: 'ok '.repeat(80) } }) + '\n';
  }
  fs.writeFileSync(FP, chunk);
}

// a child as a hub is started: `flags` = its node options; `mb`/`soft` = the history lane's bound for this run
const child = (flags, { mb, soft }) => new Promise((resolve) => {
  const src = `
    import { createRequire } from 'node:module';
    const require = createRequire(${JSON.stringify(path.join(REPO, 'x.js'))});
    const codex = require(${JSON.stringify(path.join(REPO, 'src/adapters/codex.js'))});
    const { askMemory, trackedWorkers } = require(${JSON.stringify(path.join(REPO, 'src/worker-memory.js'))});
    const keep = setInterval(() => {}, 1000);   // SafeFs unrefs an idle worker and the memory ask's timer: keep this child alive to its end
    codex._setHistoryHeapMbForTest(${mb}, { soft: ${soft} });
    const pool = codex.transcriptPool();
    const out = { limit: Math.round(require('node:v8').getHeapStatistics().heap_size_limit / 1048576) };
    out.poolLimits = pool._opts.resourceLimits || null;
    out.laneLimits = pool.lane('history')._opts.resourceLimits || null;
    const before = codex.pagedReadStats();
    let why = null;
    const r1 = await codex.readJsonlBoundedParsedPagedAsync(${JSON.stringify(FP)}, { onFail: (w) => { why = w; } });
    out.first = { served: Array.isArray(r1), n: Array.isArray(r1) ? r1.length : 0, why };
    const mid = codex.pagedReadStats();
    out.oneShot = mid.oneShot - before.oneShot;
    const mem = await askMemory(trackedWorkers().filter((w) => /history/.test(w.name)));
    out.laneHeapMb = mem.length && mem[0].mem ? Math.round(mem[0].mem.heapUsed / 1048576) : null;
    codex._setHistoryHeapMbForTest(768, { soft: true });
    const r2 = await codex.readJsonlBoundedParsedPagedAsync(${JSON.stringify(FP)}, {});
    out.next = { served: Array.isArray(r2), n: Array.isArray(r2) ? r2.length : 0 };
    out.restarts = pool.lane('history')._restarts;
    try { const g = await pool.call('gapInfo', { fp: ${JSON.stringify(FP)} }); out.poolServed = g === null || typeof g === 'object'; } catch (e) { out.poolServed = false; out.poolErr = e.message; }
    console.log('RESULT ' + JSON.stringify(out));
    process.exit(0);`;
  execFile(process.execPath, [...flags, '--input-type=module', '-e', src], { encoding: 'utf8', timeout: 60000, env: { ...process.env, HOME: DIR } }, (e, stdout, stderr) => {
    const line = String(stdout || '').split('\n').find((l) => l.startsWith('RESULT '));
    resolve(line ? JSON.parse(line.slice(7)) : { stderr: String(stderr || '').slice(-1200), error: String((e && e.message) || 'no result').slice(0, 80) });
  });
});

console.log('— ① a hub started WITH a heap option: the history worker refuses a page past its bound by name, and lives');
const A = await child(['--max-old-space-size=3000'], { mb: 8, soft: true });
ok(A.limit >= 3000 && A.limit < 3400, `the child is started with a heap option of its own (its heap limit ${A.limit} MB — this box's default is ~4288)`, A);
ok(A.first && !A.first.served && /heap bound/.test(A.first.why || '') && A.oneShot === 0, `a page past the 8 MB bound is refused by name — the reader hears «${(A.first && A.first.why || '').slice(0, 90)}…» and gives the read back without the one-shot read`, A);
ok(A.restarts === 0 && A.next && A.next.served && A.next.n > 1000, `…the worker alive (restarts ${A.restarts}) and the next call served (${A.next && A.next.n} records)`, A);

console.log('— ② RED CONTROL: the hard limit alone under the same start');
const B = await child(['--max-old-space-size=3000'], { mb: 8, soft: false });
ok(B.first && B.first.served && B.laneHeapMb > 8 && B.restarts === 0, `RED CONTROL — the worker's resourceLimits at 8 MB and no own check: the page is SERVED (${B.first && B.first.n} records) with the worker's heap at ${B.laneHeapMb} MB — a parent heap option replaces the hard limit`, B);

console.log('— ③ the bound is the history lane\'s only');
const C = await child([], { mb: 768, soft: true });
ok(C.poolLimits === null && C.laneLimits && C.laneLimits.maxOldGenerationSizeMb === 768 && C.first && C.first.served, `the pool's own workers carry no limit (${JSON.stringify(C.poolLimits)}); the history lane's carries 768 MB and serves the page (${C.first && C.first.n} records)`, C);

console.log('— ④ the control\'s control: no heap option, the same hard limit alone — it binds');
const D = await child([], { mb: 8, soft: false });
ok(D.restarts >= 1 && D.first && D.first.served && D.oneShot === 1 && D.poolServed === true, `the worker dies alone (restarts ${D.restarts}), its call is answered (the one-shot read in the pool serves ${D.first && D.first.n} records), the pool serves the next call — the hard limit binds without a parent option`, D);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

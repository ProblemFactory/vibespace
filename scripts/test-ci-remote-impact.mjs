#!/usr/bin/env node
// THE HEAVY TWIN OF test-ci-remote (B-7e49, lane bl-tests-chrome, 主开发 r4541 / r4544): the legs that compute the IMPACT over the REAL
// tree — ④'s two calls on the change that touches the most suites (src/server.js), the remote's selectSlice against the hub's
// listAffected, names AND order, and ⑦'s affected batch — MOVED VERBATIM by the tier rule: ci.mjs affectedSuites reads EVERY suite's
// inputs (its source and its import closure) for any changed file, about 3.5 s a call on the test machine. THE HAND-OVER of the range
// and the changed files from the remote's slice to the affected set is judged HERE ONLY; test-ci-remote keeps ④'s law (the remote's
// slicing and order against the hub's list) over the whole heavy tier, with no range. The setup lines (the marker dir, the self-hosted
// set) are test-ci-remote's own, copied.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import './scratch.mjs';   // FIRST (B-ba47 B2): it loads scratch.mjs at run time too (a dynamic import) — the re-home comes before any of its code
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const R = await import(path.join(REPO, 'scripts/ci-remote.mjs'));
const CI = await import(path.join(REPO, 'scripts/ci.mjs'));
const throws = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };
const heavy = CI.SUITES.filter((s) => s.tier === 'heavy');
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ci-remote-impact-'));
try {
  // ④ the hub half cuts the same list — over the affected set of the largest change
  const md = path.join(D, 'markers'); fs.mkdirSync(md);
  const two = heavy.slice(0, 2).map((s) => s.name);
  // a marker in the box writer's shape (sha, result, failed, endedAt): the timings reader goes through readMarkers, and LAW A
  // (ci-heavy-verdict r4) drops a marker that is not a record of its kind — the int389 cut found this fixture written bare
  fs.writeFileSync(path.join(md, 'abcdef1.green'), JSON.stringify({ sha: 'abcdef1', result: 'green', failed: [], endedAt: 1, timings: [{ name: two[0], ms: 5 }, { name: two[1], ms: 9000 }] }));
  for (const k of [2]) {
    const mine = R.selectSlice(CI, { tree: REPO, changed: ['src/server.js'], range: 'x..y', shard: { i: k, n: 2 }, timingDirs: [md] });
    const hub = CI.listAffected({ range: 'x..y', shard: { i: k, n: 2 }, dir: md, changed: ['src/server.js'] });
    ok(mine.names.length > 0 && mine.names.join() === hub.names.join(), `④ slice ${k}/2 = ci.mjs --list-affected's (${mine.names.length} names, same order)`);
  }
  // ⑦ an affected batch
  const srcOf = (n) => { try { return fs.readFileSync(path.join(REPO, 'scripts', n + '.mjs'), 'utf-8'); } catch { return ''; } };
  const self = CI.hostPlan(heavy, { sourceOf: srcOf }).self.map((s) => s.name).sort();
  const bta = R.selectSlice(CI, { tree: REPO, batch: 'desktop', changed: ['package.json'], range: 'x..y' });
  ok(bta.names.slice().sort().join() === self.join(), '⑦ an affected batch selects inside the self-hosted set (a global input ⇒ all of it, none of the hosted)');
} finally {
  fs.rmSync(D, { recursive: true, force: true });
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

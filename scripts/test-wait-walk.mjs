#!/usr/bin/env node
// THE READING EQUALS READER A'S ORACLE (lane queued-is-not-woke laws 2 + 3, SHAPE C — 主开发 13:42Z): scripts/wait-walk.mjs, the
// reader's 23-act random walk (int359/acc-399/cut-a, copied — with its ONE fix: its ladder shadowed the store, so no frame was
// ever held), five seeds × 3 000 steps with the await act ON. After EVERY step the async reading of every member equals the
// oracle written from the log, the marks and the held frames (count, oldest, each sender's; nothing for mute / ended /
// archived / own). This one leg replaces the cut's whole crash matrix: nothing is kept, so nothing can be stale.
// A red control: the reading's reach without the report's `also` (an awaited reply) diverges.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { mutantCopies } from './mutant-copy.mjs';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const J = JSON.stringify;
const MUT = mutantCopies('wait-walk', REPO);
const walk = (seed, steps, env = {}) => {
  const out = execFileSync(process.execPath, [path.join(REPO, 'scripts/wait-walk.mjs'), String(seed), String(steps)], { cwd: REPO, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024, timeout: 900000 });
  const line = out.split('\n').find((l) => l.startsWith('{"seed"'));
  return { r: line ? JSON.parse(line) : null, out };
};
console.log('THE WALK — five seeds × 3 000 steps, the await act on, every member read after every step');
const rows = [];
for (const seed of [1, 2, 3, 4, 5]) { const a = Date.now(); const { r, out } = walk(seed, 3000); rows.push({ seed, ms: Date.now() - a, r, first: r && r.divergedSteps ? out.split('\n').filter((l) => /FIRST DIVERGENCE|^  /.test(l)).slice(0, 6).join(' | ') : null }); }
const steps = rows.reduce((n, x) => n + (x.r ? x.r.steps : 0), 0);
ok(`${steps} steps over five seeds: the reading equals the oracle at every step — 0 divergences`, rows.every((x) => x.r && x.r.steps === 3000 && x.r.divergedSteps === 0), J(rows.map((x) => [x.seed, x.r && x.r.divergedSteps, x.first])));
ok('…the await act ran (an awaited reply reaching its `mention` asker), frames were held behind turns, restarts happened, and THE GATE hid no wait older than its bound (every such group read alike)', rows.every((x) => x.r && x.r.counts['post-await'] > 50 && x.r.stat.frames > 0 && x.r.counts.restart > 0 && x.r.stat.gateNeed > 0), J(rows.map((x) => x.r && [x.r.counts['post-await'], x.r.stat.frames, x.r.counts.restart, x.r.stat.gateNeed])));
console.log('   ' + J(rows.map((x) => ({ seed: x.seed, ms: x.ms, diverged: x.r && x.r.divergedSteps, awaits: x.r && x.r.counts['post-await'], frames: x.r && x.r.stat.frames }))));
console.log('RED CONTROL');
{
  const rel = 'src/server/groups-engine.js';
  const src = fs.readFileSync(path.join(REPO, rel), 'utf8');
  const a = '      const take = unreceivedFor(g, cid);';
  const m = src.includes(a) ? MUT.write(rel, src.split(a).join('      const take = (r) => isMessage(r) && G.reachesReport(g, cid, r);'), 'noalso') : null;
  const { r } = m ? walk(1, 3000, { WALK_GE: m }) : { r: null };   // the walk's own length (主开发 15:30Z item 1: the reader's first divergence came at step 1 590)
  ok('CONTROL: the reading without the report\'s `also` ⇒ the walk diverges (an awaited reply to a `mention` member uncounted)', !!m && !!r && r.divergedSteps > 0, J(r && { diverged: r.divergedSteps }));
}
console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass})`);
process.exit(fail ? 1 : 0);

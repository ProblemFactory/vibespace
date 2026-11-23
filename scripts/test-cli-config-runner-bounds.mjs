#!/usr/bin/env node
// test-cli-config-runner-bounds — B-ddf3 unit 2, LINE 1's RUNNER BOUNDS (lane bl-scratch): the timing legs of
// test-cli-config-runner, SPLIT into this twin word for word (the coordinator's r2740: the fast file sat near the tier's 10 s).
// FAST, in-process: src/server/cli-config-runner.js under stand-in starters and a stand-in home (stalled, slow, released).
//   ①d every step inside a job is bounded by the run's own bound          RED: an unbounded check
//   ①e a job ends within its bound whatever the home does (the look)    RED: an unbounded look
//   ①f a «still asked» read that fails is a failed landing; a joiner carries its own read          REDs
//   ①g while an earlier read of the home is out, a job asks nothing more  RED: no guard
//   ①h the count returns to zero when the held read answers               RED: a count that never comes back
//   ①i the guard after the «still asked» reads                             RED: no guard after the reads
//   ①k a short bound refuses no one (counted past the RUN's bound)        RED: counted at the reader's own bound
//   ①l one read out per reader class (the pile on a silent home)          RED: no reader class
//   ①j a broken run tells its check its own reason                        RED: the guard's words
// test-cli-config-runner keeps a PIN that every leg above lives here. Run: node scripts/test-cli-config-runner-bounds.mjs
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { checker } from './lib/check.mjs';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { ok, report } = checker();
const ROOT = scratch('cli-config-runner-bounds');
fs.mkdirSync(ROOT, { recursive: true });
const MC = mutantCopies('cli-config-runner-bounds', REPO);
const tick = () => new Promise((r) => setImmediate(r));
const KEEP = setInterval(() => {}, 60000);   // the runner's bound timers are unref'd (a hub's loop is alive anyway): this run's own is not
const RUNNER_REL = 'src/server/cli-config-runner.js';
const src = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

// a starter whose runs the suite finishes by hand (the queue's legs), recording every request
function handStarter() {
  const calls = [], live = new Set();
  let most = 0;
  return { calls, most: () => most, run: (cmd, args, o) => new Promise((resolve) => { const c = { cmd, args, o, finish: (r) => { live.delete(c); resolve(r); } }; calls.push(c); live.add(c); most = Math.max(most, live.size); }) };
}
const okRun = { started: true, code: 0, stdout: 'CFG|claude|transcriptRetentionDays|unchanged|%2236500%22|%2236500%22|null\n', stderr: '' };
const R = require(path.join(REPO, RUNNER_REL));
const HCJ = require(path.join(REPO, 'src/harness-config.js'));
const planAt = (dir) => HCJ.encodePlan({ v: 1, files: [{ harness: 'claude', id: 'settings', rel: [dir, 'settings.json'], format: 'json', set: [] }] });

console.log('①d r1813: every step inside a job is BOUNDED by the run\'s own bound — a check that never answers holds the queue that long at most');
async function stallLegs(Rm) {
  const order = [], st = handStarter(), r = Rm.createCliConfigRunner({ starter: { run: (cmd, args, o) => { order.push('run ' + o.envAdd.VIBESPACE_CLI_CONFIG); return st.run(cmd, args, o); } }, helperPath: '/x/helper.mjs', timeoutMs: 80, stat: async () => { throw new Error('none'); }, journal: () => {}, warn: () => {} });
  const stalled = r.apply(() => 'PLAN-S', 'hooks removed', { uninstall: true, after: () => new Promise(() => {}) });   // a home whose reads never answer
  let nextLanding = null; const next = r.apply(() => 'PLAN-N', 'hooks (asked)', { kind: 'apply+hooks' }).then((l) => { nextLanding = l; });
  for (let k = 0; k < 100 && !nextLanding; k++) { for (const call of st.calls) call.finish(okRun); await new Promise((res) => setTimeout(res, 10)); }   // ≤ 1 s (the bound is 80 ms)
  for (const call of st.calls) call.finish(okRun);
  const s1 = await Promise.race([stalled, new Promise((res) => setTimeout(() => res(null), 200))]);
  return { order, after: s1 && s1.after, next: nextLanding && { ok: nextLanding.ok, why: nextLanding.why }, nextAsked: order.includes('run PLAN-N'), pending: !!next };
}
{
  const s = await stallLegs(R);
  ok(!!(s.after && /the check of the files did not finish within 80 ms/.test(s.after.error || '') && s.next && s.next.ok === false && /the home still has not answered an earlier read/.test(s.next.why || '') && !s.nextAsked),
    'a check that never answers: at the run\'s bound the job ends, its reply says the check did not finish; the next request ENDS at once, by name («the home still has not answered»), asking the home nothing (r2109)', s);
  const sm = await stallLegs(require(MC.write(RUNNER_REL, anchored(src(RUNNER_REL), '        const a = homeStuck > 0 ? { held: true } : await bounded(() => job.after(landing));', '        const a = { value: await job.after(landing) };', 'an unbounded check'), 'after-unbounded')));
  ok(!sm.next, 'RED (an unbounded check — the r1675 form): the stalled check holds the queue — the next Install never ends', sm);
}

console.log('①e r1876 (the must): A JOB ENDS WITHIN ITS BOUND WHATEVER THE HOME DOES — the look at the plan\'s files is bounded too');
async function lookLegs(Rm) {
  const order = [], st = handStarter();
  const r = Rm.createCliConfigRunner({ starter: { run: (cmd, args, o) => { order.push('run ' + (o.envAdd.VIBESPACE_CLI_CONFIG === planAt('.ok') ? 'NEXT' : 'STALLED')); return st.run(cmd, args, o); } }, helperPath: '/x/helper.mjs', home: ROOT, timeoutMs: 80,
    stat: (p) => (String(p).includes(`${path.sep}.stall${path.sep}`) ? new Promise(() => {}) : Promise.reject(new Error('none'))), journal: () => {}, warn: () => {} });   // a home whose reads never answer, for the first plan's file
  const stalled = r.apply(() => planAt('.stall'), 'a save', { kind: 'apply' });
  let nextLanding = null; const next = r.apply(() => planAt('.ok'), 'hooks (asked)', { kind: 'apply+hooks' }).then((l) => { nextLanding = l; });
  for (let k = 0; k < 100 && !nextLanding; k++) { for (const call of st.calls) call.finish(okRun); await new Promise((res) => setTimeout(res, 10)); }   // ≤ 1 s (the bound is 80 ms)
  for (const call of st.calls) call.finish(okRun);
  const s1 = await Promise.race([stalled, new Promise((res) => setTimeout(() => res(null), 200))]);
  return { order, stalled: s1 && { ok: s1.ok, why: s1.why }, next: nextLanding && { ok: nextLanding.ok, why: nextLanding.why }, pending: !!next };
}
{
  const l = await lookLegs(R);
  ok(!!(l.stalled && l.stalled.ok === false && /the plan's files under the home could not be read within 80 ms/.test(l.stalled.why || '') && !l.order.includes('run STALLED') && l.next && l.next.ok === false && /the home still has not answered an earlier read/.test(l.next.why || '')),
    'a look under the home that never answers: the job ends at the bound — «the plan\'s files … could not be read», the helper not run — and the NEXT request ENDS at once, by name (r2109)', l);
  const LOOK = "    const look = async () => { if (!files.length) return { value: [] }; if (homeStuck > 0) return { held: true }; const r = await bounded(() => Promise.all(files.map((f) => exists(f.file)))); return r.timedOut ? { timedOut: true } : { value: r.value }; };";
  const lm = await lookLegs(require(MC.write(RUNNER_REL, anchored(src(RUNNER_REL), LOOK, '    const look = async () => ({ value: await Promise.all(files.map((f) => exists(f.file))) });', 'an unbounded look'), 'look-unbounded')));
  ok(!lm.next, 'RED (an unbounded look — the follow\'s first form): the stalled look holds the queue — the next request never ends', lm);
}

console.log('①f r1876 (the smalls): a «still asked» read that fails is a FAILED landing with its reason; a joining request carries its own read');
async function failedReadLegs(Rm) {
  const st = handStarter(), r = Rm.createCliConfigRunner({ starter: st, helperPath: '/x/helper.mjs', timeoutMs: 80, stat: async () => { throw new Error('none'); }, journal: () => {}, warn: () => {} });
  const unreadable = await r.apply(() => 'PLAN-U', 'hooks removed (a start)', { uninstall: true, kind: 'strip-if-still-asked', when: async () => { throw Object.assign(new Error('EACCES: the mark cannot be read'), { code: 'EACCES' }); } });
  const silent = await r.apply(() => 'PLAN-T', 'hooks removed (a start)', { uninstall: true, kind: 'strip-if-still-asked', when: () => new Promise(() => {}) });
  return { unreadable, silent, runs: st.calls.length };
}
{
  const f = await failedReadLegs(R);
  ok(!!(f.unreadable.ok === false && /could not be read \(EACCES: the mark cannot be read\)/.test(f.unreadable.why || '') && !f.unreadable.skipped && f.silent.ok === false && /did not answer within 80 ms/.test(f.silent.why || '') && f.runs === 0),
    'an unreadable or silent «still asked» read: not run, and answered NOT-ok with its reason — never «ok, skipped»', f);
  // r2109: its RED — a failed read mapped to a skip (the line that answers it not-ok taken out)
  const BAD = "          if (bad) return broke(job, bad.timedOut ? `not run: whether it was still asked did not answer within ${timeoutMs} ms` : `not run: whether it was still asked could not be read (${said(bad.error)})`);\n";
  const fm = await failedReadLegs(require(MC.write(RUNNER_REL, anchored(src(RUNNER_REL), BAD, '', 'a failed read mapped to a skip'), 'read-as-skip')));
  ok(!!(fm.unreadable.ok === true && fm.unreadable.skipped), 'RED (a failed read mapped to a skip): the unreadable mark is answered «ok, not run: no longer asked»', fm.unreadable);
}
async function joinLegs(Rm) {
  const st = handStarter(), r = Rm.createCliConfigRunner({ starter: st, helperPath: '/x/helper.mjs', stat: async () => { throw new Error('none'); }, journal: () => {}, warn: () => {} });
  const inflight = r.apply(() => 'PLAN-0', 'a save', { kind: 'apply' });
  await tick();
  const x = r.apply(() => 'PLAN-X', 'a start', { kind: 'k', when: async () => false }), y = r.apply(() => 'PLAN-Y', 'a press', { kind: 'k', when: async () => true });
  for (let k = 0; k < 6; k++) { for (const call of st.calls) call.finish(okRun); await tick(); }
  const all = await Promise.race([Promise.all([inflight, x, y]), new Promise((res) => setTimeout(() => res(null), 2000))]);
  return { runs: st.calls.map((c) => c.o.envAdd.VIBESPACE_CLI_CONFIG), y: all && { ok: all[2].ok, skipped: all[2].skipped || null } };
}
{
  const j = await joinLegs(R);
  ok(!!(j.runs.includes('PLAN-Y') && j.y && j.y.ok === true && !j.y.skipped), 'a request that joins a waiting one of its kind carries its OWN «still asked» read: one says yes ⇒ the job runs', j);
  const jm = await joinLegs(require(MC.write(RUNNER_REL, anchored(src(RUNNER_REL), ' tail.whens.push(when); tail.resolvers.push(resolve);', ' tail.resolvers.push(resolve);', 'the joiner\'s read dropped'), 'join-no-when')));
  ok(!!(!jm.runs.includes('PLAN-Y') && jm.y && jm.y.skipped), 'RED (the joiner\'s read dropped — the follow\'s first form): the press is answered «not run: no longer asked»', jm);
}

const BEFORE_GUARD = "      if (homeStuck > 0) return broke(job, `not run: the home still has not answered an earlier read (${homeStuck} still out) — nothing written by this hub, asked again at the next request`);   // r2224 (2): a «still asked» read that ran out of time is still out — `before` and the look ask nothing more\n";
console.log('①g r2109: while an earlier read of the home is still out, a job asks the home NOTHING more — it fails at once, by name');
async function heldLegs(Rm) {
  let stats = 0; const st = handStarter();
  const r = Rm.createCliConfigRunner({ starter: st, helperPath: '/x/helper.mjs', home: ROOT, timeoutMs: 80, stat: () => { stats++; return new Promise(() => {}); }, journal: () => {}, warn: () => {} });   // a home that never answers (held)
  const first = await r.apply(() => planAt('.held'), 'a save', { kind: 'apply' });
  const statsAfterFirst = stats;
  const second = await Promise.race([r.apply(() => planAt('.held'), 'a press', { kind: 'apply+hooks' }), new Promise((res) => setTimeout(() => res(null), 1500))]);
  return { first: { ok: first.ok, why: first.why }, second: second && { ok: second.ok, why: second.why }, statsAfterFirst, stats, runs: st.calls.length };
}
{
  const h = await heldLegs(R);
  ok(!!(h.first.ok === false && /could not be read within 80 ms/.test(h.first.why || '') && h.second && h.second.ok === false && /the home still has not answered an earlier read \(1 still out\)/.test(h.second.why || '') && h.stats === h.statsAfterFirst && h.runs === 0),
    'a held home: the first job ends at its bound; the NEXT job fails at once by name («the home still has not answered») and issues NO new read', h);
  const JOB_GUARD = "      if (homeStuck > 0) return broke(job, `not run: the home still has not answered an earlier read (${homeStuck} still out) — nothing written by this hub, asked again at the next request`);   // r2109: no new read\n";
  const LOOK_GUARD = 'if (homeStuck > 0) return { held: true }; ';
  const hm = await heldLegs(require(MC.write(RUNNER_REL, anchored(anchored(anchored(src(RUNNER_REL), JOB_GUARD, '', 'no job guard'), BEFORE_GUARD, '', 'no guard after the reads'), LOOK_GUARD, '', 'no look guard'), 'held-asks-again')));
  ok(hm.stats > hm.statsAfterFirst, 'RED (no guard — the follow\'s second form): the next job issues a NEW read into the held home (one more stranded in the pool)', hm);
}

console.log('①h r2224 (3): THE COUNT RETURNS TO ZERO — once the held read answers, the next job runs (a runner that never runs again is the worst outcome)');
async function releaseLegs(Rm) {
  const held = []; let release = false; const st = handStarter();
  const r = Rm.createCliConfigRunner({ starter: st, helperPath: '/x/helper.mjs', home: ROOT, timeoutMs: 80, stat: () => (release ? Promise.reject(new Error('none')) : new Promise((res, rej) => { held.push(rej); })), journal: () => {}, warn: () => {} });
  const first = await r.apply(() => planAt('.held'), 'a save', { kind: 'apply' });
  release = true; for (const rej of held) rej(new Error('ESTALE: the home answered at last')); await tick(); await tick();   // the held read settles
  let nextLanding = null; const next = r.apply(() => planAt('.held'), 'a press', { kind: 'apply+hooks' }).then((l) => { nextLanding = l; });
  for (let k = 0; k < 60 && !nextLanding; k++) { for (const call of st.calls) call.finish(okRun); await new Promise((res) => setTimeout(res, 10)); }
  return { first: { ok: first.ok, why: first.why }, next: nextLanding && { ok: nextLanding.ok, why: nextLanding.why }, runs: st.calls.length, pending: !!next };
}
{
  const z = await releaseLegs(R);
  ok(!!(z.first.ok === false && /could not be read within 80 ms/.test(z.first.why || '') && z.next && z.next.ok === true && z.runs === 1),
    'a held home that answers at last: the first job ended at its bound; the read settles, the count returns to zero, and the NEXT job runs the helper and lands', z);
  const BACK = 'homeStuck++; const back = () => { homeStuck--; }; p.then(back, back); };';
  const zm = await releaseLegs(require(MC.write(RUNNER_REL, anchored(src(RUNNER_REL), BACK, 'homeStuck++; };', 'a count that never comes back'), 'stuck-for-ever')));
  ok(!!(zm.next && zm.next.ok === false && /the home still has not answered an earlier read/.test(zm.next.why || '') && zm.runs === 0), 'RED (a count that never comes back): the home answered, yet every next job is refused — the runner never runs again', zm);
}

console.log('①i r2224 (2): a «still asked» read that ran out of time is still out — the job asks the home nothing more (its `before` included)');
async function beforeLegs(Rm) {
  let befores = 0; const st = handStarter();
  const r = Rm.createCliConfigRunner({ starter: st, helperPath: '/x/helper.mjs', timeoutMs: 80, stat: async () => { throw new Error('none'); }, journal: () => {}, warn: () => {} });
  const inflight = r.apply(() => 'PLAN-0', 'a save', { kind: 'apply' });
  await tick();
  const x = r.apply(() => 'PLAN-X', 'a start', { kind: 'k', when: () => new Promise(() => {}) });   // its read never answers (counted at the bound)
  const y = r.apply(() => 'PLAN-Y', 'a press', { kind: 'k', when: async () => true, before: async () => { befores++; return {}; } });   // joins it, says yes
  let all = null; const done = Promise.all([inflight, x, y]).then((v) => { all = v; });
  for (let k = 0; k < 100 && !all; k++) { for (const call of st.calls) call.finish(okRun); await new Promise((res) => setTimeout(res, 10)); }   // ≤ 1 s (the bound is 80 ms)
  return { befores, y: all && { ok: all[2].ok, why: all[2].why }, runs: st.calls.map((c) => c.o.envAdd.VIBESPACE_CLI_CONFIG), pending: !!done };
}
{
  const b = await beforeLegs(R);
  ok(!!(b.befores === 0 && b.y && b.y.ok === false && /not run: the home still has not answered an earlier read \(1 still out\)/.test(b.y.why || '') && !b.runs.includes('PLAN-Y')),
    'one joined read ran out of time, another said yes: the job ends at once, by name, and its `before` (a read of the home) is never started', b);
  const bm = await beforeLegs(require(MC.write(RUNNER_REL, anchored(src(RUNNER_REL), BEFORE_GUARD, '', 'no guard after the reads'), 'before-after-stuck')));
  ok(bm.befores === 1, 'RED (no guard after the reads — the second follow\'s form): the `before` read starts while the timed-out read is still out', bm);
}

console.log('①k r2513 (1): A SHORT BOUND REFUSES NO ONE — a reader stops waiting at its own bound; the read counts as out only past the RUN\'s bound');
async function shortBoundLegs(Rm) {
  let stall = true; const rel = [];
  const r = Rm.createCliConfigRunner({ starter: handStarter(), helperPath: '/x/helper.mjs', timeoutMs: 250, journal: () => {}, warn: () => {} });   // the run's bound: 250 ms
  const slowRead = () => (stall ? new Promise((res) => { rel.push(res); }) : Promise.resolve('read'));   // a home that is only SLOW: it answers when released
  const first = await r.homeRead(slowRead, 60);   // a start's short reader: it stops waiting at 60 ms
  stall = false; const second = await r.homeRead(slowRead, 60);   // the next reader, while the first read is out but under the run's bound
  await new Promise((res) => setTimeout(res, 300));   // past the run's bound: the first read now counts as out
  const third = await r.homeRead(slowRead, 60);
  for (const f of rel) f('late'); await tick(); await tick();
  const fourth = await r.homeRead(slowRead, 60);   // the slow home answered: the count is back to zero
  return { first: first.timedOut ? 'timedOut' : first, second: second.value || second, third: third.held ? 'held' : third, fourth: fourth.value || fourth };
}
{
  const k = await shortBoundLegs(R);
  ok(!!(k.first === 'timedOut' && k.second === 'read' && k.third === 'held' && k.fourth === 'read'),
    'a 60 ms reader past ITS bound stops waiting, and the next reader of the home is NOT refused; past the run\'s 250 ms bound it is; the late answer brings the count back to zero', k);
  const km = await shortBoundLegs(require(MC.write(RUNNER_REL, anchored(src(RUNNER_REL), 'return bounded(fn, ms, { countAt: timeoutMs }).then(', 'return bounded(fn, ms).then(', 'counted at the reader\'s own bound'), 'count-at-reader-bound')));   // stale-pins: kept (the RED is the old form on purpose: counted at the reader's own bound)
  ok(km.second && km.second.held === true, 'RED (counted at the reader\'s own bound — the status unit\'s form): a slow home\'s 60 ms reader makes the guard refuse the NEXT reader before the run\'s bound', km);
}

console.log('①l r2592 (2): THE PILE ON A SILENT HOME — one read out per reader class; only the first start waits; another class is never refused before the run\'s bound');
async function pileLegs(Rm) {
  let reads = 0;
  const r = Rm.createCliConfigRunner({ starter: { run: async () => okRun }, helperPath: '/x/helper.mjs', timeoutMs: 250, stat: async () => { throw new Error('none'); }, journal: () => {}, warn: () => {} });   // the run's bound: 250 ms
  const never = () => { reads++; return new Promise(() => {}); };   // a home that never replies, for the statusline class
  const together = await Promise.all([1, 2, 3].map(() => r.homeRead(never, 60, { cls: 'statusline' })));   // three starts at once share ONE read (each waits its bound: timedOut)
  const later = [await r.homeRead(never, 60, { cls: 'statusline' }), await r.homeRead(never, 60, { cls: 'statusline' })];   // two more starts: refused at once (held — no wait), by the work, never a clock
  const status = await r.homeRead(() => new Promise((res) => setTimeout(() => res('the status read'), 40)), 200, { cls: 'hook-status' });   // ANOTHER class, a slow home: it reads
  const job = await r.apply(() => 'PLAN-J', 'boot', { kind: 'apply' });   // the boot's config job, before the run's bound: it runs
  return { together: together.map((x) => (x.timedOut ? 'timedOut' : x.held ? 'held' : 'value')).join(), later: later.map((x) => (x.held ? 'held' : x.timedOut ? 'timedOut' : 'value')).join(), reads, status: status.value || status.why, job: { ok: job.ok, why: job.why } };
}
{
  const pl = await pileLegs(R);
  ok(!!(pl.together === 'timedOut,timedOut,timedOut' && pl.later === 'held,held' && pl.reads === 1 && pl.status === 'the status read' && pl.job.ok === true),
    'on a home that never replies, N starts leave exactly ONE read pending: the first wait their 60 ms together, the later ones are refused at once; the hook status (another class) and the boot\'s job are NOT refused before the run\'s bound', pl);
  const plm = await pileLegs(require(MC.write(RUNNER_REL, anchored(src(RUNNER_REL), '    if (!cls) return bounded(', '    if (true) return bounded(', 'no reader class'), 'no-reader-class')));
  ok(plm.reads === 5 && plm.later === 'timedOut,timedOut', 'RED (no reader class — line 454\'s follow\'s form): every start parks its own read and waits its full bound', plm);
}

console.log('①j r2224 (5): a run whose own look ran out of time says ITS reason to the check, never the guard\'s');
async function ownReasonLegs(Rm) {
  const st = handStarter();
  const r = Rm.createCliConfigRunner({ starter: st, helperPath: '/x/helper.mjs', home: ROOT, timeoutMs: 80, stat: () => new Promise(() => {}), journal: () => {}, warn: () => {} });
  const l = await r.apply(() => planAt('.held'), 'hooks', { kind: 'apply+hooks', after: async () => ({ claude: { ok: true } }) });
  return { ok: l.ok, why: l.why, after: l.after };
}
{
  const o = await ownReasonLegs(R);
  ok(!!(o.ok === false && o.after && o.after.error === o.why && /the plan's files under the home could not be read within 80 ms/.test(o.after.error || '')),
    'the look before the helper ran out of time: the check is told the RUN\'s reason («the plan\'s files … could not be read»), as r1813 asks', o);
  const OWN = ' : landing.why } :';
  const om = await ownReasonLegs(require(MC.write(RUNNER_REL, anchored(src(RUNNER_REL), OWN, ' : `the check of the files was not asked: the home still has not answered an earlier read (${homeStuck} still out)` } :', 'the guard\'s words for a broken run'), 'guard-words')));
  ok(!!(om.after && /the check of the files was not asked/.test(om.after.error || '')), 'RED (the second follow\'s words): the broken run\'s check says «not asked: the home still has not answered» instead of the run\'s reason', om);
}

clearInterval(KEEP);
report();

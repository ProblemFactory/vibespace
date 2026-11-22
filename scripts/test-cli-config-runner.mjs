#!/usr/bin/env node
// test-cli-config-runner — B-ddf3 unit 2, LINE 1 (lane bl-scratch, the coordinator's r1404 / r1407). THE HUB'S OWN MACHINE IS
// WRITTEN BY THE SHIPPED HELPER through the starter (src/server/cli-config-runner.js), never by the hub's own process. FAST,
// in-process; the real helper (data/bin/vibespace-hook-register.mjs, as the generator writes it) runs on a scratch HOME through a
// stand-in starter that starts it with this node, as the starter does.
//   ① ONE APPLY IN FLIGHT, THE NEWEST WAITING: requests made during a run coalesce into the NEXT run, with the newest plan; each
//     resolves at the landing of a run that started after it.             RED: the queue's guard taken out (two runs at once)
//   ② NO SECOND WRITER: a starter that does not answer is a FAILED landing, said by name; the next request asks again.
//   ③ the spawn gate (harness-config-sync startGate, r1407 (a)): landed → null; a run past the bound → late; a failed last
//     landing → asked again, then failed; nothing asked → null.         RED: a gate that never waits
//   ④ THE REAL HELPER on a scratch HOME: our hooks + the managed keys written by ONE run; the file the CLI never wrote is
//     reported created (read off the loop); a second run creates nothing.
//   ⑤ (f) THE ENV: argv is the helper's path only; envAdd holds VIBESPACE_CLI_CONFIG and HOME — nothing else, no secret shape.
//   ⑥ (e) THE HOOK COMMAND REWRITTEN ONCE: a stored command naming another node is rewritten to the stable spelling — and
//     nothing else in the file moves (compared key by key).
//   ⑦ (b) THE SETTINGS ANSWER AT THE LANDING (src/server/landing-answer.js): landed / failed / still writing past the bound /
//     refused, each by name; no landing → the plain answer.             RED: an answer that never waits
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { checker } from './lib/check.mjs';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { ok, report } = checker();
const ROOT = scratch('cli-config-runner');
fs.mkdirSync(ROOT, { recursive: true });
const MC = mutantCopies('cli-config-runner', REPO);
const tick = () => new Promise((r) => setImmediate(r));
const KEEP = setInterval(() => {}, 60000);   // the runner's bound timers are unref'd (a hub's loop is alive anyway): this run's own is not
const RUNNER_REL = 'src/server/cli-config-runner.js', SYNC_REL = 'src/server/harness-config-sync.js', ANSWER_REL = 'src/server/landing-answer.js';
const src = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

// a starter whose runs the suite finishes by hand (the queue's legs), recording every request
function handStarter() {
  const calls = [], live = new Set();
  let most = 0;
  return { calls, most: () => most, run: (cmd, args, o) => new Promise((resolve) => { const c = { cmd, args, o, finish: (r) => { live.delete(c); resolve(r); } }; calls.push(c); live.add(c); most = Math.max(most, live.size); }) };
}
const okRun = { started: true, code: 0, stdout: 'CFG|claude|transcriptRetentionDays|unchanged|%2236500%22|%2236500%22|null\n', stderr: '' };

async function queueLegs(R) {
  const st = handStarter(), r = R.createCliConfigRunner({ starter: st, helperPath: '/x/helper.mjs', stat: async () => { throw new Error('none'); }, journal: () => {}, warn: () => {} });
  const a = r.apply(() => 'PLAN-A', 'a'), b = r.apply(() => 'PLAN-B', 'b'), c = r.apply(() => 'PLAN-C', 'c');
  await tick();
  const first = st.calls.length;
  st.calls[0].finish(okRun); await tick(); await tick();
  const second = st.calls.length, plan2 = st.calls[1] && st.calls[1].o.envAdd.VIBESPACE_CLI_CONFIG;
  // every run started is finished (a red copy starts one per request), and the wait is bounded: a leg never hangs the suite
  for (let k = 0; k < 3; k++) { for (const call of st.calls) call.finish(okRun); await tick(); }
  const all = await Promise.race([Promise.all([a, b, c]), new Promise((r) => setTimeout(() => r(null), 5000))]);
  const [la, lb, lc] = all || [];
  return { first, second, plan2, most: st.most(), same: !!all && lb === lc && la !== lb, settled: !!all };
}

console.log('① one apply in flight, the newest waiting');
const R = require(path.join(REPO, RUNNER_REL));
{
  const q = await queueLegs(R);
  ok(q.first === 1 && q.second === 2 && q.plan2 === 'PLAN-C' && q.most === 1 && q.same, 'three quick requests: ONE run in flight, the two waiting ones coalesce into the next run with the NEWEST plan, never two runs at once', q);
  const M = require(MC.write(RUNNER_REL, anchored(src(RUNNER_REL), '    if (inFlight || !queue.length) return;', '    if (!queue.length) return;', 'two runs at once'), 'two-at-once'));
  const qm = await queueLegs(M);
  ok(qm.most > 1, 'RED (the queue\'s guard taken out): two helper runs at once on one file', qm);
}

console.log('①b r1518 (the full round\'s must): a request is NEVER replaced by one of another kind — each kind asked runs, in order');
// THE TIP's MERGE (c90929dc8): one waiting slot, the newest request's kind written over the waiting one's — rebuilt for the red
const TAIL = '      if (tail && tail.kind === kind) { tail.planOf = planOf; tail.reason = reason; if (before) tail.before = before; if (after) tail.after = after; tail.whens.push(when); tail.resolvers.push(resolve); return; }';
const MERGED = '      if (tail) { tail.kind = kind; tail.uninstall = uninstall; tail.planOf = planOf; tail.reason = reason; if (before) tail.before = before; if (after) tail.after = after; tail.whens.push(when); tail.resolvers.push(resolve); return; }';   // stale-pins: kept (the tip's merge, rebuilt for the red control)
async function kindLegs(Rm) {
  const st = handStarter(), r = Rm.createCliConfigRunner({ starter: st, helperPath: '/x/helper.mjs', stat: async () => { throw new Error('none'); }, journal: () => {}, warn: () => {} });
  const inflight = r.apply(() => 'PLAN-0', 'a save', { kind: 'apply' });
  await tick();
  const strip = r.apply(() => 'PLAN-S', 'hooks removed', { uninstall: true }), save = r.apply(() => 'PLAN-A', 'settings change', { kind: 'apply' });
  for (let k = 0; k < 4; k++) { for (const call of st.calls) call.finish(okRun); await tick(); }
  const all = await Promise.race([Promise.all([inflight, strip, save]), new Promise((res) => setTimeout(() => res(null), 5000))]);
  return { runs: st.calls.map((c) => (c.args.includes('--uninstall') ? 'strip' : 'apply') + ':' + c.o.envAdd.VIBESPACE_CLI_CONFIG), kinds: all ? all.map((l) => l.kind) : null };
}
{
  const k = await kindLegs(R);
  ok(JSON.stringify(k.runs) === JSON.stringify(['apply:PLAN-0', 'strip:PLAN-S', 'apply:PLAN-A']) && JSON.stringify(k.kinds) === JSON.stringify(['apply', 'strip', 'apply']),
    'a removal waiting behind a run, then a save: BOTH run, in the order asked (the strip with --uninstall), and each caller is told by a run of its OWN kind', k);
  const km = await kindLegs(require(MC.write(RUNNER_REL, anchored(src(RUNNER_REL), TAIL, MERGED, 'the tip\'s merge'), 'tip-merge')));
  ok(!km.runs.some((x) => x.startsWith('strip')) && km.kinds && km.kinds[1] === 'apply', 'RED (the tip\'s merge): the removal is REPLACED by the save — no --uninstall run, and the removal\'s caller is told «landed» by a run of another kind', km);
}

console.log('② no second writer: a starter that does not answer is a failed landing, said; asked again next time');
{
  let n = 0;
  const r = R.createCliConfigRunner({ starter: { run: async () => { n++; return { unknown: true, why: 'no starter' }; } }, helperPath: '/x/h.mjs', stat: async () => { throw new Error('none'); }, journal: () => {}, warn: () => {} });
  const l1 = await r.apply(() => 'P', 'boot'), l2 = await r.apply(() => 'P', 'again');
  ok(!l1.ok && /the starter did not answer/.test(l1.why) && /nothing was written by this hub/.test(l1.why) && n === 2 && !l2.ok, 'the landing FAILS by name («the starter did not answer … nothing was written by this hub»), and the next request asks the starter again', { l1, n });
  const code = (rel) => src(rel).replace(/\/\/[^\n]*/g, ''), APPLIER = /\b(?:applyConfigPlan|writeJsonManaged|writeTomlManaged|ensureCliConfig)\b/;   // the code, its comments set aside
  ok(!APPLIER.test(code(RUNNER_REL)) && !APPLIER.test(code(SYNC_REL)), 'there is no in-process writer to fall back to: neither the runner nor harness-config-sync calls the applier');
}

console.log('③ the spawn gate (r1407 (a)): it waits within the bound, then the start goes on and says it');
async function gateLegs(Sync) {
  const out = {};
  const mk = (starter) => Sync.create({ serverSetting: () => undefined, harnesses: require(path.join(REPO, 'src/harnesses/index.js')), adapterRegistry: { get: () => null }, activeSessions: new Map(), hookRegistrationSafe: () => true, runner: R.createCliConfigRunner({ starter, helperPath: '/x/h.mjs', boundMs: 60, stat: async () => { throw new Error('none'); }, journal: () => {}, warn: () => {} }), log: () => {}, warn: () => {} });
  out.nothingAsked = await mk({ run: async () => okRun }).startGate();
  { const s = mk({ run: async () => okRun }); s.syncCliConfig({ reason: 'boot' }); out.landed = await s.startGate(); }
  { const s = mk({ run: () => new Promise(() => {}) }); s.syncCliConfig({ reason: 'boot' }); out.late = await s.startGate(); }
  { let n = 0; const s = mk({ run: async () => { n++; return { started: true, code: 1, stdout: '', stderr: 'EIO' }; } }); await s.syncCliConfig({ reason: 'boot' }); out.failed = await s.startGate(); out.asked = n; }
  return out;
}
{
  const Sync = require(path.join(REPO, SYNC_REL));
  const g = await gateLegs(Sync);
  ok(g.nothingAsked === null && g.landed === null, 'landed → the start goes on (null); nothing asked (a refused or skipped server) → no wait (null)', g);
  ok(!!g.late && g.late.late === true && /did not land within 60 ms/.test(g.late.why), 'a run past the bound → the start is told «late» at the bound, never refused', g);
  ok(!!g.failed && g.failed.failed === true && /exited 1/.test(g.failed.why) && g.asked === 2, 'a FAILED last landing is asked again by the start, and said failed by name', g);
  const M = require(MC.write(SYNC_REL, anchored(src(SYNC_REL), 'return cliRunner.landedWithin(cliRunner.BOUND_MS).then((g) => (g.landed ? null : g));', 'return Promise.resolve(null);', 'a gate that never waits'), 'no-wait'));
  const gm = await gateLegs(M);
  ok(gm.late === null, 'RED (a gate that never waits): the late start is never told', gm);
  const wc = src('src/ws-create.js'), sfw = src('src/settings-file-words.js');
  const gateAt = wc.indexOf('const cliLate = '), buildAt = wc.indexOf('const sessionSpec = adapter.buildSessionArgs({');
  ok(gateAt > 0 && gateAt < buildAt && /await Promise\.resolve\(cliConfigGate\(\)\)/.test(wc) && /serverNotice\?\.\(`cli-config-late-\$\{id\}`, w\.replace/.test(wc) && /CLI_CONFIG_LATE_WORDS/.test(wc),
    'WIRING: a local start awaits the gate BEFORE its args are built, and a late / failed gate is said once, by name (cli-config-late-<id>)');
  const words = require(path.join(REPO, 'src/settings-file-words.js')).CLI_CONFIG_LATE_WORDS;
  ok(/\{name\}/.test(words) && /\{why\}/.test(words) && src('src/lib/i18n-zh.js').includes(JSON.stringify(words)) && src('src/lib/i18n-ja.js').includes(JSON.stringify(words)) && sfw.includes('CLI_CONFIG_LATE_WORDS'), 'the words name the conversation and the why, in zh and ja');
}

console.log('①c r1675: a request\'s own check of the files runs INSIDE its job — before the next queued request starts');
async function afterLegs(Rm) {
  const order = [], st = handStarter(), r = Rm.createCliConfigRunner({ starter: { run: (cmd, args, o) => { order.push('run ' + o.envAdd.VIBESPACE_CLI_CONFIG); return st.run(cmd, args, o); } }, helperPath: '/x/helper.mjs', stat: async () => { throw new Error('none'); }, journal: () => {}, warn: () => {} });
  const first = r.apply(() => 'PLAN-0', 'a save', { kind: 'apply' });
  await tick();
  const strip = r.apply(() => 'PLAN-S', 'hooks removed', { uninstall: true, after: async () => { await tick(); await tick(); order.push('check of PLAN-S'); return ['read'] } });
  const reg = r.apply(() => 'PLAN-R', 'hooks (asked)', { kind: 'apply+hooks' });
  for (let k = 0; k < 8; k++) { for (const call of st.calls) call.finish(okRun); await tick(); }
  const all = await Promise.race([Promise.all([first, strip, reg]), new Promise((res) => setTimeout(() => res(null), 5000))]);
  return { order, after: all && all[1].after };
}
{
  const a = await afterLegs(R);
  ok(a.order.indexOf('check of PLAN-S') >= 0 && a.order.indexOf('check of PLAN-S') < a.order.indexOf('run PLAN-R') && JSON.stringify(a.after) === '["read"]',
    'Remove then Install inside one run: the removal\'s check reads the files BEFORE the registration\'s helper starts, its answer on its own landing', a);
  const AFTER = '        const a = homeStuck > 0 ? { held: true } : await bounded(() => job.after(landing));';
  const am = await afterLegs(require(MC.write(RUNNER_REL, anchored(src(RUNNER_REL), AFTER, '        inFlight = null; pump(); const a = homeStuck > 0 ? { held: true } : await bounded(() => job.after(landing));', 'the check after the queue moved on'), 'after-late')));
  ok(am.order.indexOf('run PLAN-R') >= 0 && am.order.indexOf('run PLAN-R') < am.order.indexOf('check of PLAN-S'), 'RED (the check after the queue moved on — the cure\'s form): the registration\'s helper runs BEFORE the removal\'s check reads the files', am);
}

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
const HCJ = require(path.join(REPO, 'src/harness-config.js'));
const planAt = (dir) => HCJ.encodePlan({ v: 1, files: [{ harness: 'claude', id: 'settings', rel: [dir, 'settings.json'], format: 'json', set: [] }] });
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

console.log('④⑤⑥ the REAL helper on a scratch HOME — one run, created read off the loop, the env, the hook command key by key');
{
  const home = path.join(ROOT, 'home'); fs.mkdirSync(path.join(home, '.claude', 'projects'), { recursive: true });
  const genRoot = path.join(ROOT, 'gen'); fs.mkdirSync(path.join(genRoot, 'data'), { recursive: true });
  const HOME0 = process.env.HOME; process.env.HOME = home;
  try {
    let SYNC = null;
    const GEN = require(path.join(REPO, 'src/server/agent-tool-generators.js')).create({ rootDir: genRoot, port: 0, applyThisMachine: (o) => SYNC.applyThisMachine(o), homeRead: (fn) => SYNC.homeRead(fn) });
    const asked = [];
    const starter = { run: (cmd, args, o = {}) => new Promise((resolve) => { asked.push({ cmd, args, envAdd: { ...(o.envAdd || {}) } }); let out = '', err = ''; const c = spawn(cmd, args, { env: { ...process.env, ...(o.envAdd || {}) }, stdio: ['ignore', 'pipe', 'pipe'] }); c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; }); c.on('close', (code) => resolve({ started: true, code, stdout: out, stderr: err })); }) };
    SYNC = require(path.join(REPO, SYNC_REL)).create({ serverSetting: () => undefined, harnesses: require(path.join(REPO, 'src/harnesses/index.js')), adapterRegistry: { get: () => null }, activeSessions: new Map(), hookRegistrationSafe: () => true, home, helperPath: path.join(genRoot, 'data', 'bin', 'vibespace-hook-register.mjs'), starter, hooksWanted: () => true, log: () => {}, warn: () => {} });
    const l1 = await SYNC.applyThisMachine({ reason: 'boot' });
    const sf = path.join(home, '.claude', 'settings.json'), j = JSON.parse(fs.readFileSync(sf, 'utf8'));
    const HC = require(path.join(REPO, 'src/harness-config.js')), stable = `${JSON.stringify(HC.stableNodePath(process.execPath))} ${GEN.HOOK_CMD}`;
    const cmdOf = (root, ev) => root.hooks && root.hooks[ev] && root.hooks[ev][0] && root.hooks[ev][0].hooks[0].command;
    ok(l1.ok && j.cleanupPeriodDays === 36500 && ['SessionStart', 'UserPromptSubmit', 'Stop'].every((ev) => cmdOf(j, ev) === stable) && l1.created.some((c) => c.rel === '.claude/settings.json'),
      'ONE helper run wrote our hooks (the stable spelling) AND the managed key; the file the CLI never wrote is reported created', { l1, j });
    const l2 = await SYNC.applyThisMachine({ reason: 'again' });
    ok(l2.ok && l2.created.length === 0, 'a second run creates nothing', l2);
    ok(asked.length === 2 && asked.every((x) => x.cmd === process.execPath && x.args.length === 1 && x.args[0].endsWith('vibespace-hook-register.mjs') && JSON.stringify(Object.keys(x.envAdd).sort()) === JSON.stringify(['HOME', 'VIBESPACE_CLI_CONFIG'])),
      '(f) argv is the helper\'s path alone; the request adds VIBESPACE_CLI_CONFIG and HOME, nothing else (the starter\'s service env below them)', asked.map((x) => ({ args: x.args, env: Object.keys(x.envAdd) })));
    // (e) the hook command rewritten ONCE, nothing else moving
    const planted = { ...j, model: 'opus', permissions: { allow: ['Bash(ls:*)'] } };
    for (const ev of ['SessionStart', 'UserPromptSubmit', 'Stop']) planted.hooks[ev][0].hooks[0].command = `"/opt/old-node/bin/node" ${GEN.HOOK_CMD}`;
    fs.writeFileSync(sf, JSON.stringify(planted, null, 2) + '\n');
    // through the generator the boot runs (its refusals lifted as test-claude-retention §7 does), the journal read
    const said = [], log0 = console.log;
    const hooks = async () => { process.env.VIBESPACE_FORCE_AGENT_HOOKS = '1'; console.log = (...a) => { said.push(a.join(' ')); }; try { return await GEN.ensureAgentHooks({ auto: true }); } finally { console.log = log0; delete process.env.VIBESPACE_FORCE_AGENT_HOOKS; } };
    const rh = await hooks();
    const after = JSON.parse(fs.readFileSync(sf, 'utf8'));
    const flat = (o, p = '', out = {}) => { if (o && typeof o === 'object') { for (const k of Object.keys(o)) flat(o[k], p ? `${p}.${k}` : k, out); } else out[p] = o; return out; };
    const fb = flat(planted), fa = flat(after), moved = [...new Set([...Object.keys(fb), ...Object.keys(fa)])].filter((k) => fb[k] !== fa[k]);
    ok(rh.claude && rh.claude.ok === true && moved.length === 3 && moved.every((k) => /^hooks\.(SessionStart|UserPromptSubmit|Stop)\.0\.hooks\.0\.command$/.test(k) && fa[k] === stable),
      '(e) a stored command naming another node is rewritten to the stable spelling — the three hook commands only; every other key of the file as it was', { moved, rh });
    const line = `Hook command rewritten in ~/.claude/settings.json (SessionStart, UserPromptSubmit, Stop): "/opt/old-node/bin/node" ${GEN.HOOK_CMD} → ${stable} — the stable spelling, once; only those entries' "command" changed, nothing else in the file`;
    ok(said.filter((l) => l.startsWith('Hook command rewritten')).length === 1 && said.includes(line), '(e) …journalled by name: the file, the entries, the spelling before and after, and that nothing else moved', said);
    said.length = 0;
    const rh2 = await hooks();
    ok(rh2.claude && rh2.claude.ok === true && !said.some((l) => l.startsWith('Hook command rewritten')), '(e) …ONCE: the next registration finds the stable spelling and rewrites nothing', said);
    // (d) the six-hourly check reads the status and starts a run only when it reads stale or not installed: a spelling the
    // applier KEEPS (the same node, one real file — keepsHookCommand) reads installed, and a registration over it leaves it
    const link = path.join(ROOT, 'node-link'); fs.symlinkSync(process.execPath, link);
    const keptCmd = `${JSON.stringify(link)} ${GEN.HOOK_CMD}`, k = JSON.parse(fs.readFileSync(sf, 'utf8'));
    for (const ev of ['SessionStart', 'UserPromptSubmit', 'Stop']) k.hooks[ev][0].hooks[0].command = keptCmd;
    fs.writeFileSync(sf, JSON.stringify(k, null, 2) + '\n');
    const stK = (await GEN.agentHooksStatus()).claude;
    said.length = 0;
    const rk = await hooks();
    const kAfter = JSON.parse(fs.readFileSync(sf, 'utf8'));
    ok(stK.installed === true && stK.stale === false && rk.claude && rk.claude.ok === true && ['SessionStart', 'UserPromptSubmit', 'Stop'].every((ev) => cmdOf(kAfter, ev) === keptCmd) && !said.some((l) => l.startsWith('Hook command rewritten')),
      '(d) a kept spelling reads installed (the check starts nothing for it), and a registration over it keeps it, rewrites nothing and reads ok', { stK, rk, said });
    const GENM = require(MC.write('src/server/agent-tool-generators.js', anchored(src('src/server/agent-tool-generators.js'), '  const sameRunner = (c) => c === hookCmd || keepsHookCommand(c, hookCmd);', '  const sameRunner = (c) => c === hookCmd;', 'a plain string compare'), 'plain-compare')).create({ rootDir: genRoot, port: 0, applyThisMachine: (o) => SYNC.applyThisMachine(o), homeRead: (fn) => SYNC.homeRead(fn) });
    const stKm = (await GENM.agentHooksStatus()).claude;
    ok(stKm.installed === false && stKm.stale === true, 'RED (a plain string compare): the kept spelling reads stale — the six-hourly check would start a run for it every time', stKm);
    // THE REMOVAL (the Integration switch off, «Remove hooks»): the helper's --uninstall strips ONLY our entries, never a managed key
    const HC2 = require(path.join(REPO, 'src/harness-config.js'));
    const oursIn = (root) => Object.values((root && root.hooks) || {}).some((gs) => (gs || []).some((g) => (g.hooks || []).some((h) => String(h && h.command).includes(HC2.HOOK_MARKER))));
    const notHooks = (root) => Object.fromEntries(Object.entries(flat(root)).filter(([key]) => !key.startsWith('hooks.')));
    const stripLeg = async (S) => {
      await SYNC.applyThisMachine({ reason: 'boot' });   // our entries in place first (the real road)
      const was = JSON.parse(fs.readFileSync(sf, 'utf8'));
      const l = await S.applyThisMachine({ reason: 'hooks removed', strip: true });
      const now = JSON.parse(fs.readFileSync(sf, 'utf8'));
      return { ok: l.ok, had: oursIn(was), left: oursIn(now), others: JSON.stringify(notHooks(was)) === JSON.stringify(notHooks(now)) };
    };
    const sl = await stripLeg(SYNC);
    ok(sl.ok && sl.had && !sl.left && sl.others, 'the REMOVAL through the helper (--uninstall): our entries gone, every other key of the file as it was (the managed key included)', sl);
    const SM = require(MC.write(SYNC_REL, anchored(src(SYNC_REL), 'planFor({ hooks: strip ? true : hooks })', 'planFor({ hooks: strip ? false : hooks })', 'a strip plan without its hook rows'), 'strip-no-hooks'));   // stale-pins: kept (the line's first build, rebuilt for the red control)
    const mkS = (M) => M.create({ serverSetting: () => undefined, harnesses: require(path.join(REPO, 'src/harnesses/index.js')), adapterRegistry: { get: () => null }, activeSessions: new Map(), hookRegistrationSafe: () => true, home, helperPath: path.join(genRoot, 'data', 'bin', 'vibespace-hook-register.mjs'), starter, hooksWanted: () => true, log: () => {}, warn: () => {} });
    const slm = await stripLeg(mkS(SM));
    ok(slm.had && slm.left, 'RED (a strip plan without its hook rows — this line\'s first build): the removal «lands» and strips nothing', slm);
    // r1518's must on the REAL files: a removal queued behind a run in flight, then a save that moves a managed key — BOTH land
    const store = {}; let hold = null;
    const holdStarter = { run: (cmd, args, o) => (hold ? hold.then(() => starter.run(cmd, args, o)) : starter.run(cmd, args, o)) };
    const mkK = (runner) => require(path.join(REPO, SYNC_REL)).create({ serverSetting: (k) => store[k], harnesses: require(path.join(REPO, 'src/harnesses/index.js')), adapterRegistry: { get: () => null }, activeSessions: new Map(), hookRegistrationSafe: () => true, home, helperPath: path.join(genRoot, 'data', 'bin', 'vibespace-hook-register.mjs'), starter: holdStarter, hooksWanted: () => false, runner, log: () => {}, warn: () => {} });
    const both = async (S) => {
      delete store['claude.transcriptRetentionDays'];
      await SYNC.applyThisMachine({ reason: 'boot', hooks: true });   // our entries and the managed key in place (the real road)
      let release; hold = new Promise((r) => { release = r; });
      const first = S.applyThisMachine({ reason: 'a save in flight' });
      await tick();
      const strip = S.applyThisMachine({ reason: 'hooks removed', strip: true });
      store['claude.transcriptRetentionDays'] = 365;
      const save = S.applyThisMachine({ reason: 'settings change' });
      hold = null; release();
      const ls = await Promise.all([first, strip, save]);
      const now = JSON.parse(fs.readFileSync(sf, 'utf8'));
      return { hooksLeft: oursIn(now), days: now.cleanupPeriodDays, kinds: ls.map((l) => l.kind) };
    };
    const bk = await both(mkK(null));
    ok(!bk.hooksLeft && bk.days === 365 && JSON.stringify(bk.kinds) === JSON.stringify(['apply', 'strip', 'apply']), 'r1518: a removal queued behind a run, then a save: our hook entries are GONE and the saved key is written (365) — both effects on the real files', bk);
    const MR = require(MC.write(RUNNER_REL, anchored(src(RUNNER_REL), TAIL, MERGED, 'the tip\'s merge'), 'tip-merge-real'));
    const bkm = await both(mkK(MR.createCliConfigRunner({ starter: holdStarter, helperPath: path.join(genRoot, 'data', 'bin', 'vibespace-hook-register.mjs'), home, journal: () => {}, warn: () => {} })));
    ok(bkm.hooksLeft && bkm.days === 365, 'RED (the tip\'s merge): the removal is replaced by the save — our hook entries STAY in the person\'s file, and its caller was told «landed»', bkm);
    // ON then OFF at once: the registration is queued at its call, so the removal asked after it runs after it (the hooks end removed)
    const genSay = [], warn0 = console.warn, log0b = console.log;
    process.env.VIBESPACE_FORCE_AGENT_HOOKS = '1'; console.warn = (...a) => { genSay.push(a.join(' ')); }; console.log = (...a) => { genSay.push(a.join(' ')); };
    try {
      const [reg, rm] = await Promise.all([GEN.ensureAgentHooks({ auto: true }), GEN.stripAgentHookEntries()]);
      ok(!!reg.claude && rm && rm.ok === true && !oursIn(JSON.parse(fs.readFileSync(sf, 'utf8'))), 'ON then OFF at once: the registration runs first, the removal after it — our entries end REMOVED (never registered with the switch off)', { reg: reg.claude, rm: rm && rm.ok });
      // a removal's OUTCOME is read on the files before «removed» is said: an unreadable file is a removal that did not land
      await SYNC.applyThisMachine({ reason: 'boot', hooks: true });
      const good = fs.readFileSync(sf, 'utf8');
      fs.writeFileSync(sf, good.slice(0, -3));   // torn: not valid JSON (the CAS writer refuses it, our entries stay in it)
      genSay.length = 0;
      const bad = await GEN.stripAgentHookEntries();
      ok(bad && bad.ok === false && /~\/\.claude\/settings\.json is not valid JSON — not touched/.test(bad.why || '') && genSay.some((l) => /\[hooks\] the removal did not land: /.test(l)) && !genSay.some((l) => /Removed VibeSpace hooks/.test(l)),
        'r1518: a removal the files did not take (a torn ~/.claude/settings.json) is said NOT landed, by name — never «Removed VibeSpace hooks»', { bad, genSay });
      fs.writeFileSync(sf, good);
      // r1675 (1) on the real files: Remove, then Install, both inside one helper run in flight — each answer is about ITS run
      const SK = mkK(null), GENK = require(path.join(REPO, 'src/server/agent-tool-generators.js')).create({ rootDir: genRoot, port: 0, applyThisMachine: (o) => SK.applyThisMachine(o) });
      let releaseK; hold = new Promise((r) => { releaseK = r; });
      const inflight = SK.applyThisMachine({ reason: 'a save in flight' });
      await tick();
      const rmK = GENK.stripAgentHookEntries(), regK = GENK.ensureAgentHooks({ auto: false });
      hold = null; releaseK();
      const [, rmA, regA] = await Promise.all([inflight, rmK, regK]);
      ok(rmA && rmA.ok === true && regA.claude && regA.claude.ok === true && oursIn(JSON.parse(fs.readFileSync(sf, 'utf8'))),
        'r1675: Remove then Install inside one run — the removal is answered «removed» (its check read its own run\'s files) and the registration «ok»; the rows end there (the last request)', { rm: rmA && { ok: rmA.ok, why: rmA.why }, reg: regA.claude });
      // r1675 (2): at a start, the opt-out mark present AND our rows found (a removal the hub's stop lost) queues ONE removal
      const optLegs = async (G) => {
        await SYNC.applyThisMachine({ reason: 'boot', hooks: true });
        fs.writeFileSync(G.HOOK_OPTOUT_FILE, new Date().toISOString() + '\n');
        const r = await G.ensureAgentHooks({ auto: true });
        const left = oursIn(JSON.parse(fs.readFileSync(sf, 'utf8')));
        fs.rmSync(G.HOOK_OPTOUT_FILE, { force: true });
        return { r: r && { optedOut: r.optedOut, removed: r.removed && r.removed.ok }, left };
      };
      const op = await optLegs(GEN);
      ok(op.r.optedOut === true && op.r.removed === true && !op.left, 'r1675: a start with the opt-out mark and our rows still in the file queues ONE removal — the rows are gone', op);
      const OPT_NOW = /  if \(auto && fs\.existsSync\(HOOK_OPTOUT_FILE\)\) return \(typeof homeRead[^\n]*/;
      const GENO = require(MC.write('src/server/agent-tool-generators.js', anchored(src('src/server/agent-tool-generators.js'), OPT_NOW, '  if (auto && fs.existsSync(HOOK_OPTOUT_FILE)) return Promise.resolve({ optedOut: true });', 'the cure\'s early return'), 'opt-out-early')).create({ rootDir: genRoot, port: 0, applyThisMachine: (o) => SYNC.applyThisMachine(o), homeRead: (fn) => SYNC.homeRead(fn) });   // stale-pins: kept (the cure's line, rebuilt for the red control)
      const opm = await optLegs(GENO);
      ok(opm.r.optedOut === true && !opm.r.removed && opm.left, 'RED (the cure\'s early return): opted out, nothing removed — our rows stay in the person\'s file', opm);
      // r2224 (1): that look at our rows is a read under the home made OUTSIDE a job — it goes through the runner's guard: while an
      // earlier read of the home is out it reads NOTHING, queues no removal and says why (the hook-root watch asks it at every backoff)
      const heldOptLegs = async (GM) => {
        await SYNC.applyThisMachine({ reason: 'boot', hooks: true });   // our rows in the file
        const RH = R.createCliConfigRunner({ starter: handStarter(), helperPath: '/x/helper.mjs', home: ROOT, timeoutMs: 80, stat: () => new Promise(() => {}), journal: () => {}, warn: () => {} });
        await RH.apply(() => planAt('.held'), 'a save', { kind: 'apply' });   // a home that never answers: one read out
        const queued = [];
        const G = GM.create({ rootDir: genRoot, port: 0, applyThisMachine: (o) => { queued.push(o.reason); return SYNC.applyThisMachine(o); }, homeRead: (fn) => RH.homeRead(fn) });
        fs.writeFileSync(G.HOOK_OPTOUT_FILE, new Date().toISOString() + '\n');
        const rf0 = fs.promises.readFile; let reads = 0;
        fs.promises.readFile = (f, ...a) => { if (String(f).startsWith(home)) reads++; return rf0.call(fs.promises, f, ...a); };
        let r = null; try { r = await G.ensureAgentHooks({ auto: true }); } finally { fs.promises.readFile = rf0; }
        const left = oursIn(JSON.parse(fs.readFileSync(sf, 'utf8')));
        fs.rmSync(G.HOOK_OPTOUT_FILE, { force: true });
        return { r: r && { optedOut: r.optedOut, error: r.error || null, removed: !!r.removed }, reads, queued, left };
      };
      const ho = await heldOptLegs(require(path.join(REPO, 'src/server/agent-tool-generators.js')));
      ok(!!(ho.r && ho.r.optedOut === true && !ho.r.removed && /our hook entries on disk were not read \(the home still has not answered an earlier read \(1 still out\)\)/.test(ho.r.error || '') && ho.reads === 0 && !ho.queued.length),
        'r2224 (1): opted out while an earlier read of the home is out — the start reads NOTHING under the home, queues no removal, and says why by name', ho);
      const GENU = require(MC.write('src/server/agent-tool-generators.js', anchored(src('src/server/agent-tool-generators.js'), "typeof homeRead === 'function' ? homeRead(ourRowsOnDisk) : ", '', 'the read outside the guard'), 'opt-out-unguarded'));
      const hom = await heldOptLegs(GENU);
      ok(hom.reads > 0, 'RED (the read outside the guard — the second follow\'s form): the opted-out start reads the hook files into the held home', hom);
      ok(src('server.js').includes('homeRead: (fn, ms) => harnessConfig.homeRead(fn, ms)') && src(SYNC_REL).includes('function homeRead(fn, ms) { return cliRunner ? cliRunner.homeRead(fn, ms)'),
        'WIRING (r2224 (1)): the hub hands the generators the runner\'s guarded read (server.js → harness-config-sync → the runner), with the reader\'s own bound (r2345)');
      // r2345 (THE ROW's OWN HARM): the hook STATUS (the six-hourly check, the hooks routes, the Apply answer) is read OFF THE LOOP,
      // through the runner's guard and within its own bound — a home that stops answering is said «not read», never waited on
      const statusLegs = async (GM) => {
        await SYNC.applyThisMachine({ reason: 'boot', hooks: true });   // our rows in the file: a status that reads them says installed
        const asked = [];
        const RS = R.createCliConfigRunner({ starter: handStarter(), helperPath: '/x/helper.mjs', timeoutMs: 80, stat: async () => { throw new Error('none'); }, journal: () => {}, warn: () => {} });
        const G = GM.create({ rootDir: genRoot, port: 0, applyThisMachine: (o) => SYNC.applyThisMachine(o), homeRead: (fn, ms) => { asked.push(ms); return RS.homeRead(fn, 80); } });   // the stand-in bound: 80 ms
        const live = await G.agentHooksStatus();
        const rf0 = fs.promises.readFile, rs0 = fs.readFileSync, ex0 = fs.existsSync; let reads = 0, syncReads = 0;
        fs.promises.readFile = (f, ...a) => (String(f).startsWith(home) ? (reads++, new Promise(() => {})) : rf0.call(fs.promises, f, ...a));   // the home stops answering
        fs.readFileSync = (f, ...a) => { if (String(f).startsWith(home)) syncReads++; return rs0.call(fs, f, ...a); };
        fs.existsSync = (f) => { if (String(f).startsWith(home)) syncReads++; return ex0.call(fs, f); };
        let hung = null, next = null, readsAfterFirst = 0; const t0 = Date.now();
        try {
          hung = await Promise.race([G.agentHooksStatus(), new Promise((res) => setTimeout(() => res(null), 400))]);   // 5× the stand-in bound
          readsAfterFirst = reads;
          next = hung && await Promise.race([G.agentHooksStatus(), new Promise((res) => setTimeout(() => res(null), 400))]);   // asked again while that read is out
        } finally { fs.promises.readFile = rf0; fs.readFileSync = rs0; fs.existsSync = ex0; }
        return { live: live.claude && { installed: live.claude.installed, fileExists: live.claude.fileExists }, hung: hung && hung.claude, ms: Date.now() - t0, next: next && next.claude, reads, readsAfterFirst, syncReads, asked: [...new Set(asked)] };
      };
      const sl = await statusLegs(require(path.join(REPO, 'src/server/agent-tool-generators.js')));
      ok(!!(sl.live && sl.live.installed === true && sl.hung && /the home did not answer within 80 ms/.test(sl.hung.unread || '') && sl.hung.fileExists === null && sl.hung.installed === null
          && sl.next && /the home still has not answered an earlier read \(1 still out\)/.test(sl.next.unread || '') && sl.reads === sl.readsAfterFirst && sl.syncReads === 0 && sl.asked.join() === '10000'),
        'r2345: the hook status reads the home OFF the loop through the guard, within its own bound (10 s, asked by name): a home that stops answering is «not read» at the bound — no fact claimed (fileExists / installed null) — and the next ask is refused at once with no new read', sl);
      const GNG = require(MC.write('src/server/agent-tool-generators.js', anchored(src('src/server/agent-tool-generators.js'), "typeof homeRead === 'function' ? await homeRead(hookFileFacts, STATUS_READ_MS) : ", '', 'the status read outside the guard'), 'status-unguarded'));
      const slg = await statusLegs(GNG);
      ok(!slg.hung, 'RED (the status read outside the guard): a home that stops answering holds the page — no answer within 400 ms (5× the bound)', slg);
      const GSY = require(MC.write('src/server/agent-tool-generators.js', anchored(src('src/server/agent-tool-generators.js'), "try { text = await fs.promises.readFile(file, 'utf-8'); }", "try { text = fs.readFileSync(file, 'utf-8'); }", 'the release\'s synchronous read'), 'status-sync'));
      const sls = await statusLegs(GSY);
      ok(sls.syncReads > 0, 'RED (the release\'s synchronous read of the hook file): the status reads the home ON the hub\'s loop', sls);
      const SJ2 = src('server.js'), HL2 = src('src/server/hooks-late.js'), hc2 = SJ2.slice(SJ2.indexOf('async function checkAgentHookHealth()'), SJ2.indexOf('async function checkAgentHookHealth()') + 2400);
      const calls2 = (t) => [(t.match(/agentHooksStatus\(\)/g) || []).length, (t.match(/await agentHooksStatus\(\)/g) || []).length];
      ok(SJ2.includes('async function checkAgentHookHealth()') && hc2.indexOf('const st = await agentHooksStatus();') > 0 && hc2.indexOf('if (!info.fileExists || info.parseError) continue;') > hc2.indexOf('const st = await agentHooksStatus();')
          && hc2.indexOf('if (!info.fileExists || info.parseError) continue;') < hc2.indexOf('ensureAgentHooks({ auto: true })') && calls2(SJ2)[0] === calls2(SJ2)[1] && calls2(HL2)[0] === calls2(HL2)[1] && calls2(SJ2)[0] >= 4,
        'WIRING (r2345): the six-hourly check awaits the status and skips an entry whose file is not known to exist (an unread one) before any repair; every status call of server.js and the Apply route is awaited', { server: calls2(SJ2), applyRoute: calls2(HL2) });
      const ma2 = src('src/lib/manage-agents.js');
      ok(ma2.indexOf('if (st.unread) return') > 0 && ma2.indexOf('if (st.unread) return') < ma2.indexOf('if (st.stale) return') && src('src/lib/i18n-zh.js').includes('"{label}: not read — {why}"') && src('src/lib/i18n-ja.js').includes('"{label}: not read — {why}"'),
        'WIRING (r2345): Manage agents says an unread hook file by name, with its reason (zh, ja), before any other verdict of that file');
      // r2345 (b): the person's OWN statusLine, read at each local terminal start — off the loop, through the guard, within 2 s
      const slineLegs = async (GM) => {
        const sfl = path.join(home, '.claude', 'settings.json'), j0 = fs.readFileSync(sfl, 'utf8'), jl = JSON.parse(j0);
        jl.statusLine = { type: 'command', command: 'my-own-statusline --flag' }; fs.writeFileSync(sfl, JSON.stringify(jl, null, 2) + '\n');
        const asked = [];
        const RS = R.createCliConfigRunner({ starter: handStarter(), helperPath: '/x/helper.mjs', timeoutMs: 80, stat: async () => { throw new Error('none'); }, journal: () => {}, warn: () => {} });
        const G = GM.create({ rootDir: genRoot, port: 0, homeRead: (fn, ms) => { asked.push(ms); return RS.homeRead(fn, 80); } });   // the stand-in bound: 80 ms
        const rf0 = fs.promises.readFile, rs0 = fs.readFileSync; let reads = 0, syncReads = 0, readsAfterFirst = 0, live = null, hung = null, next = null;
        const within = (p) => Promise.race([p, new Promise((res) => setTimeout(() => res('NO ANSWER'), 400))]);   // 5× the stand-in bound
        try {
          live = await within(G.userStatuslineCmd());
          fs.promises.readFile = (f, ...a) => (String(f).startsWith(home) ? (reads++, new Promise(() => {})) : rf0.call(fs.promises, f, ...a));   // the home stops answering
          fs.readFileSync = (f, ...a) => { if (String(f).startsWith(home)) syncReads++; return rs0.call(fs, f, ...a); };
          hung = await within(G.userStatuslineCmd());
          readsAfterFirst = reads;
          next = await within(G.userStatuslineCmd());   // the next start, while that read is out
        } finally { fs.promises.readFile = rf0; fs.readFileSync = rs0; fs.writeFileSync(sfl, j0); }
        return { live, hung, next, reads, readsAfterFirst, syncReads, asked: [...new Set(asked)] };
      };
      const sll = await slineLegs(require(path.join(REPO, 'src/server/agent-tool-generators.js')));
      ok(!!(sll.live === 'my-own-statusline --flag' && sll.hung === '' && sll.next === '' && sll.reads === sll.readsAfterFirst && sll.syncReads === 0 && sll.asked.join() === '2000'),
        'r2345 (b): the person\'s own statusLine is read off the loop through the guard, within 2 s (asked by name): passed through when the home answers; a home that stops answering passes none through at the bound, and the next start asks nothing (refused at once)', sll);
      const GSU = require(MC.write('src/server/agent-tool-generators.js', anchored(src('src/server/agent-tool-generators.js'), "typeof homeRead === 'function' ? await homeRead(read, STATUSLINE_READ_MS) : ", '', 'the statusline read outside the guard'), 'sline-unguarded'));
      const slu = await slineLegs(GSU);
      ok(slu.hung === 'NO ANSWER', 'RED (the statusline read outside the guard): a home that stops answering holds the terminal\'s start — no answer within 400 ms (5× the bound)', slu);
      const GSS = require(MC.write('src/server/agent-tool-generators.js', anchored(src('src/server/agent-tool-generators.js'), "const read = () => fs.promises.readFile(path.join(os.homedir(), '.claude', 'settings.json'), 'utf-8');", "const read = async () => fs.readFileSync(path.join(os.homedir(), '.claude', 'settings.json'), 'utf-8');", 'the release\'s synchronous read'), 'sline-sync'));
      const sls2 = await slineLegs(GSS);
      ok(sls2.syncReads > 0, 'RED (the release\'s synchronous read): each terminal start reads the person\'s home ON the hub\'s loop', sls2);
      const LOC = src('src/spawn/local.js');
      ok(LOC.includes("const orig = (userStatuslineCmd && await userStatuslineCmd({ unread: (why) => {") && /ctx\.serverNotice\?\.\('statusline-unread', W\.replace\('\{why\}', \(\) => why\), \{ level: 1, i18n: \{ key: W, params: \{ why \} \} \}\)/.test(LOC) && /STATUSLINE_UNREAD_WORDS/.test(LOC),
        'WIRING (r2345 (b) + r2513 (2)): the local terminal start awaits the statusline read, and a start without the person\'s statusLine says so by a notice (statusline-unread), with why');
      const SUW = require(path.join(REPO, 'src/settings-file-words.js')).STATUSLINE_UNREAD_WORDS;
      ok(/\{why\}/.test(SUW) && /next start reads your statusLine again/.test(SUW) && src('src/lib/i18n-zh.js').includes(JSON.stringify(SUW)) && src('src/lib/i18n-ja.js').includes(JSON.stringify(SUW)),
        'r2513 (2): the words say why and that the next start reads it again, in zh and ja');
      // r2513 (3): THE LEGS THE ROUND ASKED FOR, on the two new readers — the count back to zero after a LATE answer, and the said-once marks
      const lateLegs = async (GM) => {
        await SYNC.applyThisMachine({ reason: 'boot', hooks: true });
        const RS = R.createCliConfigRunner({ starter: handStarter(), helperPath: '/x/helper.mjs', timeoutMs: 80, journal: () => {}, warn: () => {} });
        const G = GM.create({ rootDir: genRoot, port: 0, homeRead: (fn) => RS.homeRead(fn, 80) });
        const sfl = path.join(home, '.claude', 'settings.json'), j0 = fs.readFileSync(sfl, 'utf8'), jl = JSON.parse(j0);
        jl.statusLine = { type: 'command', command: 'my-own-statusline --flag' }; fs.writeFileSync(sfl, JSON.stringify(jl, null, 2) + '\n');
        const rf0 = fs.promises.readFile, w0 = console.warn; let stall = false; const held = [], warned = [], told = [];
        fs.promises.readFile = (f, ...a) => (stall && String(f).startsWith(home) ? new Promise((res, rej) => { held.push(() => rf0.call(fs.promises, f, ...a).then(res, rej)); }) : rf0.call(fs.promises, f, ...a));
        console.warn = (...a) => { warned.push(a.join(' ')); };
        const unread = (why) => { told.push(why); };
        const out = {};
        try {
          stall = true;
          out.s1 = await G.userStatuslineCmd({ unread });   // a silent home: none passed through, said once
          out.s2 = await G.userStatuslineCmd({ unread });   // the next start, the read still out: refused — NOT said again
          out.h1 = (await G.agentHooksStatus()).claude.unread || null;
          out.toldStalled = told.length; out.warnStatus1 = warned.filter((l) => l.startsWith('[hooks]')).length;
          stall = false; for (const f of held.splice(0)) f(); await new Promise((res) => setTimeout(res, 30));   // the home answers LATE
          out.s3 = await G.userStatuslineCmd({ unread });   // the count is back to zero: read, passed through; the mark is cleared
          out.h2 = (await G.agentHooksStatus()).claude.installed;
          stall = true; out.s4 = await G.userStatuslineCmd({ unread });   // a NEW stall after an answer: said again
          stall = false; for (const f of held.splice(0)) f(); await new Promise((res) => setTimeout(res, 30));
          out.told = told.length; out.warnStatus = warned.filter((l) => l.startsWith('[hooks]')).length;
        } finally { fs.promises.readFile = rf0; console.warn = w0; fs.writeFileSync(sfl, j0); }
        return out;
      };
      const lt = await lateLegs(require(path.join(REPO, 'src/server/agent-tool-generators.js')));
      ok(!!(lt.s1 === '' && lt.s2 === '' && lt.toldStalled === 1 && lt.h1 && lt.warnStatus1 === 1 && lt.s3 === 'my-own-statusline --flag' && lt.h2 === true && lt.s4 === '' && lt.told === 2),
        'r2513 (3): a silent home is said ONCE (the second stalled start is not said again, nor the status\'s refusal); a LATE answer brings the count back to zero on both readers (the statusLine passes through, the status reads installed) and clears the mark: a new stall is said again', lt);
      const GMK = require(MC.write('src/server/agent-tool-generators.js', anchored(src('src/server/agent-tool-generators.js'), "      if (_statuslineUnreadSaid !== 'silent') {", '      if (true) {', 'a statusline said at every stalled start'), 'said-every-start'));
      const ltm = await lateLegs(GMK);
      ok(ltm.toldStalled === 2, 'RED (no said-once mark): the second stalled start is said again', ltm);
      // r2513 (3): THE SIX-HOURLY CHECK's SKIP BY BEHAVIOUR — the check lifted from server.js and run: an unread entry calls no repair
      const SJ4 = src('server.js'), c0 = SJ4.indexOf('async function checkAgentHookHealth() {'), c1 = SJ4.indexOf('\n}\n', c0) + 2;
      const runCheck = async (text, st) => {
        const calls = [];
        const fn = new Function('hookRootWatch', 'integrationEnabled', 'fs', 'HOOK_OPTOUT_FILE', 'HOOK_CMD', 'createHookHelper', 'agentHooksStatus', 'ensureAgentHooks', 'serverNotice', text + '\nreturn checkAgentHookHealth;')(
          { probeMayRun: () => true, saidRecoveryInstead: () => false }, () => true, { existsSync: (f) => f === '/hook-cmd' }, '/opt-out', '/hook-cmd', () => {},
          async () => st, (a) => { calls.push(a); return { claude: { ok: true } }; }, () => {});
        await fn(); await tick();
        return calls.length;
      };
      const UNREAD = { file: 'x', unread: 'the home did not answer within 10000 ms', fileExists: null, dirExists: null, creatable: false, parseError: false, installed: null, stale: false };
      const STALE = { file: 'x', fileExists: true, dirExists: true, creatable: false, parseError: false, installed: false, stale: true };
      const chk = SJ4.slice(c0, c1);
      const nUnread = await runCheck(chk, { hookPath: '/hook-cmd', optedOut: false, claude: UNREAD, codex: UNREAD }), nStale = await runCheck(chk, { hookPath: '/hook-cmd', optedOut: false, claude: STALE, codex: UNREAD });
      ok(c0 > 0 && c1 > c0 && nUnread === 0 && nStale === 1, 'r2513 (3): the six-hourly check, RUN (lifted from server.js): two unread entries call NO repair; a stale one beside an unread one calls ONE', { nUnread, nStale });
      const SKIP = '      if (!info.fileExists || info.parseError) continue; // that CLI isn\'t set up here / unreadable\n';
      const nRed = chk.includes(SKIP) ? await runCheck(chk.replace(SKIP, ''), { hookPath: '/hook-cmd', optedOut: false, claude: UNREAD, codex: UNREAD }) : -1;
      ok(nRed === 2, 'RED (the skip taken out): an unread entry (installed null) reads «not installed» and the check calls a repair for each', { nRed });
      // r1813 (2): an Install pressed WHILE the start reads the mark and the rows (outside the queue): the start's removal reads the
      // mark again INSIDE its job — the Install, answered «ok», is never stripped after it
      const pressLegs = async (G) => {
        await SYNC.applyThisMachine({ reason: 'boot', hooks: true });
        fs.writeFileSync(G.HOOK_OPTOUT_FILE, new Date().toISOString() + '\n');
        const [st, inst] = await Promise.all([G.ensureAgentHooks({ auto: true }), G.ensureAgentHooks({ auto: false })]);   // the press in the start's wait
        const left = oursIn(JSON.parse(fs.readFileSync(sf, 'utf8')));
        fs.rmSync(G.HOOK_OPTOUT_FILE, { force: true });
        return { start: st && { optedOut: st.optedOut, removed: st.removed && { ok: st.removed.ok, skipped: st.removed.skipped || null } }, install: inst.claude && inst.claude.ok, left };
      };
      const pl = await pressLegs(GEN);
      ok(!!(pl.install === true && pl.left && pl.start && pl.start.removed && /no longer asked/.test(pl.start.removed.skipped || '')), 'r1813: an Install pressed during the start\'s wait is answered ok and STAYS — the start\'s removal finds the mark gone in its own job and is not run', pl);
      const WHEN = "when: ifOptedOut ? stillOptedOut : null,";
      const GENW = require(MC.write('src/server/agent-tool-generators.js', anchored(src('src/server/agent-tool-generators.js'), WHEN, 'when: null,', 'the mark read outside the queue'), 'no-when')).create({ rootDir: genRoot, port: 0, applyThisMachine: (o) => SYNC.applyThisMachine(o), homeRead: (fn) => SYNC.homeRead(fn) });
      const plm = await pressLegs(GENW);
      ok(plm.install === true && !plm.left, 'RED (the mark read outside the queue — the r1675 form): the Install is answered ok, then the start\'s removal strips it', plm);
      // r1813 (3) the true words: a run that broke BEFORE its check says the run's own reason, never «the check … broke»
      const GENB = require(path.join(REPO, 'src/server/agent-tool-generators.js')).create({ rootDir: genRoot, port: 0, applyThisMachine: async () => ({ at: 1, ok: false, receipts: [], created: [], why: 'the plan could not be built' }) });
      const rb = await GENB.ensureAgentHooks({ auto: false });
      ok(!!(rb.claude && rb.claude.ok === false && rb.claude.error === 'the plan could not be built'), 'r1813: a run that broke before its check tells each CLI the RUN\'s reason («the plan could not be built»)', rb);
    } finally { console.warn = warn0; console.log = log0b; delete process.env.VIBESPACE_FORCE_AGENT_HOOKS; }
    // r1813 (3): a removal the refusal door stopped (this suite's own env refuses: VIBESPACE_SKIP_AGENT_HOOKS) is ANSWERED as a refusal
    const rf = await GEN.stripAgentHookEntries();
    ok(!!(rf && rf.ok === false && rf.refused && typeof rf.why === 'string' && rf.why.length > 0), 'r1813: a removal stopped by the refusal door answers ok:false with the refusal by name (the uninstall route then says it, never «success»)', rf);
    // r1813 (3): the Apply press says a queued removal's own reason (a landing carries `why`), never «removed: undefined»
    {
      const routes = {}, app = { post: (pp, fn) => { routes[pp] = fn; } };
      require(path.join(REPO, 'src/server/hooks-late.js')).create({ activeSessions: new Map(), getSessionStatus: () => null, getUserTodos: () => null, sessionStatusKey: () => null, harnesses: { list: () => [] }, log: () => { }, warn: () => { } })
        .registerApplyRoute(app, { ensureAgentHooks: async () => ({ optedOut: true, removed: { ok: false, why: 'our hook entries are still in ~/.claude/settings.json' } }), agentHooksStatus: () => ({}), integrationEnabled: () => true, harnessConfig: { syncCliConfig: async () => ({ receipts: [] }), cliConfigStatus: () => ({}) }, hookRegistrationSafe: () => true });
      let body = null; const res = { status() { return res; }, json(x) { body = x; return res; } };
      await routes['/api/cli-config/apply']({ body: {}, query: {}, headers: {} }, res);
      ok(!!(body && body.ok === false && /removed: our hook entries are still in ~\/\.claude\/settings\.json/.test(body.error || '') && !/undefined/.test(body.error || '')), 'r1813: the Apply press says the queued removal\'s own reason', body);
    }
    const SJ = src('server.js'), hc = SJ.slice(SJ.indexOf('function checkAgentHookHealth()'), SJ.indexOf('function checkAgentHookHealth()') + 1600);
    ok(/if \(info\.stale \|\| !info\.installed \|\| scriptMissing\) \{[\s\S]*?ensureAgentHooks\(\{ auto: true \}\)/.test(hc) && (hc.match(/ensureAgentHooks\(/g) || []).length === 1,
      'WIRING (d): the six-hourly check asks the helper only inside «stale, not installed, or the hook script missing»');
  } finally { process.env.HOME = HOME0; }
}

console.log('⑦ (b) the settings answer at the landing');
async function answerLegs(A) {
  const res = () => { const r = { body: null, json: (b) => { r.body = b; return r; } }; return r; };
  const timers = []; const fake = { setTimer: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; }, clearTimer: (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); } };
  const out = {};
  { const r = res(); A.answerAtLanding(r, { success: true }, null, fake); out.none = r.body; }
  { const r = res(); A.answerAtLanding(r, { success: true }, Promise.resolve({ receipts: [], files: [] }), fake); out.before = r.body; await tick(); out.landed = r.body; }
  { const r = res(); A.answerAtLanding(r, { success: true }, Promise.resolve({ error: 'the helper exited 1: EIO' }), fake); await tick(); out.failed = r.body; }
  { const r = res(); A.answerAtLanding(r, { success: true }, Promise.resolve({ skipped: true, refused: { line: 'hooks not registered: a worktree' } }), fake); await tick(); out.refused = r.body; }
  { const r = res(); A.answerAtLanding(r, { success: true }, new Promise(() => {}), fake); out.pending = r.body; const t = timers[timers.length - 1]; if (t) t.fn(); out.past = r.body; }
  return out;
}
{
  const A = require(path.join(REPO, ANSWER_REL));
  const a = await answerLegs(A);
  ok(a.none && a.none.success === true && !('cliConfig' in a.none), 'no CLI-config row moved → the plain answer', a.none);
  ok(a.before === null && a.landed && a.landed.cliConfig && a.landed.cliConfig.landed === true, 'a moved row: NO answer before the landing, then «landed»', a);
  ok(a.failed.cliConfig.landed === false && /exited 1/.test(a.failed.cliConfig.why) && a.refused.cliConfig.landed === false && /a worktree/.test(a.refused.cliConfig.why), 'a failed or refused landing is told by name', a);
  const NL = A.notLanded;
  const nl = { switchOn: NL([{ claude: { ok: true }, codex: { ok: false, missing: 'no-dir', error: '~/.codex not found' } }, null]), regFailed: NL([{ claude: { ok: false, error: 'the starter did not answer' } }, { receipts: [], files: [] }]),
    removalFailed: NL([{ at: 1, ok: false, why: 'the helper exited 1' }, null]), optedOut: NL([{ optedOut: true }, null]), removed: NL([{ at: 1, ok: true, receipts: [], created: [] }, null]) };
  ok(nl.switchOn === null && nl.regFailed === 'claude: the starter did not answer' && nl.removalFailed === 'the helper exited 1' && nl.optedOut === null && nl.removed === null,
    'the Integration switch\'s own answer is read too: a failed registration or removal is told by name; a CLI that has not run on this machine (no-dir) and an opt-out are no failure', nl);
  ok(/return \(landing \|\| toggled\) \? Promise\.all\(\[toggled, landing\]\) : null;/.test(src('server.js')), 'WIRING: the settings write hands back both — the switch\'s registration and the rows\' landing');
  ok(a.pending === null && a.past && a.past.cliConfig.landed === false && /has not landed on this machine within 10 s \(still writing\)/.test(a.past.cliConfig.why), 'past the bound: told «still writing», by name — never «applied»', a);
  const M = require(MC.write(ANSWER_REL, anchored(src(ANSWER_REL), "  if (!landing || typeof landing.then !== 'function') return res.json(body);", '  return res.json(body);', 'an answer that never waits'), 'no-wait-answer'));
  const am = await answerLegs(M);
  ok(am.before !== null && !('cliConfig' in am.before), 'RED (an answer that never waits): «success» before the landing, the landing never said', am.before);
  const PS = src('src/routes/persistence.js');
  ok(/const out = \{\}, spend = writeSettings\(data, out\);\n\s+answerAtLanding\(res, \{ success: true, \.\.\.\(spend \? \{ spend \} : \{\}\)[^\n]*\}, out\.landing\);/.test(PS) && /const out = \{\}; writeSettings\(merged, out\);\n\s+answerAtLanding\(res, \{ success: true, [^\n]*\}, out\.landing\);/.test(PS)
    && /if \(out\) out\.landing = landing;/.test(PS) && !/_landing\b/.test(PS),
    'WIRING (r1518): the settings POST and PATCH answer through it with THEIR OWN write\'s landing (writeSettings\' `out`) — no module-wide landing another writer could leave behind');
  ok(/const r = await fetchJson\('\/api\/agent-hooks\/uninstall', \{ method: 'POST' \}\); if \(!r \|\| r\.success === false \|\| typeof r\.error === 'string'\) showToast\(t\('The hooks were not removed — \{reason\}'/.test(src('src/lib/manage-agents.js'))
    && src('src/lib/i18n-zh.js').includes('"The hooks were not removed — {reason}":') && src('src/lib/i18n-ja.js').includes('"The hooks were not removed — {reason}":'),
    'WIRING (r1518): «Remove» says a removal that did not land (zh / ja), never «Hook removed» over it');
  // the page says it: a save whose answer carries «not landed» is a toast with the why (en / zh / ja)
  const W = "Saved in VibeSpace, but not yet in this machine's CLI files: {why}";
  const SM = src('src/lib/settings.js'), APP = src('src/lib/app.js');
  ok(/if \(j && j\.cliConfig && j\.cliConfig\.landed === false\) \{ try \{ this\.onCliConfig\?\.\(j\.cliConfig\); \}/.test(SM) && APP.includes(`this.settings.onCliConfig = (c) => { showToast(t(${JSON.stringify(W)}, { why: String((c && c.why) || '') }), { type: 'warn' }); };`)
    && src('src/lib/i18n-zh.js').includes(JSON.stringify(W) + ':') && src('src/lib/i18n-ja.js').includes(JSON.stringify(W) + ':'),
    'WIRING: the settings save hands a «not landed» answer to the page, which says it in a toast with the why (zh and ja words)');
}

console.log('⑧ r1518 (the full round\'s must): the hook root\'s watch sees a recovery on a machine where one CLI never ran');
const RW_REL = 'src/server/hook-root-watch.js';
async function watchRecovery(RW) {
  const d = path.join(ROOT, `watch-${Math.random().toString(36).slice(2, 8)}`); fs.mkdirSync(d, { recursive: true });
  const memo = path.join(d, RW.MEMO_FILE); fs.writeFileSync(memo, JSON.stringify({ cause: 'an earlier unknown root' }));
  const notices = [];
  const w = RW.create({ dataDir: d, ensureAgentHooks: () => ({ claude: { ok: true }, codex: { ok: false, missing: 'no-dir', error: '~/.codex not found — the CLI has not run on this machine; nothing is created' } }), rootRecovery: () => ({ registeredAfterError: { at: 0, error: 'EIO' } }), ownerWriteRefusal: () => null, serverNotice: (id) => { notices.push(id); return 1; }, setTimer: () => ({ unref() { } }), log: () => { } });
  w._state.attempt = 3; await w.sync();
  return { memoKept: fs.existsSync(memo), said: w._state.said, attempt: w._state.attempt, notices };
}
{
  const RWM = require(path.join(REPO, RW_REL));
  const rw = await watchRecovery(RWM);
  ok(!rw.memoKept && rw.said === true && rw.attempt === 0 && rw.notices.includes('hook-root-registered'), 'a good registration on a Claude-only machine (codex: no folder here) IS a recovery: the memo removed, the backoff reset, «registered after an earlier read error» said', rw);
  const TIP_GUARD = "      else if (r && !r.refused && !Object.values(r).some((x) => x && x.ok === false)) recovered();   // a registration that did not land is no recovery";   // stale-pins: kept (the tip's guard, rebuilt for the red control)
  const NOW_GUARD = /      else if \(r && !r\.refused && require\('\.\/landing-answer\.js'\)\.notLanded\(r\) === null\) recovered\(\);[^\n]*/;
  const rwm = await watchRecovery(require(MC.write(RW_REL, anchored(src(RW_REL), NOW_GUARD, TIP_GUARD, 'the tip\'s guard'), 'tip-guard')));
  ok(rwm.memoKept && rwm.said === false, 'RED (the tip\'s guard): «no folder here» reads as a failure — the memo kept, the recovery never said (a person keeps a warning that is no longer true)', rwm);
}

clearInterval(KEEP);
report();

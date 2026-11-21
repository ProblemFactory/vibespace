#!/usr/bin/env node
// test-job-memory-budget — B-b14a: THE INSTANCE'S MEMORY BUDGET FOR RUNNING JOBS (the coordinator's ruling r777). The per-job cap
// lets two jobs at the cap fill an instance together; on a pod that ends the hub. THE LAW: a start is refused BY NAME only when
// the MEASURED memory of the jobs running now, plus THIS job's own bound, would pass the budget (the instance's limit less the
// hub's share). Never their bounds: idle jobs hold almost nothing. A missing or stale measure: NOT JUDGED (never a refusal on a
// guess), said. A machine with no limit: nothing changes. Fast, in-process — the legs drive a PLACED measure (the engine's
// `measureJobUse` seam) over a FAKE limit (the `memoryLimitDir` seam), never real load:
//   §1 PURE src/job-model.js budgetVerdict / budgetRefusalWords: the table (idle jobs, a full instance, unmeasured, stale, no limit)
//      and the agent's words (its own conversation's holders named, the others counted) — a RED copy that judges a missing measure
//   §2 THE ENGINE (the real JobManager, a stand-in wrapper): every start road — a create past the budget creates NOTHING; a start
//      is refused with the record unchanged; a schedule's fire is skipped, its schedule kept; a service's restart counts on its
//      ladder and parks with the words; no measure (a boot replay) never refuses; the limit read off the loop; the snapshot's
//      numbers; the no-limit control — and a RED copy of src/jobs.js without the verdict
//   §3 the doors' words (src/lib/jobs-layout.js budgetWords / budgetRefusalPersonWords) in en, zh and ja, and their wiring
//   (the CLI's `show` line is test-jobs-cli-body's — it starts the real CLI: heavy)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checker } from './lib/check.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { scratch, anchored } from './scratch.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const M = require('../src/job-model.js');
const { JobManager } = require('../src/jobs.js');
const L = await import(pathToFileURL(path.join(REPO, 'src/lib/jobs-layout.js')).href);
const ZH = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-zh.js')).href)).default;
const JA = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-ja.js')).href)).default;
const { ok, report } = checker();
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf-8');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const TMP = scratch('job-memory-budget');
fs.mkdirSync(TMP, { recursive: true });
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { } });
const T0 = Date.now();
const GB = 1024;

// ════════ §1 THE PURE VERDICT ════════
console.log('§1 PURE — budgetVerdict / budgetRefusalWords');
const used = (mb, ago = 0) => ({ mb, at: T0 - ago });
const R = (id, mb, extra = {}) => ({ id, name: 'job-' + id, use: mb === null ? null : used(mb), ...extra });
function verdictRows(X) {
  const v = (o) => { try { return X.budgetVerdict({ nowMs: T0, ...o }); } catch (e) { return { threw: e.message }; } };
  const noLimit = v({ limitMb: null, running: [R('a', 9000)], askedMb: 8 * GB });
  const idle = v({ limitMb: 12 * GB, running: Array.from({ length: 30 }, (_, i) => R('s' + i, 50)), askedMb: 4 * GB });
  const fits = v({ limitMb: 12 * GB, running: [R('a', 3000), R('b', 2000)], askedMb: 4 * GB });
  const full = v({ limitMb: 12 * GB, running: [R('a', 3000), R('b', 3000)], askedMb: 4 * GB });
  const unmeasured = v({ limitMb: 12 * GB, running: [R('a', 3000), R('b', null)], askedMb: 4 * GB });
  const stale = v({ limitMb: 12 * GB, running: [R('a', 3000, { use: used(3000, 20000) })], askedMb: 4 * GB });
  return [
    ['a machine with NO limit (the owner\'s box): not judged — nothing changes', same(noLimit, { judged: false, why: 'no-limit' }), noLimit],
    ['the budget is the per-job cap\'s own figure: 12 GB less the hub\'s share (3 GB) = 9 GB', X.budgetMbOf(12 * GB) === 9 * GB && X.budgetMbOf(null) === null, X.budgetMbOf(12 * GB)],
    ['THIRTY IDLE jobs (50 MB each) and a 4 GB start: it starts — the budget counts what they USE, never their bounds (the ruling)', idle.judged === true && idle.ok === true && idle.usedMb === 1500, idle],
    ['5 GB in use + a 4 GB bound within 9 GB: it starts', fits.judged === true && fits.ok === true, fits],
    ['6 GB in use + a 4 GB bound past 9 GB: REFUSED — the holders by measure (largest first), the room left', full.refused === true && full.usedMb === 6000 && full.roomMb === 9 * GB - 6000 && same(full.holders.map((h) => h.id), ['a', 'b']), full],
    ['a running job with NO measure: not judged — never a refusal on a guess', unmeasured.judged === false && unmeasured.why === 'unmeasured' && same(unmeasured.unmeasured, [{ id: 'b', name: 'job-b' }]), unmeasured],
    ['a measure older than the age bound (15 s) is no measure: not judged', stale.judged === false && stale.why === 'unmeasured', stale],
  ];
}
const GUESS_ROWS = ['a running job with NO measure: not judged — never a refusal on a guess', 'a measure older than the age bound (15 s) is no measure: not judged'];
for (const [n, c, f] of verdictRows(M)) ok(c, n, f);
{
  const v = M.budgetVerdict({ nowMs: T0, limitMb: 12 * GB, running: [R('a', 3000, { own: true }), R('b', 2000, { own: false }), R('c', 1500, { own: false })], askedMb: 4 * GB });
  v.holders = v.holders.map((h) => ({ ...h, own: h.id === 'a' }));
  const w = M.budgetRefusalWords(v, { id: 'jb-9' });
  ok(w === "not started: the instance's memory budget for jobs is 9 GB, and 6.3 GB of it is in use by 3 running jobs (job-a 2.9 GB; 2 of other conversations 3.4 GB); this job's bound is 4 GB. To start it: stop one of yours (vibespace-job stop <id>), or lower this job's bound to 2.7 GB or less (vibespace-job memory jb-9 2716M), then start it again",
    'the AGENT\'s words: its own conversation\'s holders by name, the others counted and summed (never named to an agent), this job\'s bound, the recipe with the verbs', w);
  const wc = M.budgetRefusalWords(v, { create: true });
  ok(wc.startsWith('not created: ') && wc.includes('give it --memory 2716M or less') && !wc.includes('then start it again'), 'a `run` refused: «not created», the recipe gives the --memory to ask', wc);
  const vo = { ...v, holders: v.holders.map((h) => ({ ...h, own: false })), roomMb: 100 };
  const wo = M.budgetRefusalWords(vo, { id: 'jb-9' });
  ok(wo.includes('To start it: wait until one of them ends') && !wo.includes('stop one of yours'), 'every holder another conversation\'s, no room to lower into: the recipe is to wait — never a verb it cannot use', wo);
}
const MJ = mutantCopies('job-memory-budget', REPO);
{
  const X = MJ.load('src/job-model.js', anchored(read('src/job-model.js'), '  const stale = running.filter((r) => !fresh(r));\n', '  const stale = [];   /* MUTANT: a missing measure is judged */\n', 'the verdict\'s «no measure, no judgement»'), 'judges-a-guess');
  const red = verdictRows(X).filter(([, c]) => !c).map(([n]) => n);
  ok(same(red.sort(), [...GUESS_ROWS].sort()), `CONTROL (a missing measure judged, in a copy): exactly the ${GUESS_ROWS.length} «never on a guess» rows go red`, red);
}

// ════════ §2 THE ENGINE ════════
console.log('§2 THE ENGINE — every start road over a placed measure and a fake limit');
// the stand-in wrapper takes its spec and exits: the run stays OPEN in the record (the sweep that would judge its end is off)
const STANDIN = "const fs = require('fs'); const [ctl, spec] = process.argv.slice(2); try { fs.unlinkSync(spec); } catch { }\n";
const owner = { conversation: { id: 'conv-budget' }, sessionId: 'sess-b', sessionCreatedAt: 1, createdBy: 'agent', groupsSnapshot: [] };
const caller = { conversationId: 'conv-budget', sessionId: 'sess-b', sessionCreatedAt: 1, groups: new Set() };
const limitDir = (v) => { const d = fs.mkdtempSync(path.join(TMP, 'lim-')); fs.writeFileSync(path.join(d, 'memory.max'), v + '\n'); return d; };
const MEASURE = new Map();   // THE PLACED MEASURE: job name → MB (absent = the measure answers nothing)
const said = [];
function engine(name, { limit, JM = JobManager } = {}) {
  const dir = path.join(TMP, name); fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'bin', 'job-wrapper.js'), STANDIN);
  const jm = new JM({ dataDir: dir, broadcast() { }, log() { }, notifyUser(n) { said.push(n); return { ok: true }; }, deliverToConversation: async () => ({ ok: true, lane: 'message' }), groupNotifyFor: () => null, notifyGlobal: () => true, peerReachable: () => true,
    memoryLimitDir: limit, measureJobUse: (job) => (MEASURE.has(job.name) ? MEASURE.get(job.name) : null) });
  jm.init(); for (const t of jm._timers || []) clearInterval(t); jm._timers = [];
  return jm;
}
const mk = (jm, name, mem, extra = {}) => jm.create({ kind: 'task', name, cmd: { argv: ['sh', '-c', 'sleep 1'], cwd: TMP }, memoryMb: mem, owner, ...extra }, caller);
const byName = (jm, n) => [...jm.jobs.values()].find((j) => j.name === n);
// a run ENDED as the sweep would judge it (its scope read empty: nothing of it runs — no doubt holds the next start)
const endRun = (j, state) => { const r = j.runs[j.runs.length - 1]; r.endedAt = Date.now(); r._scopeEmpty = true; j.state = state; };
const evOf = (jm, j) => jm.events.filter((e) => e.jobId === j.id).map((e) => e.what);
// the doors' fact is worked out once a second (_budgetFacts' memo) — a leg reads it as the next answer would, past the memo
const factsOf = (jm, j) => { jm._budgetMemo = null; return jm.snapshot(j).memoryBudget; };
const MB12G = String(12 * 1024 * 1048576);
{
  const jn = engine('no-limit', { limit: limitDir('max') });
  const made = ['x', 'y', 'z'].map((n) => mk(jn, n, '8G'));
  for (const n of ['x', 'y', 'z']) MEASURE.set(n, 7000);
  await jn._sampleUse();
  const w = mk(jn, 'w', '8G');
  ok(made.every((r) => !!r.job) && !!w.job && factsOf(jn, byName(jn, 'w')) === null && !byName(jn, 'x')._use,
    'CONTROL «nothing changes without a limit» (memory.max = max, the owner\'s box): four 8 GB jobs beside 21 GB in use all start, nothing is sampled, no budget field', { made: made.map((r) => r.error || 'ok'), w: w.error || 'ok', sampled: !!byName(jn, 'x')._use });
  for (const n of ['x', 'y', 'z']) MEASURE.delete(n);
}
const jm = engine('pod', { limit: limitDir(MB12G) });
{
  const a = mk(jm, 'a', '4G'), b = mk(jm, 'b', '4G');
  ok(!!a.job && !!b.job && factsOf(jm, byName(jm, 'b')).unmeasured === 2, 'NO MEASURE YET (a fresh hub, a boot\'s replay): two 4 GB jobs start, and the doors say the budget is not judged now — never a refusal on a guess', { a: a.error, b: b.error, facts: factsOf(jm, byName(jm, 'b')) });
  MEASURE.set('a', 3000); MEASURE.set('b', 3000);
  await jm._sampleUse();
  ok(byName(jm, 'a')._use && byName(jm, 'a')._use.mb === 3000 && byName(jm, 'b')._use.mb === 3000, 'the sampler reads each running job\'s OWN measure through the seam (a placed measure, never real load)', byName(jm, 'a')._use);
  const n0 = jm.jobs.size;
  const c = mk(jm, 'c', '4G');
  ok(!c.job && c.code === 'memory-budget' && c.error.startsWith("not created: the instance's memory budget for jobs is 9 GB, and 5.9 GB of it is in use by 2 running jobs (") && c.error.includes('give it --memory 3216M or less') && jm.jobs.size === n0 && c.budget && same(c.budget.holders.map((h) => h.own), [true, true]),
    'a `run` past the budget (5.9 GB used + 4 GB > 9 GB): refused by name — the holders, the recipe — and NOTHING is created', c);
  MEASURE.set('a', 100); MEASURE.set('b', 100);
  await jm._sampleUse();
  const c2 = mk(jm, 'c2', '4G');
  ok(!!c2.job, 'the same two jobs IDLE (100 MB each): a third 4 GB job starts — their bounds (8 GB) are never counted (the ruling)', c2.error);
  // a service, made while there is room — then down, its restarts asked while the others use 6 GB
  const svc = jm.create({ kind: 'service', name: 'svc', cmd: { argv: ['sh', '-c', 'sleep 1'], cwd: TMP }, memoryMb: '4G', owner }, caller);
  const sj = svc.job ? jm.jobs.get(svc.job.id) : null;
  for (const n of ['a', 'b', 'c2']) MEASURE.set(n, 3000);
  MEASURE.set('svc', 100);
  await jm._sampleUse();
  // a stopped task started again: refused, its record as it was
  const d = byName(jm, 'a'); endRun(d, 'done');
  const before = JSON.stringify({ state: d.state, runs: d.runs.length });
  const sr = jm.start(d);
  ok(sr.code === 'memory-budget' && /^not started: /.test(sr.error) && sr.error.endsWith(', then start it again') && !!sr.budget && JSON.stringify({ state: d.state, runs: d.runs.length }) === before && evOf(jm, d).some((w) => /^not started: .* \(manual\)$/.test(w)),
    'a START past the budget: refused by name (the code + the facts the panel words), the record as it was, the refusal on its events', { sr, state: d.state, runs: d.runs.length });
  // a stale measure: not judged ⇒ it starts
  for (const n of ['b', 'c2', 'svc']) byName(jm, n)._use.at = Date.now() - 20000;
  const sr2 = jm.start(d);
  ok(!sr2.error && d.state === 'up', 'the same start once the measures are older than 15 s: NOT judged — it starts (a stale measure is no measure)', sr2);
  endRun(d, 'done');
  await jm._sampleUse();
  // a schedule's fire past the budget: THIS fire skipped, said; the schedule kept
  const cron = jm.create({ kind: 'cron', name: 'nightly', schedule: { everyMs: 3600e3 }, action: { type: 'spawn-task', task: { cmd: { argv: ['sh', '-c', 'true'], cwd: TMP }, memoryMb: '4G' } }, owner }, caller);
  const cj = jm.jobs.get(cron.job.id), next0 = cj.nextFireAt;
  jm._fireCron(cj, 'cron');
  const child = [...jm.jobs.values()].find((j) => j.cronParent === cj.id);
  const ev = evOf(jm, cj).join(' | ');
  ok(/fire skipped — not started: the instance's memory budget/.test(ev) && cj.nextFireAt === next0 && cj.nextFireAt !== null && cj.state === 'scheduled' && cj.desiredUp === true && !!child && child.state === 'missed' && child.runs.length === 0,
    'a SCHEDULE\'s fire past the budget: that fire is skipped and said on the schedule; the schedule stays on, its next fire as it was (never the vet\'s switch-off)', { ev, next: cj.nextFireAt === next0, state: cj.state, child: child && child.state });
  // a service's automatic restarts past the budget: counted on its ladder, then parked — the park and its For-you copy name the budget
  let ladder = null;
  if (sj) {
    endRun(sj, 'down'); sj.desiredUp = true;
    for (let i = 0; i < M.SUPERVISE.failCap; i++) { try { jm._startAfter(sj, 'restart-policy', () => sj.desiredUp && sj.state === 'down'); } catch (e) { if (e && e.code === 'memory-budget') jm._budgetLadder(sj, e); } }
    const copy = said.filter((n) => n.jobId === sj.id && n.fact === 'parked-budget');
    ladder = { state: sj.state, fails: sj.supervise && sj.supervise.consecutiveFails, runs: sj.runs.length, parks: evOf(jm, sj).filter((w) => /^parked: not restarted/.test(w)), copies: copy.length, params: copy[0] && copy[0].words && copy[0].words.params, crashLoop: said.some((n) => n.jobId === sj.id && n.fact === 'parked') };
  }
  ok(!!ladder && ladder.state === 'failed' && ladder.fails === M.SUPERVISE.failCap && ladder.runs === 1 && ladder.parks.length === 1 && /the instance's memory budget/.test(ladder.parks[0]),
    `a SERVICE's automatic restarts past the budget count on its ladder: ${M.SUPERVISE.failCap} refused ⇒ PARKED (no run started), the park naming the budget`, ladder || svc);
  ok(!!ladder && ladder.copies === 1 && !ladder.crashLoop && ladder.params && ladder.params.budget === '9 GB' && /^(a|b|c2) 2\.9 GB, (a|b|c2) 2\.9 GB/.test(ladder.params.holders || '') && ladder.params.count === String(M.SUPERVISE.failCap),
    '…and the person\'s For-you copy is the budget\'s own («parked-budget»: the budget and its holders by name) — never «crash-looped»', ladder && { copies: ladder.copies, crashLoop: ladder.crashLoop, params: ladder.params });
  const pol = read('src/jobs.js');
  ok((pol.match(/catch \((e2?)\) \{ if \(\1 && \1\.code === 'memory-budget'\) this\._budgetLadder\(job, \1\); \}/g) || []).length === 2 && pol.includes("if (e && e.code === 'memory-budget' && job.kind === 'service' && trigger !== 'manual') this._budgetLadder(job, e);"),
    'WIRING: every automatic restart hands a budget refusal to the ladder — the policy\'s timer, the ladder\'s own retry, and a start DEFERRED behind its last run\'s reap (each swallowed it before)');
  // the snapshot's numbers, and the limit read OFF the loop
  const snap = factsOf(jm, d);
  ok(!!snap && snap.budgetMb === 9 * GB && snap.running === 2 && snap.usedMb === 6000 && !('holders' in snap), 'the snapshot carries the budget\'s NUMBERS only (the two jobs still running, 6 GB) — a viewer may see none of the holders', snap);
  const lim = jm.d.memoryLimitDir;
  fs.writeFileSync(path.join(lim, 'memory.max'), String(16 * 1024 * 1048576) + '\n');
  jm._limitRead.at = Date.now() - 61e3;
  const stillOld = jm._instanceLimit().mb;
  await jm._refreshLimit();
  ok(stillOld === 12 * GB && jm._instanceLimit().mb === 16 * GB, 'the limit is re-read OFF the loop: the cached figure answers at once (12 GB), the bounded async read then lands the new one (16 GB)', { stillOld, now: jm._instanceLimit().mb });
}
console.log('§2b RED: a copy of src/jobs.js whose start asks no budget');
{
  const JX = MJ.load('src/jobs.js', anchored(read('src/jobs.js'), '{ const bv = this._budgetVerdict(job, M.memoryMbOf(job, this._memoryCtx({ hub: true })).mb); if (bv.refused) throw this._budgetRefusal(job, bv, trigger); }', '{ /* MUTANT: no budget at the start */ }', 'the start\'s budget verdict'), 'no-budget');
  const jx = engine('pod-mut', { limit: limitDir(MB12G), JM: JX.JobManager });
  mk(jx, 'p', '4G'); mk(jx, 'q', '4G'); mk(jx, 'r', '1G');
  MEASURE.set('p', 3000); MEASURE.set('q', 3000); MEASURE.set('r', 100);
  await jx._sampleUse();
  const r = byName(jx, 'p'); endRun(r, 'done');
  const sr = jx.start(r);
  ok(!sr.error && r.state === 'up', 'CONTROL (no verdict at the start, in a copy): the start past the budget GOES — the verdict line is what refuses it', sr);
}

// ════════ §3 THE DOORS' WORDS ════════
console.log('§3 the doors\' words (jobs-layout budgetWords / budgetRefusalPersonWords) in en, zh and ja, and their wiring');
{
  const tFor = (dict) => (k, p = {}) => String((dict && dict[k]) || k).replace(/\{(\w+)\}/g, (m, n) => (p[n] !== undefined ? String(p[n]) : m));
  const en = tFor(null), zh = tFor(ZH), ja = tFor(JA);
  const j = (memoryBudget) => ({ id: 'jb-1', memoryBudget });
  ok(L.budgetWords(j({ budgetMb: 9216, running: 2, usedMb: 6144 }), en) === 'The instance’s memory budget for jobs: 9 GB — 6 GB in use by 2 running job(s)', 'the doors\' fact: the budget and what the running jobs use', L.budgetWords(j({ budgetMb: 9216, running: 2, usedMb: 6144 }), en));
  ok(L.budgetWords(j({ budgetMb: 9216, running: 3, unmeasured: 1 }), en) === 'The instance’s memory budget for jobs: 9 GB — not judged right now: the memory of 1 running job(s) could not be read', '…or that it is not judged right now, said', L.budgetWords(j({ budgetMb: 9216, running: 3, unmeasured: 1 }), en));
  ok(L.budgetWords(j(null), en) === '' && L.budgetWords({ id: 'x' }, en) === '', 'no limit (or an older hub): nothing said — nothing changes');
  const b = { budgetMb: 9216, usedMb: 6000, askedMb: 4096, roomMb: 3216, holders: [{ id: 'a', name: 'build', mb: 3500 }, { id: 'b', name: 'api', mb: 2500 }] };
  ok(L.budgetRefusalPersonWords(b, en) === 'Not started: the instance’s memory budget for jobs is 9 GB, and 5.9 GB of it is in use by 2 running job(s) (build 3.4 GB, api 2.4 GB); this job asks 4 GB. Stop one of them, or lower this job’s memory bound to 3.1 GB or less.', 'the PERSON\'s refusal at a press: every holder by name, this job\'s bound, the recipe', L.budgetRefusalPersonWords(b, en));
  ok(L.budgetRefusalPersonWords(b, en, { create: true }).startsWith('Not created: ') && L.budgetRefusalPersonWords({ ...b, roomMb: 100 }, en).endsWith('Stop one of them first.'), 'a create: «Not created»; no room to lower into: «Stop one of them first.»');
  const keys = ['The instance’s memory budget for jobs: {budget} — {used} in use by {n} running job(s)', 'The instance’s memory budget for jobs: {budget} — not judged right now: the memory of {n} running job(s) could not be read',
    'Not started: the instance’s memory budget for jobs is {budget}, and {used} of it is in use by {n} running job(s) ({holders}); this job asks {asked}. Stop one of them, or lower this job’s memory bound to {room} or less.', 'Not started: the instance’s memory budget for jobs is {budget}, and {used} of it is in use by {n} running job(s) ({holders}); this job asks {asked}. Stop one of them first.',
    'Not created: the instance’s memory budget for jobs is {budget}, and {used} of it is in use by {n} running job(s) ({holders}); this job asks {asked}. Stop one of them, or give this job a memory bound of {room} or less.', 'Not created: the instance’s memory budget for jobs is {budget}, and {used} of it is in use by {n} running job(s) ({holders}); this job asks {asked}. Stop one of them first.'];
  const holes = (k) => (k.match(/\{\w+\}/g) || []).sort().join();
  ok(keys.every((k) => typeof ZH[k] === 'string' && typeof JA[k] === 'string' && holes(ZH[k]) === holes(k) && holes(JA[k]) === holes(k)), 'all six sentences have zh and ja words, each keeping every {hole}', keys.filter((k) => !ZH[k] || !JA[k] || holes(ZH[k]) !== holes(k) || holes(JA[k]) !== holes(k)));
  ok(L.budgetRefusalPersonWords(b, zh).startsWith('未启动：实例给任务的内存预算为 9 GB') && L.budgetWords(j({ budgetMb: 9216, running: 2, usedMb: 6144 }), ja).startsWith('インスタンスのジョブ用メモリ予算：9 GB'), 'the words read in zh and ja');
  const panel = read('src/lib/jobs-panel.js'), wiring = read('src/server/jobs-wiring.js');
  ok(panel.includes("mc.title = [j.memoryBound?.why || '', budgetWords(j, t)].filter(Boolean).join(' · ');") && panel.includes('memBudget.textContent = budgetWords(job, t);') && panel.includes('memRow.append(memLbl, memIn, memSet, memFact, memEff, memHeap, memBudget);'),
    'WIRING: the doors — the card chip\'s title and the Memory bound row carry the budget\'s fact');
  ok(panel.includes("if (r?.error && r.code === 'memory-budget' && r.budget) r.error = budgetRefusalPersonWords(r.budget, t);") && panel.includes("if (r?.error && r.code === 'memory-budget' && r.budget) r.error = budgetRefusalPersonWords(r.budget, t, { create: true });") && (wiring.match(/\.\.\.\(r\.budget \? \{ budget: r\.budget \} : \{\}\)/g) || []).length === 2,
    'WIRING: a person\'s press (Start / Restart) and a create are attended in the reader\'s language — the routes hand the code and the facts');
}
for (const r of copiesCensus(MJ.files, MJ.dir, REPO, { minCopies: 2, label: 'B-b14a ' })) ok(r.pass === true, r.name + (r.pass ? '' : ' — ' + r.detail));
report();

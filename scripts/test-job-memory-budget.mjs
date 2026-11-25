#!/usr/bin/env node
// test-job-memory-budget — B-b14a: THE INSTANCE'S MEMORY BUDGET FOR RUNNING JOBS (the coordinator's ruling r777). The per-job cap
// lets two jobs at the cap fill an instance together; on a pod that ends the hub. THE LAW: a start is refused BY NAME only when
// the MEASURED memory of the jobs running now, plus THIS job's own bound, would pass the budget (the instance's limit less the
// hub's share). Never their bounds: idle jobs hold almost nothing. A missing or stale measure: NOT JUDGED (never a refusal on a
// guess), said. A machine with no limit: nothing changes. Fast, in-process — the legs drive a PLACED measure (the engine's
// `measureJobUse` seam) over a FAKE limit (the `memoryLimitDir` seam), never real load — but ONE leg of the REAL measure, which
// spawns two small processes for a second (a stand-in wrapper whose child holds 48 MB). Rounds wh9e7xe8i and r924 / r931 added
// the privacy legs, the refused press (a second engine over the same data folder), the deferred presses (a person, an agent, the
// undo's edge), what a start of a job that names no memory is judged with — each with its red copy (twelve copies in all):
//   §1 PURE src/job-model.js budgetVerdict / budgetRefusalWords: the table (idle jobs, a full instance, unmeasured, stale, no limit)
//      and the agent's words (the holders the caller may view named, the others counted) — a RED copy that judges a missing measure
//   §2 THE ENGINE (the real JobManager, a stand-in wrapper): every start road — a create past the budget creates NOTHING; a start
//      is refused with the record unchanged; a schedule's fire is skipped, its schedule kept; a service's restart counts on its
//      ladder and parks with the words; no measure (a boot replay) never refuses; the limit read off the loop; the snapshot's
//      numbers; the no-limit control — and a RED copy of src/jobs.js without the verdict
//   §3 the doors' words (src/lib/jobs-layout.js budgetWords / budgetRefusalPersonWords) in en, zh and ja, and their wiring
//   (the CLI's `show` line is test-jobs-cli-body's — it starts the real CLI: heavy)
import './scratch.mjs';
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
  ok(w === "not started: the instance's memory budget for jobs is 9 GB, and 6.3 GB of it is in use by 3 running jobs (job-a 2.9 GB; 2 of other conversations 3.4 GB); this job's bound is 4 GB. To start it: stop one of the jobs named (vibespace-job stop <id>, where you may), or lower this job's bound to 2.7 GB or less (vibespace-job memory jb-9 2716M), then start it again",
    'the CALLER\'s words: the holders this caller may VIEW by name (`own`), the others counted and summed, this job\'s bound, the recipe with the verbs', w);
  const wn = M.budgetRefusalWords(v, { id: 'jb-9', named: false });
  ok(wn === "not started: the instance's memory budget for jobs is 9 GB, and 6.3 GB of it is in use by 3 running jobs; this job's bound is 4 GB. To start it: lower this job's bound to 2.7 GB or less (vibespace-job memory jb-9 2716M), or start it again once a running job has ended",
    'the LINE many readers read (`named: false` — the event line, a notice): NO holder named, the count and the sum only (round wh9e7xe8i MUST 1)', wn);
  const wc = M.budgetRefusalWords(v, { create: true });
  ok(wc.startsWith('not created: ') && wc.includes('give it --memory 2716M or less') && !wc.includes('then start it again'), 'a `run` refused: «not created», the recipe gives the --memory to ask', wc);
  const vo = { ...v, holders: v.holders.map((h) => ({ ...h, own: false })), roomMb: 100 };
  const wo = M.budgetRefusalWords(vo, { id: 'jb-9' });
  ok(wo.includes('To start it: wait until one of them ends') && !wo.includes('stop one of the jobs named') && !/job-[abc]/.test(wo), 'no holder this caller may view, no room to lower into: none named, the recipe is to wait — never a verb it cannot use', wo);
  const long = M.budgetRefusalWords({ ...v, holders: [{ id: 'x', name: 'n'.repeat(90), mb: 6500, own: true }] }, { id: 'jb-9' });
  ok(!long.includes('n'.repeat(40)) && long.includes('n'.repeat(39) + '…'), 'a holder\'s name is bounded (40 characters, the model\'s clip) in the agent\'s words', long.length);
}
{
  // r924: WHAT A START IS JUDGED WITH — named: what it names; not named: at most HALF the budget (the bound it RUNS under unchanged)
  const A = (mem, b) => M.budgetAskOf(mem, b);
  ok(same(A({ mb: 3072, source: 'default' }, 3072), { mb: 1536, named: false, halved: true, boundMb: 3072 }), 'budgetAskOf: the DEFAULT bound capped to a 3 GB budget is judged at HALF (1.5 GB); it still runs under 3 GB', A({ mb: 3072, source: 'default' }, 3072));
  ok(A({ mb: 3072, source: 'setting' }, 3072).mb === 1536 && A({ mb: 8192, source: 'cluster' }, 9216).mb === 4608, '…the owner\'s setting («unbounded» capped to the budget) and the cluster\'s the same — none of them is the job naming its memory');
  ok(same(A({ mb: 4096, source: 'job' }, 5376), { mb: 4096, named: true, halved: false, boundMb: 4096 }), 'a job that NAMED 4 GB is judged on 4 GB — even past half the budget (2.6 GB)', A({ mb: 4096, source: 'job' }, 5376));
  ok(same(A({ mb: 4096, source: 'default' }, 9216), { mb: 4096, named: false, halved: false, boundMb: 4096 }), 'a bound already within half the budget is judged on itself (nothing halved, nothing said)', A({ mb: 4096, source: 'default' }, 9216));
  ok(A({ mb: 4096, source: 'default' }, null).mb === 4096, 'no budget (no limit): the bound, untouched');
  ok(same(A(M.memoryMbOf({ memoryMb: 0 }, { instanceMb: 4096 }), 3072), { mb: 1536, named: false, halved: true, boundMb: 3072, unbounded: true }), 'r1033: «NAMED» MEANS A NUMBER — a job whose own memory the person set to «unbounded» (0, capped to the whole budget) is judged at half, like one that names none', A(M.memoryMbOf({ memoryMb: 0 }, { instanceMb: 4096 }), 3072));
  const v = { ...M.budgetVerdict({ nowMs: T0, limitMb: 4096, running: [R('a', 1600)], askedMb: 1536 }), halved: true, boundMb: 3072 };
  const w = M.budgetRefusalWords(v, { id: 'jb-7', named: false });
  ok(w.includes("this job names no memory, so its start is judged at 1.5 GB — half the budget (it would run under 3 GB)") && !w.includes("this job's bound is"), 'the words say what a start was JUDGED with, and the bound it would run under', w);
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
const owner = { conversation: { id: 'conv-budget' }, sessionId: 'sess-b', sessionCreatedAt: 1, createdBy: 'agent', groupsSnapshot: ['grp-g'] };
const caller = { conversationId: 'conv-budget', sessionId: 'sess-b', sessionCreatedAt: 1, groups: new Set(['grp-g']) };
const OTHER = { conversationId: 'conv-other', sessionId: 'sess-o', sessionCreatedAt: 1, groups: new Set(['grp-g']) };   // a groupmate: control by the group grant
const PERSON = { isUser: true, groups: new Set() };
const limitDir = (v) => { const d = fs.mkdtempSync(path.join(TMP, 'lim-')); fs.writeFileSync(path.join(d, 'memory.max'), v + '\n'); return d; };
const MEASURE = new Map();   // THE PLACED MEASURE: job name → MB (absent = the measure answers nothing)
const said = [], delivered = [];   // the For-you filings · the conversation deliveries (the owner notice's road)
function engine(name, { limit, JM = JobManager, ctx = null } = {}) {
  const dir = path.join(TMP, name); fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'bin', 'job-wrapper.js'), STANDIN);
  const jm = new JM({ dataDir: dir, broadcast() { }, log() { }, notifyUser(n) { said.push(n); return { ok: true }; }, deliverToConversation: async (cid, text) => { delivered.push({ cid, text }); return { ok: true, lane: 'message' }; }, groupNotifyFor: () => null, notifyGlobal: () => true, peerReachable: () => true,
    memoryLimitDir: limit, measureJobUse: (job) => (MEASURE.has(job.name) ? MEASURE.get(job.name) : null), ...(ctx ? { memoryCtx: () => ctx } : {}) });
  jm.init(); for (const t of jm._timers || []) clearInterval(t); jm._timers = [];
  return jm;
}
const mk = (jm, name, mem, extra = {}, who = caller) => jm.create({ kind: 'task', name, cmd: { argv: ['sh', '-c', 'sleep 1'], cwd: TMP }, memoryMb: mem, owner, ...extra }, who);
const byName = (jm, n) => [...jm.jobs.values()].find((j) => j.name === n);
// a run ENDED as the sweep would judge it (its scope read empty: nothing of it runs — no doubt holds the next start)
const endRun = (j, state) => { const r = j.runs[j.runs.length - 1]; r.endedAt = Date.now(); r._scopeEmpty = true; j.state = state; };
const evOf = (jm, j) => jm.events.filter((e) => e.jobId === j.id).map((e) => e.what);
// the doors' fact is worked out once a second (_budgetFacts' memo) — a leg reads it as the next answer would, past the memo
const factsOf = (jm, j) => { jm._budgetMemo = null; return jm.snapshot(j).memoryBudget; };
const MB12G = String(12 * 1024 * 1048576);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch { } await sleep(20); } return false; };
let runN = 0;

// THE SCENES — each runs on the real engine AND on the red copies below (a scene is the leg; its rows are judged per engine)
async function noLimitScene(JM) {
  const jn = engine(`no-limit-${++runN}`, { limit: limitDir('max'), JM });
  const made = ['nx', 'ny', 'nz'].map((n) => mk(jn, n, '8G'));
  for (const n of ['nx', 'ny', 'nz']) MEASURE.set(n, 7000);
  await jn._sampleUse();
  const w = mk(jn, 'nw', '8G');
  const snap = (() => { jn._budgetMemo = null; return jn.snapshot(byName(jn, 'nw') || byName(jn, 'nx')); })();
  return { made: made.map((r) => r.error || 'ok'), w: w.error || 'ok', field: 'memoryBudget' in snap, sampled: !!byName(jn, 'nx')._use };
}
const noLimitOk = (r) => r.made.every((x) => x === 'ok') && r.w === 'ok' && !r.field && !r.sampled;
async function idleScene(JM) {
  const ji = engine(`idle-${++runN}`, { limit: limitDir(MB12G), JM });
  mk(ji, 'ia', '4G'); mk(ji, 'ib', '4G');
  MEASURE.set('ia', 100); MEASURE.set('ib', 100);
  await ji._sampleUse();
  const c = mk(ji, 'ic', '4G');
  return { c: c.error || 'ok' };
}
async function privacyScene(JM) {
  const jp = engine(`privacy-${++runN}`, { limit: limitDir(MB12G), JM });
  const secret = mk(jp, 'secret-train', '4G', { access: { view: 'session', control: 'session' } });
  const shared = mk(jp, 'shared-api', '4G', { access: { view: 'group', control: 'session' } });
  const api = mk(jp, 'api', '4G', { access: { view: 'group', control: 'group' } });
  MEASURE.set('secret-train', 4000); MEASURE.set('shared-api', 2000); MEASURE.set('api', 100);
  await jp._sampleUse();
  const j = byName(jp, 'api'); endRun(j, 'done');
  const other = jp.start(j, { caller: OTHER });   // a groupmate starts the owner's job by the group's control grant
  const mine = jp.start(j, { caller });   // the owner conversation
  const ev = evOf(jp, j).filter((w) => /^not started: /.test(w));
  return { made: [secret, shared, api].every((r) => !!r.job), other: other.error || '', otherCode: other.code, mine: mine.error || '', ev };
}
async function pressScene(JM, tag) {
  const name = `press-${tag}-${++runN}`, lim = limitDir(MB12G);
  const j1 = engine(name, { limit: lim, JM });
  mk(j1, 'hog', '4G');
  const sv = j1.create({ kind: 'service', name: 'svc-press', cmd: { argv: ['sh', '-c', 'sleep 1'], cwd: TMP }, memoryMb: '4G', owner }, caller);
  const s1 = sv.job ? j1.jobs.get(sv.job.id) : null;
  if (!s1) return { error: 'the service was not created: ' + JSON.stringify(sv) };
  // the person STOPPED it earlier: down, not wanted up; its last run proven over (persisted — a new engine must not doubt it)
  const r = s1.runs[s1.runs.length - 1]; r.endedAt = Date.now(); r.doubtOver = { by: 'stop', at: Date.now() }; s1.state = 'down'; s1.desiredUp = false; j1._touch(s1); j1._save();
  MEASURE.set('hog', 6000);
  await j1._sampleUse();
  const before = JSON.stringify({ desiredUp: s1.desiredUp, supervise: s1.supervise, state: s1.state, runs: s1.runs.length });
  const press = j1.start(s1, { caller: PERSON });
  const after = JSON.stringify({ desiredUp: s1.desiredUp, supervise: s1.supervise, state: s1.state, runs: s1.runs.length });
  const lock = j1.lockFile;
  j1.shutdown();
  const unlocked = await until(() => !fs.existsSync(lock), 5000);
  const j2 = engine(name, { limit: lim, JM });   // THE NEXT HUB: the same data folder, its boot's replay (nothing measured)
  const s2 = j2.jobs.get(s1.id);
  return { code: press.code, error: press.error || '', same: before === after, before, after, unlocked, readOnly: !!j2.readOnly, state2: s2 && s2.state, runs2: s2 && s2.runs.length, runs1: s1.runs.length };
}
// B-91aa's remainder (r4591): a job's start is ASKED of the starter — «it starts» is a run asked (starting, its ask out) or answered (up)
const asked = (j) => { const run = j && j.runs && j.runs[j.runs.length - 1]; return !!j && (j.state === 'up' || (j.state === 'starting' && !!(run && run.ask))); };
const pressOk = (r) => r.code === 'memory-budget' && r.same && r.unlocked && !r.readOnly && r.state2 === 'down' && r.runs2 === r.runs1;
async function measureScene(JM) {
  // THE REAL MEASURE (no seam): a stand-in wrapper whose child holds 48 MB — its tree's RssAnon read through /proc, the wrapper
  // itself not counted. Two tiny processes for a second, ended by their group
  const jr = engine(`measure-${++runN}`, { limit: limitDir(MB12G), JM });
  const { spawn } = await import('node:child_process');
  const kid = "const b = Buffer.alloc(48 * 1048576, 1); process.stdout.write('ready'); setInterval(() => { b[0]++; }, 1000);";
  const wrap = spawn(process.execPath, ['-e', `require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(kid)}], { stdio: ['ignore', 'inherit', 'ignore'] }); setInterval(() => { }, 1000);`], { detached: true, stdio: ['ignore', 'pipe', 'ignore'] });
  let out = ''; wrap.stdout.on('data', (d) => { out += d; });
  const ready = await until(() => out.includes('ready'), 8000);
  const tj = { id: 'jb-measure-0001', name: 'measured', runs: [{ startedAt: 1700000000000 }] };
  const ctl = jr._ctlDir(tj, tj.runs[0].startedAt); fs.mkdirSync(ctl, { recursive: true });
  fs.writeFileSync(path.join(ctl, 'pid.json'), JSON.stringify({ pid: wrap.pid }));
  let mb = null;
  try { mb = await jr._treeAnonMb(tj); } finally { try { process.kill(-wrap.pid, 'SIGKILL'); } catch { } }
  return { ready, mb, children: fs.existsSync(`/proc/${process.pid}/task/${process.pid}/children`) };
}
// THE DEFERRED PRESS (round wh9e7xe8i + r931): a press answered «it starts once its last run is stopped» (its last run's reap held)
// and refused by the budget LATER — `who` pressed; mode 'edge': the service was wanted-up and down, then Start, Stop, Start
async function deferredScene(JM, mode) {
  const je = engine(`deferred-${mode}-${++runN}`, { limit: limitDir(MB12G), JM });
  mk(je, `hold-${mode}`, '4G');
  const dj = je.create({ kind: 'service', name: `dsvc-${mode}`, cmd: { argv: ['sh', '-c', 'sleep 1'], cwd: TMP }, memoryMb: '1G', owner, access: { view: 'group', control: 'group' } }, caller);
  const ds = dj.job ? je.jobs.get(dj.job.id) : null;
  if (!ds) return { error: dj.error };
  ds.memoryMb = 4096;   // made beside an unmeasured job, its bound raised after: the press asks 4 GB beside 6 GB in use
  const r0 = ds.runs[ds.runs.length - 1]; r0.endedAt = Date.now(); r0._scopeEmpty = true; ds.state = 'down'; ds.desiredUp = mode === 'edge';
  MEASURE.set(`hold-${mode}`, 6000);
  await je._sampleUse();
  const was = JSON.stringify({ desiredUp: ds.desiredUp, supervise: ds.supervise });
  let release; const gate = new Promise((r) => { release = r; });
  je._pending = () => true; je._clearBefore = () => gate;   // the last run's reap, held
  const d0 = delivered.length, s0 = said.length;
  const ans = je.start(ds, { caller: mode === 'agent' ? OTHER : PERSON });
  if (mode === 'edge') { je.stop(ds); je.start(ds, { caller: PERSON }); }   // Start, Stop, Start — all inside the reap
  release(true); await sleep(30);
  delete je._pending; delete je._clearBefore;
  const sent = delivered.slice(d0).filter((x) => x.cid === 'conv-other');
  return { ans, was, after: JSON.stringify({ desiredUp: ds.desiredUp, supervise: ds.supervise }), desiredUp: ds.desiredUp, state: ds.state, copies: said.slice(s0).filter((x) => x.jobId === ds.id && x.fact === 'refused-budget').map((x) => x.words && x.words.params), sent: sent.map((x) => x.text) };
}
const deferredRows = (p, a, e) => [
  ['DEFERRED PRESS (a PERSON): answered «it starts once its last run is stopped», refused by the budget later — the record back as it was, the person told ONCE in the For-you tray («refused-budget», the holders by name)', !!p.ans && p.ans.ok === true && p.after === p.was && p.state === 'down' && p.copies.length === 1 && p.copies[0].budget === '9 GB' && /hold-person 5\.9 GB/.test(p.copies[0].holders)],
  ['DEFERRED PRESS (an AGENT, a groupmate by the control grant — r931): the refusal reaches ITS conversation ONCE by the owner notice\'s road, «not started after all», naming no holder and no context of the owner\'s', !!a.ans && a.ans.ok === true && a.desiredUp === false && a.sent.length === 1 && /not started after all: the memory budget for jobs \(9 GB\) had 5\.9 GB in use by 1 running job; this job asks 4 GB/.test(a.sent[0]) && !/hold-agent|Context you attached/.test(a.sent[0])],
  ['THE UNDO\'S EDGE (r931): wanted-up and down, then Start, Stop, Start inside the reap — the refusal restores what the STOP left (not wanted up): the next boot starts nothing', !!e.ans && e.desiredUp === false && e.state === 'down'],
];
// r1033 (THE MUST): A PRESS THAT NEVER BECAME A PENDING START LEAVES NO PRESS RECORD — a groupmate's Start on a service that is UP is
// answered «already running»; hours later the service (crash-looping since: its live count 3) exits, its automatic restart waits
// behind the reap and the budget refuses it: nobody is told of a press, and the ladder counts on the LIVE count (3 → 4)
async function staleScene(JM) {
  const je = engine(`stale-${++runN}`, { limit: limitDir(MB12G), JM });
  mk(je, 'hold-stale', '4G');
  const sv = je.create({ kind: 'service', name: 'svc-stale', cmd: { argv: ['sh', '-c', 'sleep 1'], cwd: TMP }, memoryMb: '1G', owner, access: { view: 'group', control: 'group' } }, caller);
  const s1 = sv.job ? je.jobs.get(sv.job.id) : null;
  if (!s1) return { error: sv.error };
  s1.memoryMb = 4096;
  const ans = je.start(s1, { caller: OTHER });
  const stale = !!s1._press;
  s1.supervise = { consecutiveFails: 3, parkedAt: null };
  const r = s1.runs[s1.runs.length - 1]; r.endedAt = Date.now(); r._scopeEmpty = true; s1.state = 'down'; s1.desiredUp = true;
  MEASURE.set('hold-stale', 6000);
  await je._sampleUse();
  let release; const gate = new Promise((x) => { release = x; });
  je._pending = () => true; je._clearBefore = () => gate;
  const d0 = delivered.length, s0 = said.length;
  je._startAfter(s1, 'restart-policy', () => s1.desiredUp && s1.state === 'down');
  release(true); await sleep(30);
  delete je._pending; delete je._clearBefore;
  s1.desiredUp = false;   // its ladder's retry timer then finds nothing to start
  return { ans: ans.error || 'ok', stale, fails: s1.supervise && s1.supervise.consecutiveFails, sent: delivered.slice(d0).filter((x) => x.cid === 'conv-other').length, copies: said.slice(s0).filter((x) => x.jobId === s1.id && x.fact === 'refused-budget').length };
}
const staleRows = (r) => [
  ['STALE (r1033): a Start on a service that is UP is answered «already running» and leaves NO press record', /already running/.test(r.ans) && r.stale === false],
  ['STALE (r1033): its later automatic restart, deferred behind the reap and refused by the budget, tells NOBODY of a press (no notice to that agent, no For-you line) and the ladder counts on the LIVE count (3 → 4, never put back)', r.sent === 0 && r.copies === 0 && r.fails === 4],
];
const measureOk = (r) => r.ready && Number.isFinite(r.mb) && r.mb >= 40 && r.mb < 400;

// r924: A START OF A JOB THAT NAMES NO MEMORY IS JUDGED AT MOST AT HALF THE BUDGET
const mkd = (jm, name) => jm.create({ kind: 'task', name, cmd: { argv: ['sh', '-c', 'sleep 1'], cwd: TMP }, owner }, caller);   // no memory named
const LIM4G = String(4 * 1024 * 1048576), LIM7G = String(7 * 1024 * 1048576);
async function askScene(JM) {
  const out = {};
  for (const [tag, ctx] of [['default', null], ['unbounded', { setting: 0 }]]) {
    // a 4 GB pod: the budget (3 GB) is UNDER the default bound (4 GB) — the bound is capped to the whole budget
    const je = engine(`ask-${tag}-${++runN}`, { limit: limitDir(LIM4G), JM, ctx });
    const n1 = `${tag}-1`, n2 = `${tag}-2`, n3 = `${tag}-3`;
    const r1 = mkd(je, n1);
    MEASURE.set(n1, 100);
    await je._sampleUse();
    const r2 = mkd(je, n2);
    MEASURE.set(n1, 1600); MEASURE.set(n2, 100);
    await je._sampleUse();
    const r3 = mkd(je, n3);
    const snap = factsOf(je, byName(je, n1));
    out[tag] = { first: r1.error || 'ok', second: r2.error || 'ok', third: r3.error || 'ok', bound: byName(je, n1) && byName(je, n1).runs[0].memoryMb, snap };
  }
  // a 7 GB pod (budget 5.25 GB, half 2.6 GB): one job using 2 GB — a job that NAMED 4 GB is judged on 4 GB; one that names none on half
  const j7 = engine(`ask-named-${++runN}`, { limit: limitDir(LIM7G), JM });
  mkd(j7, 'w-1'); MEASURE.set('w-1', 2000);
  await j7._sampleUse();
  const named = mk(j7, 'named-4g', '4G'), unnamed = mkd(j7, 'w-2');
  out.named = { named: named.error || 'ok', unnamed: unnamed.error || 'ok' };
  // r1033: a job whose OWN memory the person set to «unbounded» (the person alone may) — the 4 GB pod again
  const ju = engine(`ask-own0-${++runN}`, { limit: limitDir(LIM4G), JM });
  const own0 = (n) => ju.create({ kind: 'task', name: n, cmd: { argv: ['sh', '-c', 'sleep 1'], cwd: TMP }, memoryMb: 0, owner }, PERSON);
  mkd(ju, 'o-1'); MEASURE.set('o-1', 100);
  await ju._sampleUse();
  const o2 = own0('o-own0');
  MEASURE.set('o-1', 1600); MEASURE.set('o-own0', 100);
  await ju._sampleUse();
  const o3 = own0('o-own0-b');
  out.own0 = { second: o2.error || 'ok', third: o3.error || 'ok' };
  return out;
}
const askRowsBase = (r) => [
  ['ASK: a 4 GB pod (budget 3 GB, under the default bound): the SECOND job that names no memory STARTS beside the first using 100 MB (judged at half: 1.5 GB) — it runs under its full bound (3 GB)', r.default.first === 'ok' && r.default.second === 'ok' && r.default.bound === 3072],
  ['ASK: …and a THIRD is refused once the measured use (1.7 GB) plus half the budget passes it — the words say what it was judged with', /^not created: .*this job names no memory, so its start is judged at 1\.5 GB — half the budget \(it would run under 3 GB\)/.test(r.default.third)],
  ['ASK: the owner\'s «UNBOUNDED» setting the same (its bound capped to the whole budget): the second starts, the third is refused', r.unbounded.first === 'ok' && r.unbounded.second === 'ok' && /^not created: .*judged at 1\.5 GB/.test(r.unbounded.third)],
  ['ASK: a job that NAMED 4 GB is judged on 4 GB (refused beside 2 GB on a 5.25 GB budget); one that names none starts (judged at 2.6 GB)', /^not created: .*this job's bound is 4 GB\./.test(r.named.named) && r.named.unnamed === 'ok'],
  ['ASK: the doors\' fact for such a job: its start is judged at half the budget (askMb 1536, askHalf)', !!r.default.snap && r.default.snap.askHalf === true && r.default.snap.askMb === 1536],
];
const askRows = (r) => [...askRowsBase(r), ...askMore(r)];
const askMore = (r) => [['ASK (r1033): a job whose OWN memory the person set to «unbounded» names no number — judged at half like one that names none: the second starts, the third is refused and its words say so', r.own0.second === 'ok' && /its own memory is set to unbounded: no number\), so its start is judged at 1\.5 GB — half the budget \(it would run under 3 GB\)/.test(r.own0.third)]];
const ASK_HALF_ROWS = [0, 2, 3, 5];   // the rows a copy that asks the WHOLE bound turns red (row 3 by its unnamed half)

// ── the real engine ──
{
  const r = await askScene(JobManager);
  for (const [n, c] of askRows(r)) ok(c, n, r);
}
{
  const r = await noLimitScene(JobManager);
  ok(noLimitOk(r), 'CONTROL «nothing changes without a limit» (memory.max = max, the owner\'s box): four 8 GB jobs beside 21 GB in use all start, nothing is sampled, NO budget field in the snapshot', r);
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
  ok(!c.job && c.code === 'memory-budget' && c.error.startsWith("not created: the instance's memory budget for jobs is 9 GB, and 5.9 GB of it is in use by 2 running jobs (a 2.9 GB, b 2.9 GB)") && c.error.includes('give it --memory 3216M or less') && jm.jobs.size === n0 && same(c.budget.holders.map((h) => h.own), [true, true]),
    'a `run` past the budget (5.9 GB used + 4 GB > 9 GB): refused by name — the holders its caller may view, the recipe — and NOTHING is created', c);
  const r = await idleScene(JobManager);
  ok(r.c === 'ok', 'two jobs IDLE (100 MB each, 4 GB bounds): a third 4 GB job starts — their bounds (8 GB) are never counted (the ruling)', r);
  MEASURE.set('a', 100); MEASURE.set('b', 100);
  await jm._sampleUse();
  const c2 = mk(jm, 'c2', '4G');
  const svc = jm.create({ kind: 'service', name: 'svc', cmd: { argv: ['sh', '-c', 'sleep 1'], cwd: TMP }, memoryMb: '4G', owner }, caller);
  const sj = svc.job ? jm.jobs.get(svc.job.id) : null;
  for (const n of ['a', 'b', 'c2']) MEASURE.set(n, 3000);
  MEASURE.set('svc', 100);
  await jm._sampleUse();
  // a stopped task started again by its owner conversation: refused, its record exactly as it was
  const d = byName(jm, 'a'); endRun(d, 'done');
  const before = JSON.stringify({ state: d.state, runs: d.runs.length, desiredUp: d.desiredUp, supervise: d.supervise });
  const sr = jm.start(d, { caller });
  ok(!!c2.job && sr.code === 'memory-budget' && /^not started: /.test(sr.error) && sr.error.endsWith(', then start it again') && !!sr.budget && JSON.stringify({ state: d.state, runs: d.runs.length, desiredUp: d.desiredUp, supervise: d.supervise }) === before && evOf(jm, d).some((w) => /^not started: .* \(manual\)$/.test(w)),
    'a START past the budget: refused by name (the code + the facts the panel words), the record EXACTLY as it was (state, runs, wanted-up, supervision), the refusal on its events', { sr, state: d.state, runs: d.runs.length });
  for (const n of ['b', 'c2', 'svc']) byName(jm, n)._use.at = Date.now() - 20000;
  const sr2 = jm.start(d, { caller });
  ok(!sr2.error && asked(d), 'the same start once the measures are older than 15 s: NOT judged — it starts (a stale measure is no measure)', { sr2, state: d.state });
  endRun(d, 'done');
  await jm._sampleUse();
  // a schedule's fires past the budget: each fire skipped and said; ONE alarm a stretch of skips; the schedule kept
  const cron = jm.create({ kind: 'cron', name: 'nightly', schedule: { everyMs: 3600e3 }, action: { type: 'spawn-task', task: { cmd: { argv: ['sh', '-c', 'true'], cwd: TMP }, memoryMb: '4G' } }, owner }, caller);
  const cj = jm.jobs.get(cron.job.id), next0 = cj.nextFireAt;
  jm._fireCron(cj, 'cron'); jm._fireCron(cj, 'cron'); jm._fireCron(cj, 'cron');
  const child = [...jm.jobs.values()].find((j) => j.cronParent === cj.id);
  const cev = jm.events.filter((e) => e.jobId === cj.id && /^fire skipped/.test(e.what));
  ok(cev.length === 3 && cev.filter((e) => e.alarm).length === 1 && /fire skipped again \(3 in a row\) — not started: the instance's memory budget/.test(cev[2].what) && cj.nextFireAt === next0 && cj.state === 'scheduled' && cj.desiredUp === true && !!child && child.state === 'missed' && child.runs.length === 0,
    'a SCHEDULE\'s fires past the budget: each skipped and said on the schedule, ONE alarm for the stretch (round wh9e7xe8i), the schedule on, its next fire as it was', { ev: cev.map((e) => (e.alarm ? '! ' : '') + e.what.slice(0, 60)), next: cj.nextFireAt === next0, state: cj.state, child: child && child.state });
  // a service's automatic restarts past the budget: counted on its ladder, then parked — the park and its For-you copy name the budget
  let ladder = null;
  if (sj) {
    endRun(sj, 'down'); sj.desiredUp = true;
    for (let i = 0; i < M.SUPERVISE.failCap; i++) { try { jm._startAfter(sj, 'restart-policy', () => sj.desiredUp && sj.state === 'down'); } catch (e) { if (e && e.code === 'memory-budget') jm._budgetLadder(sj, e); } }
    const copy = said.filter((n) => n.jobId === sj.id && n.fact === 'parked-budget');
    ladder = { state: sj.state, fails: sj.supervise && sj.supervise.consecutiveFails, runs: sj.runs.length, parks: evOf(jm, sj).filter((w) => /^parked: not restarted/.test(w)), copies: copy.length, params: copy[0] && copy[0].words && copy[0].words.params, crashLoop: said.some((n) => n.jobId === sj.id && n.fact === 'parked') };
  }
  ok(!!ladder && ladder.state === 'failed' && ladder.fails === M.SUPERVISE.failCap && ladder.runs === 1 && ladder.parks.length === 1 && /the instance's memory budget/.test(ladder.parks[0]) && !/\b(a|b|c2) 2\.9 GB/.test(ladder.parks[0]),
    `a SERVICE's automatic restarts past the budget count on its ladder: ${M.SUPERVISE.failCap} refused ⇒ PARKED (no run started); the park's LINE names the budget and no holder (its subscribers read it)`, ladder || svc);
  ok(!!ladder && ladder.copies === 1 && !ladder.crashLoop && ladder.params && ladder.params.budget === '9 GB' && /^(a|b|c2) 2\.9 GB, (a|b|c2) 2\.9 GB/.test(ladder.params.holders || '') && ladder.params.count === String(M.SUPERVISE.failCap),
    '…and the PERSON\'s For-you copy is the budget\'s own («parked-budget»: the budget and its holders by name — the person views every job) — never «crash-looped»', ladder && { copies: ladder.copies, crashLoop: ladder.crashLoop, params: ladder.params });
  const pol = read('src/jobs.js');
  ok((pol.match(/catch \((e2?)\) \{ if \(\1 && \1\.code === 'memory-budget'\) this\._budgetLadder\(job, \1\); \}/g) || []).length === 2 && pol.includes("          if (job.kind === 'service' && trigger !== 'manual') this._budgetLadder(job, e);") && pol.includes("} catch (e) { if (e && e.code === 'memory-budget' && job.kind === 'service' && job.state === 'down' && job.desiredUp) this._budgetLadder(job, e); else this.d.log(`[jobs] ${trigger} start of ${job.id} made again"),
    'WIRING: every automatic restart hands a budget refusal to the ladder — the policy\'s timer, the ladder\'s own retry, a start DEFERRED behind its reap, the landing retry (round wh9e7xe8i: the third swallow)');
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
// MUST 1 (round wh9e7xe8i): PRIVACY BETWEEN CONVERSATIONS — a holder is NAMED only to a reader who may view it
const privacyRows = (r) => [
  ['PRIVACY: a GROUPMATE starting the owner\'s job (control by the group grant) is refused with the holders IT may view by name (shared-api) and the one it may not COUNTED, never named (secret-train)', r.made && r.otherCode === 'memory-budget' && r.other.includes('shared-api 2 GB') && !r.other.includes('secret-train') && r.other.includes('1 of other conversations 3.9 GB')],
  ['PRIVACY: the job\'s EVENT LINE (every subscriber of the job reads it) names NO holder — the count and the sum', r.ev.length >= 1 && r.ev.every((w) => !/secret-train|shared-api/.test(w) && / in use by 2 running jobs; /.test(w))],
  ['PRIVACY: the OWNER conversation starting it is told both by name (it views both)', r.mine.includes('secret-train 3.9 GB') && r.mine.includes('shared-api 2 GB')],
];
const PRIV_ROWS = privacyRows({ made: true, otherCode: '', other: '', mine: '', ev: [] }).map(([n]) => n);
{
  const r = await privacyScene(JobManager);
  for (const [n, c] of privacyRows(r)) ok(c, n, r);
}
// MUST 2 (round wh9e7xe8i): A REFUSED PRESS IS NOT UNDONE — the next hub's boot must not start what the person was told was not started
{
  const r = await pressScene(JobManager, 'real');
  ok(pressOk(r), 'A REFUSED PRESS LEAVES THE RECORD AS IT WAS: a person\'s Start of a stopped 4 GB service beside 6 GB in use is refused, the service stays not-wanted-up — and the NEXT hub over the same data folder (its boot replay, nothing measured) does not start it', r);
}
// THE DEFERRED PRESSES
const DEF_ROWS = deferredRows({}, {}, {}).map(([n]) => n);
{
  const r = [await deferredScene(JobManager, 'person'), await deferredScene(JobManager, 'agent'), await deferredScene(JobManager, 'edge')];
  for (const [n, c] of deferredRows(...r)) ok(c, n, r);
}
{
  const r = await staleScene(JobManager);
  for (const [n, c] of staleRows(r)) ok(c, n, r);
}
// THE REAL MEASURE (round wh9e7xe8i: the seam replaced it everywhere)
{
  const r = await measureScene(JobManager);
  ok(measureOk(r), `THE REAL MEASURE: a stand-in wrapper's child holding 48 MB reads ${r.mb} MB — its tree's RssAnon through /proc (the wrapper not counted; pid.json read off the loop)`, r);
}

console.log('§2b RED copies of src/jobs.js');
const SPAWN_VERDICT = '{ const bv = this._budgetVerdict(job, M.memoryMbOf(job, this._memoryCtx({ hub: true })), caller); if (bv.refused) throw this._budgetRefusal(job, bv, trigger, caller); }';
{
  const JX = MJ.load('src/jobs.js', anchored(read('src/jobs.js'), SPAWN_VERDICT, '{ /* MUTANT: no budget at the start */ }', 'the start\'s budget verdict'), 'no-budget');
  const jx = engine('pod-mut', { limit: limitDir(MB12G), JM: JX.JobManager });
  mk(jx, 'p', '4G'); mk(jx, 'q', '4G'); mk(jx, 'r', '1G');
  MEASURE.set('p', 3000); MEASURE.set('q', 3000); MEASURE.set('r', 100);
  await jx._sampleUse();
  const r = byName(jx, 'p'); endRun(r, 'done');
  const sr = jx.start(r, { caller });
  ok(!sr.error && asked(r), 'CONTROL (no verdict at the start, in a copy): the start past the budget GOES — the verdict line is what refuses it', { sr, state: r.state });
}
{
  const JX = MJ.load('src/jobs.js', anchored(read('src/jobs.js'), '    const ask = M.budgetAskOf(mem, M.budgetMbOf(lim && lim.mb));', '    const ask = { mb: Number(mem && mem.mb) || 0, named: true, halved: false, boundMb: Number(mem && mem.mb) || 0 };   /* MUTANT: the whole bound (the round\'s tip) */', 'what a start is judged with'), 'ask-whole');
  const r = await askScene(JX.JobManager);
  const red = askRows(r).map(([n, c], i) => (c ? null : i)).filter((i) => i !== null);
  ok(ASK_HALF_ROWS.every((i) => red.includes(i)), 'CONTROL (the start judged with the WHOLE bound, in a copy — the tip before r924): the second job that names no memory is REFUSED beside one using 100 MB; the ask rows go red', { red, second: r.default.second });
}
{
  const JX = MJ.load('src/jobs.js', anchored(read('src/jobs.js'), 'use: j._use || null,', 'use: { mb: Number((j.runs[j.runs.length - 1] || {}).memoryMb) || 0, at: now() },   /* MUTANT: judged on BOUNDS */', 'the verdict\'s measure'), 'on-bounds');
  const r = await idleScene(JX.JobManager);
  ok(r.c !== 'ok' && /not created/.test(r.c), 'CONTROL (judged on the running jobs\' BOUNDS, in a copy): the third job beside two IDLE ones is refused — the idle leg is what catches it', r);
}
{
  let src = anchored(read('src/jobs.js'), '    if (!lim || !lim.mb) return;\n    const running = [...this.jobs.values()].filter((j) => this._holdsBudget(j) && !j._walking);', '    const running = [...this.jobs.values()].filter((j) => this._holdsBudget(j) && !j._walking);   /* MUTANT: sampled with no limit */', 'the sampler\'s no-limit door');
  src = anchored(src, 'M.budgetVerdict({ limitMb: lim && lim.mb, running, askedMb: ask.mb, nowMs: now() })', 'M.budgetVerdict({ limitMb: (lim && lim.mb) || 16384, running, askedMb: ask.mb, nowMs: now() })   /* MUTANT: a guessed limit */', 'the verdict\'s limit');
  const JX = MJ.load('src/jobs.js', src, 'no-limit-guessed');
  const r = await noLimitScene(JX.JobManager);
  ok(!noLimitOk(r) && r.w !== 'ok', 'CONTROL (a machine with no limit judged against a GUESSED one, in a copy): the fourth 8 GB job is refused — the no-limit leg catches it', r);
}
{
  const JX = MJ.load('src/jobs.js', anchored(read('src/jobs.js'), 'own: caller ? M.canView(j, caller) : false', 'own: M.isOwner(j, M.ownerAsCaller(job))   /* MUTANT: named against the job\'s owner */', 'the holder\'s «own»'), 'own-by-owner');
  const r = await privacyScene(JX.JobManager);
  const red = privacyRows(r).filter(([, c]) => !c).map(([n]) => n);
  ok(same(red, [PRIV_ROWS[0]]), 'CONTROL (a holder named when the JOB\'s owner may view it, in a copy — the release candidate\'s fault): exactly the groupmate\'s row goes red', red);
}
{
  const JX = MJ.load('src/jobs.js', anchored(read('src/jobs.js'), '    const line = M.budgetRefusalWords(v, { id, named: false });', '    const line = M.budgetRefusalWords(v, { id });   /* MUTANT: the event line named */', 'the event line\'s words'), 'line-named');
  const r = await privacyScene(JX.JobManager);
  const red = privacyRows(r).filter(([, c]) => !c).map(([n]) => n);
  ok(red.includes(PRIV_ROWS[1]), 'CONTROL (the event line worded with names, in a copy): the event-line row goes red', red);
}
{
  const JX = MJ.load('src/jobs.js', anchored(read('src/jobs.js'), '    job.desiredUp = p.was.desiredUp; job.supervise = p.was.supervise;\n', '    /* MUTANT: the press\'s writes kept */\n', 'the refused press\'s undo'), 'press-kept');
  const r = await pressScene(JX.JobManager, 'mut');
  ok(!pressOk(r) && ['up', 'starting'].includes(r.state2) && r.runs2 === r.runs1 + 1, 'CONTROL (a refused press\'s writes KEPT, in a copy): the next hub\'s boot replay STARTS the service the person was told was not started — the press leg catches it', r);
}
{
  const JX = MJ.load('src/jobs.js', anchored(read('src/jobs.js'), '          if (pr) this._tellRefused(job, e, pr.by);\n', '          /* MUTANT: the pressers not told */\n', 'the deferred press\'s telling'), 'not-told');
  const r = [await deferredScene(JX.JobManager, 'person'), await deferredScene(JX.JobManager, 'agent'), await deferredScene(JX.JobManager, 'edge')];
  const red = deferredRows(...r).filter(([, c]) => !c).map(([n]) => n);
  ok(same(red, DEF_ROWS.slice(0, 2)), 'CONTROL (a deferred press refused later told to nobody, in a copy): the person\'s and the agent\'s rows go red — the edge row stays green', red);
}
{
  const JX = MJ.load('src/jobs.js', anchored(read('src/jobs.js'), '    job.desiredUp = true;\n    job.supervise = { consecutiveFails: 0, parkedAt: null };\n    // lane jobs-memory-bound: the owner acted', '    joinPress();   /* MUTANT: the record made before the returns (75f566aad) */\n    job.desiredUp = true;\n    job.supervise = { consecutiveFails: 0, parkedAt: null };\n    // lane jobs-memory-bound: the owner acted', 'where the press record is made'), 'record-before-returns');
  const r = await staleScene(JX.JobManager);
  const red = staleRows(r).filter(([, c]) => !c).length;
  ok(red === 2 && r.stale === true && r.sent === 1 && r.fails !== 4, 'CONTROL (the press record made before the returns, in a copy — 75f566aad): «already running» leaves a record; the later refusal undoes it (the count put back) and wakes that agent with «not started after all»', r);
}
{
  const JX = MJ.load('src/jobs.js', anchored(read('src/jobs.js'), '    delete job._press;   // B-b14a r931: a Stop ends the presses waiting on a start', '    /* MUTANT: a Stop keeps the first press\'s snapshot */   // B-b14a r931: a Stop ends the presses waiting on a start', 'the Stop\'s end of the press record'), 'stop-keeps-press');
  const r = await deferredScene(JX.JobManager, 'edge');
  ok(!deferredRows({}, {}, r)[2][1] && r.desiredUp === true, 'CONTROL (a Stop that keeps the first press\'s snapshot, in a copy): the refusal puts wanted-up back to TRUE over the person\'s Stop — the edge row goes red', r);
}
{
  const JX = MJ.load('src/jobs.js', anchored(read('src/jobs.js'), '      for (const k of (await rd(`/proc/${pid}/task/${pid}/children`)).trim().split(/\\s+/).filter(Boolean)) await walk(k, false);', '      /* MUTANT: the walk never descends */', 'the measure\'s walk'), 'no-descent');
  const r = await measureScene(JX.JobManager);
  ok(!measureOk(r) && r.mb === 0, 'CONTROL (a walk that never leaves the wrapper, in a copy): the measure reads 0 — the real-measure leg catches it', r);
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
  // r924: the doors say what a start of a job that names no memory is judged with
  const half = L.budgetWords(j({ budgetMb: 3072, running: 1, usedMb: 100, askMb: 1536, askHalf: true }), en);
  ok(half === 'The instance’s memory budget for jobs: 3 GB — 100 MB in use by 1 running job(s) · This job names no memory: its start is judged at 1.5 GB, half the budget', 'the doors\' fact for a job that names no memory: what its start is judged with', half);
  const hb = { budgetMb: 3072, usedMb: 1700, askedMb: 1536, roomMb: 1372, halved: true, boundMb: 3072, holders: [{ id: 'a', name: 'build', mb: 1600 }, { id: 'b', name: 'api', mb: 100 }] };
  ok(L.budgetRefusalPersonWords(hb, en).endsWith('this job asks 1.5 GB. Stop one of them, or lower this job’s memory bound to 1.3 GB or less. This job names no memory: its start is judged at 1.5 GB, half the budget — it would run under 3 GB.'), 'the PERSON\'s refusal of such a job says it was judged at half the budget and the bound it would run under', L.budgetRefusalPersonWords(hb, en));
  const hk = ['This job names no memory: its start is judged at {ask}, half the budget', 'This job names no memory: its start is judged at {ask}, half the budget — it would run under {bound}.'];
  ok(hk.every((k) => typeof ZH[k] === 'string' && typeof JA[k] === 'string' && holes(ZH[k]) === holes(k) && holes(JA[k]) === holes(k)) && L.budgetWords(j({ budgetMb: 3072, running: 1, usedMb: 100, askMb: 1536, askHalf: true }), zh).includes('此任务未指定内存：它的启动按预算的一半 1.5 GB 来判断'), 'both sentences in zh and ja, every {hole} kept', hk.filter((k) => !ZH[k] || !JA[k]));
  const panel = read('src/lib/jobs-panel.js'), wiring = read('src/server/jobs-wiring.js');
  ok(panel.includes("mc.title = [j.memoryBound?.why || '', budgetWords(j, t)].filter(Boolean).join(' · ');") && panel.includes('memBudget.textContent = budgetWords(job, t);') && panel.includes('memRow.append(memLbl, memIn, memSet, memFact, memEff, memHeap, memBudget);'),
    'WIRING: the doors — the card chip\'s title and the Memory bound row carry the budget\'s fact');
  ok(panel.includes("if (r?.error && r.code === 'memory-budget' && r.budget) r.error = budgetRefusalPersonWords(r.budget, t);") && panel.includes("if (r?.error && r.code === 'memory-budget' && r.budget) r.error = budgetRefusalPersonWords(r.budget, t, { create: true });") && (wiring.match(/\.\.\.\(r\.budget \? \{ budget: r\.budget \} : \{\}\)/g) || []).length === 2,
    'WIRING: a person\'s press (Start / Restart) and a create are attended in the reader\'s language — the routes hand the code and the facts');
}
for (const r of copiesCensus(MJ.files, MJ.dir, REPO, { minCopies: 2, label: 'B-b14a ' })) ok(r.pass === true, r.name + (r.pass ? '' : ' — ' + r.detail));
report();

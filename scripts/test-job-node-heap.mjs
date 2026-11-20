#!/usr/bin/env node
// test-job-node-heap — B-d73c: A JOB'S NODE HEAP FOLLOWS THE MEMORY IT NAMES (the coordinator's ruling of 2026-11-20: shape A for a
// job that names its memory, B's sentence for the rest). MEASURED (a probe in real jobs through the kit): Node reads the job's own
// bound as its constrained memory and V8 caps its DEFAULT old space at 2 GB under 15 GB of memory — 2 240 MB for 4G and 8G alike.
// Fast, in-process:
//   §1 PURE src/job-model.js nodeHeapOf / withNodeHeap: the table (own · bound · node-default · none), the job's own options kept
//      whole, its own heap flag wins — and a RED copy that gives a heap to a job that names no memory (a default changed)
//   §2 THE ENV THE REAL SPAWN HANDS THE WRAPPER: the real JobManager, a stand-in wrapper that keeps a copy of its spec and exits —
//      a named bound hands the flag beside the job's own options; a job that names NO memory hands on NO heap flag (the control
//      for «no default changed»); nothing else in the env changes; a schedule's run; the snapshot's fact — and a RED copy of
//      src/jobs.js whose spawn hands nothing (the flag is the spawn line's)
//   §3 the card's words (src/lib/jobs-layout.js nodeHeapWords) in en, zh and ja — each CONDITIONAL on a Node program in the job —
//      and the panel's row. The CLI's line (`show`) is driven in scripts/test-jobs-cli-body.mjs (heavy: it starts the real CLI —
//      round wrpdo2eev 6). Round wrpdo2eev: a quoted own heap (§1), the card and the spawn read ONE number (§2)
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
const TMP = scratch('job-node-heap');
fs.mkdirSync(TMP, { recursive: true });
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch { } await sleep(15); } return false; };

// ════════ §1 THE PURE RULE ════════
console.log('§1 PURE — nodeHeapOf / withNodeHeap');
function ruleRows(X) {
  const h = (o) => X.nodeHeapOf(o);
  return [
    ['a named 4G bound: Node gets 75% of it (3072 MB)', same(h({ boundMb: 4096, source: 'job' }), { by: 'bound', mb: 3072 })],
    ['a named 8G bound: 6144 MB', same(h({ boundMb: 8192, source: 'job' }), { by: 'bound', mb: 6144 })],
    ['a named 16G bound: 12288 MB (past Node\'s own 4 GB)', same(h({ boundMb: 16384, source: 'job' }), { by: 'bound', mb: 12288 })],
    ['the job\'s own NODE_OPTIONS name a heap: theirs wins (4096), whatever the bound', same(h({ boundMb: 8192, source: 'job', nodeOptions: '--enable-source-maps --max-old-space-size=4096' }), { by: 'own', mb: 4096 })],
    ['…in V8\'s other spellings too (underscores, a space)', same(h({ boundMb: 8192, source: 'job', nodeOptions: '--max_old_space_size 5000' }), { by: 'own', mb: 5000 })],
    ['…and written INSIDE QUOTES (Node\'s quoted form) — still its own, never overridden (round wrpdo2eev 5)', same(h({ boundMb: 8192, source: 'job', nodeOptions: '--enable-source-maps "--max-old-space-size=4096"' }), { by: 'own', mb: 4096 }) && same(h({ boundMb: 8192, source: 'job', nodeOptions: "'--max-old-space-size=4096'" }), { by: 'own', mb: 4096 })],
    ['a bound the job did NOT name (the ladder\'s default 4 GB): Node\'s own default, about 2048 MB — nothing handed', same(h({ boundMb: 4096, source: 'default' }), { by: 'node-default', mb: 2048 })],
    ['…the owner\'s setting or the cluster\'s are no job\'s naming either', h({ boundMb: 8192, source: 'setting' }).by === 'node-default' && h({ boundMb: 8192, source: 'cluster' }).by === 'node-default'],
    ['Node\'s own default: half the bound, at most 2048 MB under 15 GB (8G: 2048), 4096 MB from 15 GB on (16G: 4096); 2G: 1024', h({ boundMb: 8192, source: 'default' }).mb === 2048 && h({ boundMb: 16384, source: 'setting' }).mb === 4096 && h({ boundMb: 15360, source: 'setting' }).mb === 4096 && h({ boundMb: 2048, source: 'default' }).mb === 1024],
    ['unbounded (0): nothing — Node\'s default for the machine', same(h({ boundMb: 0, source: 'job' }), { by: 'none', mb: null })],
    ['withNodeHeap: the flag alone when the job has no NODE_OPTIONS', same(X.withNodeHeap({ A: '1' }, { by: 'bound', mb: 3072 }), { A: '1', NODE_OPTIONS: '--max-old-space-size=3072' })],
    ['withNodeHeap: the job\'s own options kept WHOLE, the flag beside them', same(X.withNodeHeap({ NODE_OPTIONS: ' --enable-source-maps ' }, { by: 'bound', mb: 6144 }), { NODE_OPTIONS: '--enable-source-maps --max-old-space-size=6144' })],
    ['withNodeHeap: a job that names no memory hands on NO flag (its env as it was)', same(X.withNodeHeap({ A: '1' }, X.nodeHeapOf({ boundMb: 4096, source: 'default' })), { A: '1' })],
    ['withNodeHeap: a heap of its own — its options untouched', same(X.withNodeHeap({ NODE_OPTIONS: '--max-old-space-size=4096' }, X.nodeHeapOf({ boundMb: 8192, source: 'job', nodeOptions: '--max-old-space-size=4096' })), { NODE_OPTIONS: '--max-old-space-size=4096' })],
  ];
}
const NO_DEFAULT_ROWS = ['a bound the job did NOT name (the ladder\'s default 4 GB): Node\'s own default, about 2048 MB — nothing handed', '…the owner\'s setting or the cluster\'s are no job\'s naming either',
  'Node\'s own default: half the bound, at most 2048 MB under 15 GB (8G: 2048), 4096 MB from 15 GB on (16G: 4096); 2G: 1024', 'withNodeHeap: a job that names no memory hands on NO flag (its env as it was)'];
for (const [n, c] of ruleRows(M)) ok(c, n);
const MJ = mutantCopies('job-node-heap', REPO);
{
  const X = MJ.load('src/job-model.js', anchored(read('src/job-model.js'), "  if (source === 'job') return { by: 'bound', mb: Math.floor(b * NODE_HEAP.share) };", "  return { by: 'bound', mb: Math.floor(b * NODE_HEAP.share) };   /* MUTANT: every bound hands a heap */", 'the rule\'s «names its memory»'), 'every-bound');
  const red = ruleRows(X).filter(([, c]) => !c).map(([n]) => n);
  ok(same(red.sort(), [...NO_DEFAULT_ROWS].sort()), `CONTROL (every bound hands a heap, in a copy): exactly the ${NO_DEFAULT_ROWS.length} «no default changed» rows go red`, red);
}

// ════════ §2 THE ENV THE REAL SPAWN HANDS THE WRAPPER ════════
console.log('§2 the env the real spawn hands the wrapper (the real JobManager, a stand-in wrapper that keeps its spec)');
// the copy lands under its final name WHOLE (a tmp name, then rename): a reader polling for the name never reads a half-written file
// (the first cure gate's UTC red: copyFileSync creates the name before its bytes — the leg read an empty file as «null»)
const STANDIN = "const fs = require('fs'), path = require('path'); const [ctl, spec] = process.argv.slice(2); const out = path.join(ctl, 'spec-seen.json'); try { fs.copyFileSync(spec, out + '.tmp'); fs.renameSync(out + '.tmp', out); fs.unlinkSync(spec); } catch (e) { fs.writeFileSync(out + '.tmp', JSON.stringify({ error: e.message })); fs.renameSync(out + '.tmp', out); }\n";
const owner = { conversation: { id: 'conv-heap' }, sessionId: 'sess-heap', sessionCreatedAt: 1, createdBy: 'agent', groupsSnapshot: [] };
const caller = { conversationId: 'conv-heap', sessionId: 'sess-heap', sessionCreatedAt: 1, groups: new Set() };
function engine(name, JM = JobManager) {
  const dir = path.join(TMP, name); fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'bin', 'job-wrapper.js'), STANDIN);
  const jm = new JM({ dataDir: dir, broadcast() { }, log() { }, notifyUser() { return { ok: true }; }, deliverToConversation: async () => ({ ok: true, lane: 'message' }), groupNotifyFor: () => null, notifyGlobal: () => true, peerReachable: () => true });
  jm.init(); for (const t of jm._timers || []) clearInterval(t); jm._timers = [];
  return jm;
}
const specOf = async (jm, j) => { const run = j.runs[j.runs.length - 1]; const f = path.join(path.dirname(run.log), 'spec-seen.json'); await until(() => fs.existsSync(f), 8000); try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const mk = (jm, name, { mem, env } = {}) => { const r = jm.create({ kind: 'task', name, cmd: { argv: ['node', '-e', '0'], cwd: TMP, ...(env ? { env } : {}) }, ...(mem ? { memoryMb: mem } : {}), owner }, caller); if (!r.job) throw new Error('create: ' + JSON.stringify(r)); return jm.jobs.get(r.job.id); };
const jm = engine('jobs');
{
  const named4 = mk(jm, 'named-4g', { mem: '4G' }), named8 = mk(jm, 'named-8g-own', { mem: '8G', env: { NODE_OPTIONS: '--enable-source-maps', LANG_HINT: 'x' } });
  const ownHeap = mk(jm, 'own-heap', { mem: '4G', env: { NODE_OPTIONS: '--max-old-space-size=4096' } }), unnamed = mk(jm, 'unnamed'), unnamedOwn = mk(jm, 'unnamed-own', { env: { NODE_OPTIONS: '--enable-source-maps' } });
  const [s4, s8, sOwn, sU, sUO] = await Promise.all([named4, named8, ownHeap, unnamed, unnamedOwn].map((j) => specOf(jm, j)));
  ok(!!s4 && s4.env.NODE_OPTIONS === '--max-old-space-size=3072', 'a job that NAMED 4G: the spawn hands --max-old-space-size=3072 (75% of it)', s4 && s4.env.NODE_OPTIONS);
  ok(!!s8 && s8.env.NODE_OPTIONS === '--enable-source-maps --max-old-space-size=6144' && s8.env.LANG_HINT === 'x', 'a job that NAMED 8G with options of its own: they are kept whole, the flag beside them (6144); its other env kept', s8 && { NODE_OPTIONS: s8.env.NODE_OPTIONS, LANG_HINT: s8.env.LANG_HINT });
  ok(!!sOwn && sOwn.env.NODE_OPTIONS === '--max-old-space-size=4096', 'a job whose own options name a heap: theirs wins, nothing added', sOwn && sOwn.env.NODE_OPTIONS);
  ok(!!sU && !('NODE_OPTIONS' in sU.env), 'CONTROL «no default changed»: a job that names NO memory hands on NO heap flag — no NODE_OPTIONS at all, as today', sU && Object.keys(sU.env).filter((k) => /NODE/.test(k)));
  ok(!!sUO && sUO.env.NODE_OPTIONS === '--enable-source-maps', '…and one with options of its own hands exactly those', sUO && sUO.env.NODE_OPTIONS);
  const keys = (s) => Object.keys((s && s.env) || {}).filter((k) => k !== 'NODE_OPTIONS').sort();
  ok(!!s4 && !!sU && same(keys(s4), keys(sU)), 'nothing else in the env changes: the named and the unnamed job hand the same keys beside NODE_OPTIONS', { named: keys(s4), unnamed: keys(sU) });
  const sn4 = jm.snapshot(named4), snU = jm.snapshot(unnamed), snO = jm.snapshot(ownHeap);
  ok(same(sn4.nodeHeap, { by: 'bound', mb: 3072 }) && same(snU.nodeHeap, { by: 'node-default', mb: 2048 }) && same(snO.nodeHeap, { by: 'own', mb: 4096 }), 'the snapshot says the fact the card words: bound 3072 · node-default 2048 · own 4096', { named: sn4.nodeHeap, unnamed: snU.nodeHeap, own: snO.nodeHeap });
  const cron = jm.create({ kind: 'cron', name: 'nightly', schedule: { everyMs: 3600e3 }, action: { type: 'spawn-task', task: { cmd: { argv: ['node', '-e', '0'], cwd: TMP }, memoryMb: '8G' } }, owner }, caller);
  jm._fireCron(jm.jobs.get(cron.job.id), 'cron');
  const child = [...jm.jobs.values()].find((j) => j.cronParent === cron.job.id);
  const sc = child && await specOf(jm, child);
  ok(!!sc && sc.env.NODE_OPTIONS === '--max-old-space-size=6144', 'a schedule whose task names 8G: each run is handed the flag too (6144)', sc && sc.env.NODE_OPTIONS);
  // round wrpdo2eev 4: THE CARD AND THE SPAWN READ ONE NUMBER — on a host where the hub's own limit (the spawn's context) and the
  // last cgroup proof's (the plain context) differ, the snapshot's heap is the flag the job was handed, never the other figure
  const jc = engine('jobs-ctx');
  jc._memoryCtx = ({ hub = false } = {}) => ({ instanceMb: hub ? 12288 : 65536, instanceOf: 'instance' });
  const big = mk(jc, 'named-16g', { mem: '16G' }), sb = await specOf(jc, big);
  const flagMb = Number((/--max-old-space-size=(\d+)/.exec((sb && sb.env.NODE_OPTIONS) || '') || [])[1]);
  const card = jc.snapshot(big).nodeHeap, other = M.nodeHeapOf({ boundMb: M.memoryMbOf(big, jc._memoryCtx()).mb, source: 'job' }).mb;
  ok(flagMb > 0 && card.mb === flagMb && other !== flagMb, `the card's heap is the flag the spawn handed (${flagMb} MB under the hub's 12 GB limit), never the other context's ${other} MB`, { flagMb, card, other });
}
console.log('§2b RED: a copy of src/jobs.js whose spawn hands the job\'s env as it was');
{
  const JX = MJ.load('src/jobs.js', anchored(read('src/jobs.js'), 'env: jobEnv({ ...M.withNodeHeap(job.cmd.env, M.nodeHeapOf({ boundMb: hub.mb, source: hub.source, nodeOptions: (job.cmd.env || {}).NODE_OPTIONS })),', 'env: jobEnv({ ...(job.cmd.env || {}),   /* MUTANT: the release\'s spawn */', 'the spawn\'s heap line'), 'release-spawn');
  const jx = engine('jobs-mut', JX.JobManager);
  const s = await specOf(jx, mk(jx, 'named-4g', { mem: '4G' }));
  ok(!!s && !('NODE_OPTIONS' in s.env), 'CONTROL (the release\'s spawn, in a copy): a job that named 4G hands Node nothing — the 2 240 MB of the row', s && Object.keys(s.env).filter((k) => /NODE/.test(k)));
}

// ════════ §3 THE CARD'S WORDS ════════
console.log('§3 the card\'s words (jobs-layout nodeHeapWords) in en, zh and ja; the panel\'s row');
{
  const tFor = (dict) => (k, p = {}) => String((dict && dict[k]) || k).replace(/\{(\w+)\}/g, (m, n) => (p[n] !== undefined ? String(p[n]) : m));
  const en = tFor(null), zh = tFor(ZH), ja = tFor(JA);
  const J = (nodeHeap) => ({ id: 'jb-1', nodeHeap });
  ok(L.nodeHeapWords(J({ by: 'bound', mb: 6144 }), en) === 'If this job runs a Node program, its heap is 6 GB — 75% of the job’s bound', 'a named bound: «… its heap is 6 GB — 75% of the job’s bound» (the BOUND: true also where the instance capped what it named — round wrpdo2eev 3)', L.nodeHeapWords(J({ by: 'bound', mb: 6144 }), en));
  ok(L.nodeHeapWords(J({ by: 'own', mb: 4096 }), en) === 'If this job runs a Node program, its heap is 4 GB — set by the job’s own options', 'its own heap: «… set by the job’s own options» (a visible key names no env variable — test-plain-words)', L.nodeHeapWords(J({ by: 'own', mb: 4096 }), en));
  ok(L.nodeHeapWords(J({ by: 'node-default', mb: 2048 }), en) === 'If this job runs a Node program, Node’s own default heap under this bound is about 2 GB — set the memory bound here to give it 75% of the bound', 'B\'s sentence for a job that names none: what Node\'s default is and the door that changes it', L.nodeHeapWords(J({ by: 'node-default', mb: 2048 }), en));
  ok(['bound', 'own', 'node-default'].every((by) => L.nodeHeapWords(J({ by, mb: 2048 }), en).startsWith('If this job runs a Node program, ')), 'EVERY sentence is conditional in its own words — a card of a job with no Node in it reads true (no guess from its command: round wrpdo2eev 1)');
  ok(L.nodeHeapWords(J({ by: 'none', mb: null }), en) === '' && L.nodeHeapWords({ id: 'x' }, en) === '', 'unbounded, or an older hub: nothing said');
  const keys = ['If this job runs a Node program, its heap is {size} — 75% of the job’s bound', 'If this job runs a Node program, its heap is {size} — set by the job’s own options', 'If this job runs a Node program, Node’s own default heap under this bound is about {size} — set the memory bound here to give it 75% of the bound'];
  ok(keys.every((k) => typeof ZH[k] === 'string' && ZH[k].includes('{size}') && typeof JA[k] === 'string' && JA[k].includes('{size}')), 'all three sentences have zh and ja words (each keeps {size})', keys.filter((k) => !ZH[k] || !JA[k]));
  ok(L.nodeHeapWords(J({ by: 'node-default', mb: 2048 }), zh).startsWith('若此任务运行 Node 程序，此上限下 Node 自带的默认堆约为 2 GB') && L.nodeHeapWords(J({ by: 'bound', mb: 3072 }), ja).startsWith('このジョブが Node プログラムを実行する場合、ヒープは 3 GB'), 'the words read in zh and ja with the size in them', { zh: L.nodeHeapWords(J({ by: 'node-default', mb: 2048 }), zh), ja: L.nodeHeapWords(J({ by: 'bound', mb: 3072 }), ja) });
  const panel = read('src/lib/jobs-panel.js');
  ok(panel.includes('memHeap.textContent = nodeHeapWords(job, t);') && panel.includes('memRow.append(memLbl, memIn, memSet, memFact, memEff, memHeap);'), 'WIRING: the panel\'s Memory bound row carries the sentence (jobs-panel memHeap)');
}

for (const r of copiesCensus(MJ.files, MJ.dir, REPO, { minCopies: 2, label: 'B-d73c ' })) ok(r.pass === true, r.name + (r.pass ? '' : ' — ' + r.detail));
report();

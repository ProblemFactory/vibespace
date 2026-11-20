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
//   §3 the card's words (src/lib/jobs-layout.js nodeHeapWords) in en, zh and ja, the panel's row; §4 the CLI's line (`show`)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
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
const CLI = path.join(REPO, 'data/bin/vibespace-job');
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
const STANDIN = "const fs = require('fs'), path = require('path'); const [ctl, spec] = process.argv.slice(2); try { fs.copyFileSync(spec, path.join(ctl, 'spec-seen.json')); fs.unlinkSync(spec); } catch (e) { fs.writeFileSync(path.join(ctl, 'spec-seen.json'), JSON.stringify({ error: e.message })); }\n";
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
  ok(L.nodeHeapWords(J({ by: 'bound', mb: 6144 }), en) === 'Node heap 6 GB — 75% of the memory this job names', 'a named bound: «Node heap 6 GB — 75% of the memory this job names»', L.nodeHeapWords(J({ by: 'bound', mb: 6144 }), en));
  ok(L.nodeHeapWords(J({ by: 'own', mb: 4096 }), en) === 'Node heap 4 GB — set by the job’s own options', 'its own heap: «… set by the job’s own options» (a visible key names no env variable — test-plain-words)', L.nodeHeapWords(J({ by: 'own', mb: 4096 }), en));
  ok(L.nodeHeapWords(J({ by: 'node-default', mb: 2048 }), en) === 'Node’s own default heap under this bound: about 2 GB — set the memory bound here to give Node 75% of it', 'B\'s sentence for a job that names none: what Node\'s default is and the door that changes it', L.nodeHeapWords(J({ by: 'node-default', mb: 2048 }), en));
  ok(L.nodeHeapWords(J({ by: 'none', mb: null }), en) === '' && L.nodeHeapWords({ id: 'x' }, en) === '', 'unbounded, or an older hub: nothing said');
  const keys = ['Node heap {size} — 75% of the memory this job names', 'Node heap {size} — set by the job’s own options', 'Node’s own default heap under this bound: about {size} — set the memory bound here to give Node 75% of it'];
  ok(keys.every((k) => typeof ZH[k] === 'string' && ZH[k].includes('{size}') && typeof JA[k] === 'string' && JA[k].includes('{size}')), 'all three sentences have zh and ja words (each keeps {size})', keys.filter((k) => !ZH[k] || !JA[k]));
  ok(L.nodeHeapWords(J({ by: 'node-default', mb: 2048 }), zh).startsWith('此上限下 Node 自带的默认堆：约 2 GB') && L.nodeHeapWords(J({ by: 'bound', mb: 3072 }), ja).startsWith('Node ヒープ 3 GB'), 'the words read in zh and ja with the size in them', { zh: L.nodeHeapWords(J({ by: 'node-default', mb: 2048 }), zh), ja: L.nodeHeapWords(J({ by: 'bound', mb: 3072 }), ja) });
  const panel = read('src/lib/jobs-panel.js');
  ok(panel.includes('memHeap.textContent = nodeHeapWords(job, t);') && panel.includes('memRow.append(memLbl, memIn, memSet, memFact, memEff, memHeap);'), 'WIRING: the panel\'s Memory bound row carries the sentence (jobs-panel memHeap)');
}

// ════════ §4 THE CLI'S LINE ════════
console.log('§4 the CLI\'s memory line (`vibespace-job show`) over a loopback hub');
{
  const base = { kind: 'task', state: 'up', name: 'build', mine: true, cmd: { argv: ['sh', '-c', 'npm run build'], cwd: '/w', envKeys: [] }, envFrom: [], schedule: null, restart: 'on-failure', timeoutMs: null, untilOutput: null, singleInstance: true, notifyOk: false, notifyUser: false,
    access: { view: 'group', control: 'session' }, notify: 'inherit', subscribersCount: 0, memorySource: 'job', memoryAskedMb: 8192, memoryMb: 8192, memoryCap: null };
  const JOBS = { 'jb-named': { ...base, id: 'jb-named', nodeHeap: { by: 'bound', mb: 6144 } }, 'jb-plain': { ...base, id: 'jb-plain', memorySource: 'default', memoryMb: 4096, memoryAskedMb: 4096, nodeHeap: { by: 'node-default', mb: 2048 } } };
  const server = http.createServer((req, res) => { const id = decodeURIComponent((/^\/api\/agent\/jobs\/([^/?]+)/.exec(req.url) || [])[1] || ''); res.writeHead(JOBS[id] ? 200 : 404, { 'content-type': 'application/json' }); res.end(JSON.stringify(JOBS[id] ? { success: true, job: JOBS[id] } : { error: 'no job' })); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const cli = (argv) => new Promise((resolve) => { const p = spawn(process.execPath, [CLI, ...argv], { env: { PATH: process.env.PATH || '/usr/bin:/bin', HOME: TMP, VIBESPACE_API: `http://127.0.0.1:${server.address().port}`, VIBESPACE_SESSION_TOKEN: 'vsst_heap' } }); let out = '', err = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; }); p.on('close', (code) => resolve({ code, out, err })); });
  const [a, b] = await Promise.all([cli(['show', 'jb-named']), cli(['show', 'jb-plain'])]);
  const memOf = (r) => r.out.split('\n').find((l) => l.startsWith('memory: ')) || '';
  ok(a.code === 0 && memOf(a).endsWith(' · Node heap 6 GB (75 % of the memory it names — handed as --max-old-space-size beside its NODE_OPTIONS)'), 'show of a job that named 8G: its memory line ends with the heap it hands Node', memOf(a) || a.err);
  ok(b.code === 0 && memOf(b).endsWith(" · Node's own default heap under this bound: about 2 GB — name the memory (vibespace-job memory jb-plain 8G) to give Node 75 % of it, or set NODE_OPTIONS=--max-old-space-size=N"), 'show of a job that named none: B\'s sentence with the door to type', memOf(b) || b.err);
  await new Promise((r) => server.close(r));
}
for (const r of copiesCensus(MJ.files, MJ.dir, REPO, { minCopies: 2, label: 'B-d73c ' })) ok(r.pass === true, r.name + (r.pass ? '' : ' — ' + r.detail));
report();

#!/usr/bin/env node
// A SITE OR SERVICE A CONVERSATION RUNS (lane artifacts-services, owner 2026-10-06 "这个对话发布的最新页面也没有出现在下面").
// PURE src/artifacts.js service rows (the head after Docs, stopped greying, the 24 h window, a moved port, the lineage rule,
// no listener ⇒ no row); the registry over the REAL jobs engine in a scratch dir with a job that listens on an
// EPHEMERAL port (bound, then known — never a fixed port): the row within one read, the url through the instance URL,
// the card born then patched, stop ⇒ greyed, rm ⇒ gone; the never-block census of the listen path; patched-copy
// controls. Run: node scripts/test-artifacts-services.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const AF = require(path.join(REPO, 'src/artifacts.js'));
const REG = require(path.join(REPO, 'src/server/artifact-registry.js'));
const { JobManager } = require(path.join(REPO, 'src/jobs.js'));
const M = mutantCopies('artifacts-services', REPO);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e) : '')); } return !!c; };
const H = 3600_000;
const job = (id, cid, extra = {}) => ({ id, name: 'site-' + id, kind: 'service', state: 'up', owner: { conversation: { backend: 'claude', id: cid } }, listen: { port: 8100, firstAt: 1000, at: 1000 }, runs: [{ startedAt: 900 }], ...extra });

console.log('① PURE rows');
const rows0 = AF.serviceRows([job('a', 'c-A')], { cid: 'c-A', now: 2000, base: 'https://inst.example.test' });
const ra = rows0['job:a'];
ok(ra && ra.kind === 'service' && ra.url === 'http://inst.example.test:8100/' && ra.state === 'running' && ra.since === 900 && ra.firstAt === 1000, 'a running job that listens = ONE service row: its url on the instance URL\'s host, since = the job\'s start, firstAt = its first listen', ra);
const mixed = { ...AF.fold({}, { op: 'write', path: '/p/notes.md', at: 5 }), ...AF.fold({}, AF.pageOp({ id: 'pg', srcKey: 'local:/p/site/index.html', srcPath: '/p/site/index.html', path: '/p/pg', updatedAt: 9 })), ...AF.fold({}, { op: 'write', path: '/p/run.py', at: 7 }), ...rows0 };
const v = AF.view(mixed);
ok(v.items.map((b) => b.kind).join(',') === 'doc,service,page' && v.code.length === 1 && v.count === 3, 'placement: Services under their own head AFTER Docs and before the rest; code stays folded; the chip counts it', v.items.map((b) => b.kind));
const stopped = job('b', 'c-A', { state: 'down', runs: [{ startedAt: 900, endedAt: 5000 }] });
const rb = AF.serviceRow(stopped, { now: 5000 + 23 * H });
ok(rb && rb.state === 'stopped' && rb.stoppedAt === 5000 && AF.cardFacts(AF.cardBlock(rb)).stoppedAt === 5000, 'a stopped job\'s row stays (greyed) with its stop instant', rb);
ok(AF.serviceRow(stopped, { now: 5000 + AF.SERVICE_KEEP_MS + 1 }) === null && AF.SERVICE_KEEP_MS === 24 * H, 'the 24 h window: a day after the stop the row goes');
const moved = AF.serviceRows([job('a', 'c-A', { listen: { port: 8200, firstAt: 1000, at: 3000 } })], { cid: 'c-A', now: 4000 })['job:a'];
ok(moved && moved.key === ra.key && moved.url === 'http://127.0.0.1:8200/' && AF.cardBlock(moved).port === 8200, 'a port that moves ⇒ the SAME row (key) with the new url (no instance URL ⇒ loopback)', moved);
const two = AF.serviceRows([job('a', 'c-A'), job('c', 'c-A', { listen: { port: 8300, firstAt: 1, at: 1 } })], { cid: 'c-A', now: 2000 });
ok(Object.keys(two).length === 2, 'two jobs ⇒ two rows');
ok(Object.keys(AF.serviceRows([job('x', 'c-B')], { cid: 'c-A', now: 2000 })).length === 0, 'THE LINEAGE RULE: another conversation\'s job ⇒ no row');
ok(Object.keys(AF.serviceRows([job('n', 'c-A', { listen: null })], { cid: 'c-A', now: 2000 })).length === 0 && AF.serviceRow(job('z', 'c-A', { listen: { port: 0 } })) === null, 'a job with no listener ⇒ no row');
ok(Object.keys(AF.serviceRows([job('a', 'c-A')], { cid: null })).length === 0, 'no conversation id (a pending fork) ⇒ no rows');
ok(AF.serviceUrl(5173, 'http://[::1]:7400') === 'http://[::1]:5173/' && AF.serviceUrl(5173, 'not a url') === 'http://127.0.0.1:5173/', 'serviceUrl: an IPv6 instance host is bracketed; an unreadable base falls back to loopback');

console.log('② the registry over the REAL jobs engine (scratch dir, an ephemeral-port job)');
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-svc-'));
fs.mkdirSync(path.join(D, 'bin'), { recursive: true });
fs.copyFileSync(path.join(REPO, 'data/bin/job-wrapper.js'), path.join(D, 'bin', 'job-wrapper.js')); // the engine spawns its own wrapper from <dataDir>/bin
const ops = [];
const mm = { sessionId: 's1', messages: [], messageIndex: new Map(), turnIndex: 0, _emit: (o) => ops.push(o) };
const session = { sockName: 's1', backend: 'claude', claudeSessionId: 'conv-T', cwd: D, host: '', _artifacts: {}, _normalizer: mm };
const sessions = new Map([['s1', session]]);
let jm = null;
REG.configure({ activeSessions: () => sessions, jobs: () => jm, instanceUrl: { url: () => 'https://inst.example.test' }, log: { log() { }, warn() { } } });
jm = new JobManager({ dataDir: D, broadcast() { }, notifyUser() { }, log() { }, apiBase: 'http://127.0.0.1:9', listenReadMs: 150, onService: (j) => REG.noteService(j) });
jm.init();
const caller = { conversationId: 'conv-T', sessionId: 'sess-T', sessionCreatedAt: 1, groups: new Set() };
const owner = (cid) => ({ conversation: { backend: 'claude', id: cid }, sessionId: 'sess-' + cid, sessionCreatedAt: 1, createdBy: 'agent', groupsSnapshot: [] });
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 100)); await jm._sweep(); } return false; };
// a node one-liner server: binds port 0, THEN writes the port the kernel gave it (bound-then-known)
const serve = (tag) => [process.execPath, '-e', `const s=require('http').createServer((q,r)=>r.end('hello ${tag}'));s.listen(0,'127.0.0.1',()=>require('fs').writeFileSync(${JSON.stringify(path.join(D, tag + '.port'))},String(s.address().port)))`];
const mine = jm.create({ kind: 'service', name: 'house-web', cmd: { argv: serve('mine') }, owner: owner('conv-T') }, caller);
const theirs = jm.create({ kind: 'service', name: 'their-web', cmd: { argv: serve('theirs') }, owner: owner('conv-X') }, { ...caller, conversationId: 'conv-X' });
const J = jm.jobs.get(mine.job && mine.job.id), JX = jm.jobs.get(theirs.job && theirs.job.id);
const portOf = (tag) => { try { return Number(fs.readFileSync(path.join(D, tag + '.port'), 'utf-8')); } catch { return 0; } };
const list = () => REG.listFor('s1');
const svc = () => list().items.filter((b) => b.kind === 'service');
const born = await until(() => svc().length === 1 && portOf('mine') > 0 && JX && JX.listen);
const P = portOf('mine');
const b1 = svc()[0];
ok(born && b1.jobId === J.id && b1.port === P && b1.url === `http://inst.example.test:${P}/` && b1.state === 'running' && b1.name === 'house-web', 'the job\'s row appears within one read: its ephemeral port, the url through the instance URL', b1);
ok(J.listen && J.listen.port === P && JX.listen && JX.listen.port === portOf('theirs') && svc().every((b) => b.jobId !== JX.id), 'the engine read BOTH jobs\' ports off their pid trees — the other conversation\'s job is no row here (lineage)');
const cardId = N_cardId(J.id);
ok(mm.messageIndex.has(cardId) && ops.filter((o) => o.op === 'create').length === 1 && mm.messageIndex.get(cardId).content[0].kind === 'service', 'the card is born ONCE at the first listen (a live create on the conversation\'s normalizer)', ops.map((o) => o.op));
const before = Number(J._listenAt || 0);
await jm._sweep(); await jm._sweep();
ok(Number(J._listenAt || 0) === before || Date.now() - before >= 150, 'the read is throttled per job (the engine\'s knob; production = 30 s on the 5 s tick)');
jm.stop(J);
const greyed = await until(() => svc()[0] && svc()[0].state === 'stopped');
ok(greyed && svc()[0].stoppedAt > 0 && list().count === 1, 'stop ⇒ the row stays, greyed, with its stop instant', svc()[0]);
ok(ops.some((o) => o.op === 'edit' && o.id === cardId && o.fields.content[0].state === 'stopped') && ops.filter((o) => o.op === 'create').length === 1, 'the card is PATCHED in place to stopped (no second card)');
jm.rm(J, { stop: true });
ok(svc().length === 0 && list().count === 0, 'rm ⇒ the row is gone');
const sv = AF.serviceRows([{ ...JX }], { cid: 'conv-X', now: Date.now() });
ok(Object.keys(sv).length === 1, 'the other conversation sees ITS OWN job as a row (the rule cuts both ways)');
try { jm.stop(JX); jm.shutdown(); } catch { }

console.log('③ the never-block census: the listen path reads /proc through fs.promises — no exec, no *Sync');
const SPAWN = /\b(?:execFileSync|execFile|execSync|spawnSync|spawn)\s*\(|\b\w+Sync\s*\(/;
const listenPath = (jobsSrc, procSrc) => { const i = jobsSrc.indexOf('  _listenRead(job, stamp) {'), j = jobsSrc.indexOf('  _serviceDoor() {'); return i > 0 && j > i ? jobsSrc.slice(i, j) + '\n' + procSrc.replace(/^\s*\/\/.*$/gm, '') : null; };
const jobsSrc = fs.readFileSync(path.join(REPO, 'src/jobs.js'), 'utf-8'), procSrc = fs.readFileSync(path.join(REPO, 'src/proc-listen.js'), 'utf-8');
const census = (t) => (t == null ? 'no-scope' : (t.split('\n').filter((l) => SPAWN.test(l)).length ? 'red' : 'green'));
ok(census(listenPath(jobsSrc, procSrc)) === 'green' && /fs\.promises\.readlink/.test(procSrc) && /require\('\.\/proc-listen\.js'\)/.test(fs.readFileSync(path.join(REPO, 'src/port-forward.js'), 'utf-8')), 'the listen path (src/jobs.js _listenRead + src/proc-listen.js) holds no exec and no sync call; port-forward\'s local watch reads the SAME reader');

console.log('④ patched-copy controls');
const asrc = fs.readFileSync(path.join(REPO, 'src/artifacts.js'), 'utf-8');
const lineage = '    if (jobOwnerCid(j) !== cid) continue;\n';
const ML = asrc.includes(lineage) ? M.load('src/artifacts.js', asrc.replace(lineage, ''), 'nolineage') : null;
ok(ML && Object.keys(ML.serviceRows([job('x', 'c-B')], { cid: 'c-A', now: 2000 })).length === 1, 'CONTROL: without the lineage check a FOREIGN job\'s row appears (the ① lineage assert sees it)');
const syncExec = "    const PL = require('./proc-listen.js');\n";
ok(jobsSrc.includes(syncExec) && census(listenPath(jobsSrc.replace(syncExec, syncExec + "    require('child_process').execSync('ss -ltnp');\n"), procSrc)) === 'red', 'CONTROL: a sync exec restored on the listen path ⇒ the never-block census is red');
const expiry = '  if (!running && now - stoppedAt > SERVICE_KEEP_MS) return null;\n';
const ME = asrc.includes(expiry) ? M.load('src/artifacts.js', asrc.replace(expiry, ''), 'noexpiry') : null;
ok(ME && ME.serviceRow(stopped, { now: 5000 + AF.SERVICE_KEEP_MS + 1 }) !== null, 'CONTROL: without the expiry a day-old stopped row stays (the ① 24 h assert sees it)');
try { fs.rmSync(D, { recursive: true, force: true }); } catch { }

function N_cardId(jobId) { return require(path.join(REPO, 'src/normalizers.js')).artifactCardId(mm, 'job:' + jobId); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

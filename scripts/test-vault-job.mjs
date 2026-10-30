#!/usr/bin/env node
// A BACKGROUND JOB GETS A VAULT VALUE ON A READ-ONCE FD AT EVERY SPAWN (lane vault-job-road, design-vault-service-secret L1a) —
// the REAL road: a real vault engine on a scratch dir, the real JobManager, the real data/bin/job-wrapper.js and a real job
// (a node program) that reads its fd. Fast tier: in-process, every leg at once, each in its own scratch root (src/ linked so the
// wrapper finds its masker beside it, as on a hub). The THREAT MODEL is the owner's — the ACCIDENT roads:
//   ① HANDED, NEVER LEFT LYING — the sentinel is ABSENT from /proc/<job>/environ + cmdline, /proc/<wrapper>/environ + cmdline,
//      every file the engine wrote (the spec file included — caught as it is written), every file of the data dir, the job's
//      log in every spelling of the run door's FORMS (the program prints it plain / base64 / hex / url-encoded / on stderr), the
//      journal, the audit, the agent's answer (the snapshot as the route words it), every jobs-updated frame — and PRESENT where
//      the job read it (THE POSITIVE CONTROL: the program's own copy, outside the data dir; a scanner that finds it there);
//      the second read of the fd is empty; the job's fd 3 is closed; ONE vault-use line (door service, by job, a receipt)
//   ② LOCKED = WAIT — a locked create waits (`waiting`/vault, no run, no counted failure, the lock's helper names the job);
//      six more locked starts change nothing; the unlock starts it, with its value
//   ③ THE CRASH LOOP — a service that dies at once: 6 starts = 6 use lines, then parked (the supervisor's own rule)
//   ④ A LOCKED BOOT WAITS (the frp class) — a service whose run ended, a new engine over its data dir, the vault locked: the
//      boot replay starts nothing; the unlock starts it
//   ⑤ AN APPROVAL — a value the hub minted waits for `approval`; a vault-job row naming the job starts it (the grants store's
//      change); the job read the minted value
//   ⑥ NO MASKER, NO START — a scratch root without src/vault-run.js: the wrapper refuses by name, the job never ran
//   ⑦ MUTANTS (each RED, a patched copy — jobs.js compiled at its real path, the wrapper written into the scratch bin): the
//      value in spec.env · in the spec file · on argv · fd 3 left open · no value masker · a lock counted · a locked boot starts it
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import os from 'os';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const R = (p) => require(path.join(REPO, p));
const VE = R('src/server/vault-engine.js'), VR = R('src/vault-run.js'), VJ = R('src/vault-job.js'), M = R('src/job-model.js');
const DOOR = R('src/server/vault-job-door.js'), GS = R('src/server/grants-store.js');
const Module = require('module');
const JOBS = path.join(REPO, 'src/jobs.js'), JOBS_SRC = fs.readFileSync(JOBS, 'utf8');
const WRAP_SRC = fs.readFileSync(path.join(REPO, 'data/bin/job-wrapper.js'), 'utf8');
const { JobManager } = R('src/jobs.js');
const PW = 'pw-vault-job-suite';
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const SENT = (tag) => `vjsent-${tag}-${require('crypto').randomBytes(6).toString('hex')}`;
M.SUPERVISE.backoffBaseMs = 10; M.SUPERVISE.backoffMaxMs = 40;   // ③'s six crashes inside the fast tier (the rule, not its clock)

// the spec file and every other file THIS process writes through fs (the engine is in-process): caught as it is written
const written = [];
const realWrite = fs.writeFileSync;
fs.writeFileSync = function (f, data, ...rest) { try { written.push(Buffer.isBuffer(data) ? data.toString('latin1') : String(data)); } catch { } return realWrite.call(this, f, data, ...rest); };

const PROG = `const fs = require('fs'), path = require('path');
const out = process.argv[2], fd = Number(process.env.TOK_FD);
let v = '', again = '';
try { v = fs.readFileSync(fd, 'utf8'); } catch (e) { v = 'ERR:' + e.code; }
try { again = fs.readFileSync(fd, 'utf8'); } catch (e) { again = 'ERR:' + e.code; }
let fd3 = ''; try { fd3 = fs.readlinkSync('/proc/self/fd/3'); } catch { fd3 = ''; } // node keeps its own fds (eventpoll …) — a SOCKET at 3 is the hub's channel
fs.writeFileSync(path.join(out, 'got-' + process.pid + '.json'), JSON.stringify({ v, again, fd3, pid: process.pid }));
console.log('plain ' + v); console.log('b64 ' + Buffer.from(v).toString('base64')); console.log('hex ' + Buffer.from(v).toString('hex'));
console.log('url ' + encodeURIComponent(v)); console.error('err ' + v);
for (let i = 0; i < 200 && !fs.existsSync(path.join(out, 'release')); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15);
process.exit(Number(process.env.EXIT_CODE || 0));
`;
const jmOf = (src) => { if (!src) return JobManager; const m = new Module(JOBS, null); m.filename = JOBS; m.paths = Module._nodeModulePaths(path.dirname(JOBS)); m._compile(src, JOBS); return m.exports.JobManager; };
const swap = (src, from, to) => { const n = src.split(from).length - 1; if (n !== 1) throw new Error(`mutant anchor ×${n}: ${from.slice(0, 60)}`); return src.replace(from, to); };

async function world(tag, { jobs = null, wrap = WRAP_SRC, masker = true, dataDir = null, vault = null } = {}) {
  const root = dataDir ? path.dirname(dataDir) : fs.mkdtempSync(path.join(os.tmpdir(), `vs-vjob-${tag}-`));
  const dd = dataDir || path.join(root, 'data');
  if (!dataDir) {
    if (masker) fs.symlinkSync(path.join(REPO, 'src'), path.join(root, 'src'));
    fs.mkdirSync(path.join(dd, 'bin'), { recursive: true }); fs.mkdirSync(path.join(root, 'out'));
    fs.writeFileSync(path.join(dd, 'bin', 'job-wrapper.js'), wrap); fs.writeFileSync(path.join(root, 'prog.js'), PROG);
  }
  const v = vault || VE.create({ dataDir: dd, kdf: { N: 1024, r: 8, p: 1 }, log: { log() { }, warn() { } }, idleTimer: false, register: false });
  if (!vault) await v.setup(PW);
  const grants = GS.create({ memory: true });
  const frames = [], journal = [];
  const JM = jmOf(jobs);
  const jm = new JM({ dataDir: dd, broadcast: (t, p) => frames.push(JSON.stringify(p || {})), notifyUser() { return { ok: true }; }, log: (...a) => journal.push(a.join(' ')), memoryRungs: [] });
  jm.init();
  const door = DOOR.create({ vault: v, grants: () => grants }), built = [];
  const pay = door.payload; door.payload = (x) => { const r = pay(x); if (r && r.ok) built.push(r.frame); return r; };   // every frame the door builds, read after the start
  jm.setVaultJob(door);
  const owner = { conversation: { id: 'conv-a' }, sessionId: 'w-a', createdBy: 'agent', groupsSnapshot: [] };
  const create = (o) => jm.create({ kind: 'task', name: tag, cmd: { argv: [process.execPath, path.join(root, 'prog.js'), path.join(root, 'out')], cwd: root, env: o.env || {} }, owner, vault: ['TOK=vault://agent:conv-a/tok'], ...o, env: undefined }, { conversationId: 'conv-a', groups: new Set() });
  const until = async (pred, n = 400) => { for (let i = 0; i < n; i++) { try { await jm._sweep(); } catch { } if (pred()) return true; await nap(15); } return false; };
  const got = () => fs.readdirSync(path.join(root, 'out')).filter((f) => f.startsWith('got-')).map((f) => JSON.parse(fs.readFileSync(path.join(root, 'out', f), 'utf8')));
  const release = () => fs.writeFileSync(path.join(root, 'out', 'release'), '1');
  const audit = () => { try { return fs.readFileSync(path.join(dd, 'vault-audit.jsonl'), 'utf8'); } catch { return ''; } };
  const uses = (id) => audit().split('\n').filter((l) => l.includes('"event":"vault-use"') && l.includes('"door":"service"') && (!id || l.includes(`Background job ${id}`))).map((l) => JSON.parse(l));
  const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else if (e.isFile()) out.push(fs.readFileSync(p, 'latin1')); } return out; };
  const end = () => { try { for (const t of jm._timers || []) clearInterval(t); jm.readOnly = true; jm.shutdown(); } catch { } };
  return { root, dd, vault: v, grants, frames, journal, jm, built, create, until, got, release, audit, uses, walk, end, put: (s) => v.agentPut('agent:conv-a/tok', s) };
}
const procRead = (pid, f) => { try { return fs.readFileSync(`/proc/${pid}/${f}`, 'latin1'); } catch { return ''; } };
// the wrapper's fd table: its fd 3 right after the spawn (the hub's channel — read before the wrapper's node has booted) and
// every fd it holds later; Node marks an inherited fd ≥ 3 close-on-exec at its start (measured: flags 02000002), so the CLOSE is
// seen in the wrapper's own table — never in a child's
const linkOf = (pid, fd) => { try { return fs.readlinkSync(`/proc/${pid}/fd/${fd}`); } catch { return ''; } };
const fdsOf = (pid) => { try { return fs.readdirSync(`/proc/${pid}/fd`).map((n) => linkOf(pid, n)); } catch { return []; } };
const formsAbsent = (text, s) => VR.formsOf(s).every((f) => !text.includes(f.text));

// ── the legs (at once); each returns its rows ──
async function legHanded() {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world('hand'), S = SENT('hand');
  W.put(S);
  const r = W.create({});
  const job = W.jm.jobs.get(r.job && r.job.id);
  const ch0 = job && job.proc ? linkOf(job.proc.pid, 3) : '';
  row(!!job && job.state === 'up' && !written.some((t) => t.includes(S)), 'the job starts with its value — and no file the engine wrote (the spec file, jobs.json) holds it, caught as each was written', r.error);
  await W.until(() => W.got().length === 1);
  const g = W.got()[0] || {};
  const wpid = job.proc && job.proc.pid;
  const procs = [procRead(g.pid, 'environ'), procRead(g.pid, 'cmdline'), procRead(wpid, 'environ'), procRead(wpid, 'cmdline')];
  row(procs[0].length > 0 && procs[2].length > 0 && procs.every((t) => !t.includes(S)) && procs[0].includes('TOK_FD=4'), 'the sentinel is in neither process\'s environ nor argv (the job\'s env carries TOK_FD=4 only)');
  const wfds = fdsOf(wpid);
  row(/^socket:/.test(ch0) && wfds.length > 0 && !wfds.includes(ch0), 'the wrapper CLOSED the hub\'s channel (its fd 3 at the spawn) before the job ran — it holds it no more', { ch0, wfds });
  W.release();
  await W.until(() => job.state === 'done');
  const log = fs.readFileSync(job.runs[job.runs.length - 1].log, 'utf8');
  row(g.v === S && log.includes('plain [vault:TOK]'), 'THE POSITIVE CONTROL: the program read the sentinel off fd $TOK_FD (its own copy, outside the data dir) — the scanner finds it there', { v: g.v === S });
  row(g.again === '' && !/^socket:/.test(g.fd3), 'a second read of the fd is empty, and the job\'s fd 3 is no socket (the wrapper drained and closed the hub\'s before any spawn)', { again: g.again, fd3: g.fd3 });
  row(formsAbsent(log, S) && (log.match(/\[vault:TOK\]/g) || []).length === 5, 'the log holds no spelling of it (plain, base64, hex, url, stderr — five placeholders)', log.slice(0, 400));
  row(W.walk(W.dd).every((t) => !t.includes(S)) && formsAbsent(W.journal.join('\n'), S) && formsAbsent(W.frames.join('\n'), S), 'no file of the data dir, no journal line, no jobs-updated frame holds it');
  const snap = W.jm.snapshot(job, { author: true }), view = JSON.stringify(M.agentJobView(snap, { mine: true }));
  row(!view.includes(S) && JSON.stringify(snap.vault) === '[{"name":"TOK","ref":"vault://agent:conv-a/tok"}]', 'the agent\'s answer (the snapshot as the route words it) holds the REFERENCE only', snap.vault);
  const u = W.uses(job.id);
  row(W.built.length === 2 && W.built.every((b) => b.length > 0 && b.every((x) => x === 0)), 'every frame the door built (the gate\'s check, the one handed to the wrapper) is zeroed once used', W.built.map((b) => b.length));
  row(u.length === 1 && u[0].by === 'job' && u[0].outcome === 'ok' && /^vr-[0-9a-f]+$/.test(u[0].receipt) && u[0].conv === 'conv-a' && formsAbsent(W.audit(), S), 'ONE vault-use line per start (door service, by job, the owner conversation, a receipt) — the audit holds no value', u);
  W.end();
  return rows;
}
async function legLocked() {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world('lock'), S = SENT('lock');
  W.put(S); W.vault.lock('door');
  W.release();
  const r = W.create({ kind: 'service', restart: 'never' });
  const job = W.jm.jobs.get(r.job.id);
  const blocked = JSON.stringify(W.vault.blockedSummary());
  row(job.state === 'waiting' && job.waitFor === 'vault' && job.runs.length === 0 && job.supervise.consecutiveFails === 0 && blocked.includes('Background job'), 'locked ⇒ waiting for the vault: no run, no counted failure, the lock\'s ONE helper names the job', { state: job.state, blocked });
  for (let i = 0; i < 6; i++) W.jm._spawn(job, 'restart-policy');
  row(job.state === 'waiting' && job.runs.length === 0 && job.supervise.consecutiveFails === 0 && !job.supervise.parkedAt, 'six more locked starts: still waiting — never parked by a lock');
  await W.vault.unlock(PW);
  await W.until(() => W.got().length === 1);
  row(job.runs.length === 1 && (W.got()[0] || {}).v === S && W.uses(job.id).length === 1, 'the unlock starts it, with its value (one start, one use line)');
  W.jm.stop(job); W.end();
  return rows;
}
async function legCrash() {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world('crash'), S = SENT('crash');
  W.put(S); W.release();
  const r = W.create({ kind: 'service', env: { EXIT_CODE: '1' } });
  const job = W.jm.jobs.get(r.job.id);
  await W.until(() => job.state === 'failed' && !!(job.supervise && job.supervise.parkedAt), 1200);
  row(job.state === 'failed' && job.runs.length === 6 && W.uses(job.id).length === 6 && W.got().length === 6 && W.got().every((g) => g.v === S), 'a service that dies at once: 6 starts = 6 use lines (each start got its value), then parked', { state: job.state, runs: job.runs.length, uses: W.uses(job.id).length });
  W.end();
  return rows;
}
async function legBoot(jobs = null) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const A = await world(jobs ? 'bootm' : 'boot'), S = SENT('boot');
  A.put(S); A.release();
  const r = A.create({ kind: 'service', restart: 'never' });
  const id = r.job.id;
  await A.until(() => A.jm.jobs.get(id).state === 'down' && A.got().length === 1);
  A.end(); A.vault.lock('door');
  const B = await world('boot2', { jobs, dataDir: A.dd, vault: A.vault });
  const job = B.jm.jobs.get(id);
  await nap(60); try { await B.jm._sweep(); } catch { }
  const waited = job.state === 'waiting' && job.waitFor === 'vault' && job.runs.length === 1 && A.got().length === 1;
  await B.vault.unlock(PW);
  await B.until(() => A.got().length === 2);
  B.jm.stop(job); B.end();
  return { rows, waited, after: job.runs.length === 2 && A.got().every((g) => g.v === S) };
}
async function legApproval() {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world('appr');
  W.vault.agentMint('agent:conv-a/tok', { length: 32 }); W.release();
  const r = W.create({});
  const job = W.jm.jobs.get(r.job.id);
  row(job.state === 'waiting' && job.waitFor === 'approval' && job.runs.length === 0, 'a value the hub MINTED waits for the owner\'s approval (no run)');
  W.grants.set('vault-job', 'secrets:agent:conv-a/tok#secret', { to: [{ kind: 'conversation', key: 'conv-a', jobs: [job.id] }] }, 'test');
  await W.until(() => W.got().length === 1 && job.state === 'done');
  const minted = W.vault.secretGet('agent:conv-a/tok').value.toString();
  const log = fs.readFileSync(job.runs[0].log, 'utf8');
  row((W.got()[0] || {}).v === minted && formsAbsent(log, minted) && job.runs.length === 1, 'a vault-job row naming THIS job starts it (the grants store\'s change): the job read the minted value, its log holds none of it');
  W.end();
  return rows;
}
async function legCronStopped(jobs = null) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world(jobs ? 'cronm' : 'cron', { jobs }), S = SENT('cron');
  W.put(S); W.release(); W.vault.lock('door');
  const task = { cmd: { argv: [process.execPath, path.join(W.root, 'prog.js'), path.join(W.root, 'out')], cwd: W.root }, vault: ['TOK=vault://agent:conv-a/tok'] };
  const r = W.jm.create({ kind: 'cron', name: 'cron', schedule: { everyMs: 3600e3 }, action: { type: 'spawn-task', task }, owner: { conversation: { id: 'conv-a' }, sessionId: 'w-a', createdBy: 'agent', groupsSnapshot: [] } }, { conversationId: 'conv-a', groups: new Set(), isUser: true });
  const cron = W.jm.jobs.get(r.job && r.job.id);
  W.jm._fireCron(cron, 'test');
  const child = [...W.jm.jobs.values()].find((j) => j.cronParent === (cron && cron.id));
  row(!!child && child.state === 'waiting' && child.waitFor === 'vault' && child.runs.length === 0, 'a scheduled run fired while locked waits (its cron\'s task carried the reference)', r.error || (child && child.state));
  W.jm.stop(cron);
  await W.vault.unlock(PW);
  await W.until(() => false, 20);
  rows.started = W.got().length > 0;
  row(child && child.state === 'interrupted' && child.runs.length === 0 && W.got().length === 0, 'its cron stopped while it waited ⇒ the unlock starts NOTHING (the run never got its value)', child && { state: child.state, runs: child.runs.length });
  W.end();
  return rows;
}
async function legNoMasker() {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world('nomask', { masker: false }), S = SENT('nomask');
  W.put(S); W.release();
  const r = W.create({});
  const job = W.jm.jobs.get(r.job.id);
  await W.until(() => ['done', 'failed'].includes(job.state));
  const log = fs.readFileSync(job.runs[0].log, 'utf8');
  row(W.got().length === 0 && /refused: the log masker \(src\/vault-run\.js\) could not be loaded/.test(log) && !log.includes(S), 'no masker beside the wrapper ⇒ not started, by name (the job never ran, its value never reached the log)', log.slice(0, 300));
  W.end();
  return rows;
}
// ── ⑦ the mutants: each a world on a patched copy; red(…) = the rule broke ──
async function mutant(name, { jobs = null, wrap = WRAP_SRC }, red) {
  try {
    const W = await world('mut', { jobs, wrap }), S = SENT('mut');
    W.put(S);
    const r = W.create({});
    const job = W.jm.jobs.get(r.job && r.job.id);
    const ch0 = job && job.proc ? linkOf(job.proc.pid, 3) : '';
    await W.until(() => W.got().length >= 1 || (job && ['done', 'failed'].includes(job.state)));
    const g = W.got()[0] || {};
    const wfds = job && job.proc ? fdsOf(job.proc.pid) : [];
    const procs = g.pid ? [procRead(g.pid, 'environ'), procRead(job.proc && job.proc.pid, 'cmdline')].join('\n') : '';
    W.release();
    await W.until(() => job && ['done', 'failed'].includes(job.state));
    let log = ''; try { log = job && job.runs.length ? fs.readFileSync(job.runs[job.runs.length - 1].log, 'utf8') : ''; } catch { log = ''; }
    const facts = { g, procs, log, written: written.some((t) => t.includes(S)), S, ch0, wfds };
    W.end();
    const isRed = !!red(facts);
    return [isRed, `CONTROL — ${name}: RED on the copy`, isRed ? undefined : { ch0, wfds, read: g.v === S, log: log.slice(0, 300) }];
  } catch (e) { return [false, `CONTROL — ${name}: the copy could not be built (${e.message})`]; }
}
const ENV_AT = '...(vj ? VJ.envOf(vj.plan) : {})', SPEC_AT = '...(vj ? { vault: VJ.specOf(vj.plan) } : {}),', ARGV_AT = "[wrapper, ctl, specPath, '--proto=' + WRAPPER_PROTO]";
const leak = "vj.door.payload(vj).frame.toString('latin1').replace(/[^\\x20-\\x7e]/g, '')";   // printable: an env value / argv may hold no NUL
const MUTANTS = [
  ['the value in spec.env', { jobs: swap(JOBS_SRC, ENV_AT, `...(vj ? { ...VJ.envOf(vj.plan), TOK_COPY: ${leak} } : {})`) }, (f) => f.procs.includes(f.S)],
  ['the value in the spec file', { jobs: swap(JOBS_SRC, SPEC_AT, `...(vj ? { vault: VJ.specOf(vj.plan), copy: ${leak} } : {}),`) }, (f) => f.written],
  ['the value on argv', { jobs: swap(JOBS_SRC, ARGV_AT, `[wrapper, ctl, specPath, '--proto=' + WRAPPER_PROTO, ...(vj ? [${leak}] : [])]`) }, (f) => f.procs.includes(f.S)],
  ['fd 3 left open (read whole, never closed)', { wrap: swap(WRAP_SRC, 'if (VPLAN) drainValues().then(', "if (VPLAN) Promise.resolve((() => { const b = fs.readFileSync(3); const d = VJ.decodeFrame(b, VPLAN); return d.ok ? { values: d.values } : { why: d.why }; })()).then(") }, (f) => /^socket:/.test(f.ch0) && f.wfds.includes(f.ch0)],
  ['no value masker (shapes only)', { wrap: swap(WRAP_SRC, 'function maskOut(k, b) {\n  if (!VAL) return maskChunk(b);', 'function maskOut(k, b) {\n  if (true) return maskChunk(b);') }, (f) => f.log.includes(f.S)],
];
async function mutantLock() {
  const jobs = swap(JOBS_SRC, "    job.state = 'waiting'; job.waitFor = why; job.proc = null;\n", "    job.state = 'waiting'; job.waitFor = why; job.proc = null;\n    job.supervise = { ...(job.supervise || {}), consecutiveFails: ((job.supervise || {}).consecutiveFails || 0) + 1 }; if (job.supervise.consecutiveFails >= 6) { job.state = 'failed'; job.desiredUp = false; return; }\n");
  const W = await world('mutlock', { jobs }); W.put(SENT('ml')); W.vault.lock('door');
  const job = W.jm.jobs.get(W.create({ kind: 'service' }).job.id);
  for (let i = 0; i < 6; i++) { try { W.jm._spawn(job, 'restart-policy'); } catch { } }
  const red = job.state === 'failed' || job.supervise.consecutiveFails > 0;
  W.end();
  return [red, 'CONTROL — a lock counted as a failure: RED on the copy (parked after six locked starts)'];
}

const [handed, locked, crash, boot, bootMut, approval, noMasker, mutLock, cronStopped, cronMut, ...muts] = await Promise.all([
  legHanded(), legLocked(), legCrash(), legBoot(), legBoot(swap(JOBS_SRC, 'const vj = VJ.refsOf(job).length ? this._vaultGate(job, trigger) : null;', "const vj = VJ.refsOf(job).length && trigger !== 'boot' ? this._vaultGate(job, trigger) : null;")),
  legApproval(), legNoMasker(), mutantLock(), legCronStopped(),
  legCronStopped(swap(swap(JOBS_SRC, '    if (!job.cronParent) return true;\n', '    return true;\n'), "    if (job.kind === 'cron') for (const k of this.jobs.values()) if (k.cronParent === job.id) this._settleWait(k, 'its schedule was stopped');", '')), ...MUTANTS.map(([n, o, red]) => mutant(n, o, red)),
]);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };
const print = (title, rows) => { console.log(title); for (const [c, n, e] of rows) ok(c, n, e); };
print('① HANDED, NEVER LEFT LYING', handed);
print('② LOCKED = WAIT', locked);
print('③ THE CRASH LOOP', crash);
console.log('④ A LOCKED BOOT WAITS (the frp class)');
ok(boot.waited, 'a service whose run ended, a new engine over its data dir, the vault locked: the boot replay starts NOTHING (waiting for the vault)');
ok(boot.after, 'the unlock starts it — with its value');
print('⑤ AN APPROVAL', approval);
print('⑥ NO MASKER, NO START', noMasker);
print('⑥b A STOPPED SCHEDULE STARTS NOTHING', cronStopped);
console.log('⑦ MUTANTS');
ok(!bootMut.waited, 'CONTROL — a locked boot starts it (the gate skipped at the replay): RED on the copy');
ok(mutLock[0], mutLock[1]);
ok(!!cronMut.started, 'CONTROL — a stopped schedule\'s waiting run is still started at the unlock (its two guards removed): RED on the copy');
for (const [c, n, e] of muts) ok(c, n, e);
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

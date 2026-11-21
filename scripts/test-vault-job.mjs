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
//   ⑧ ROUND 2 (the acceptance) — A USE IS A HAND-OVER THAT COMPLETED: a run the wrapper refuses before it reads (no masker; an
//      update window's wrapper of another protocol) writes 0 `ok` lines and ONE `refused:<its code>` line (no «used N×»); a
//      normal run's ONE `ok` is ①'s. A WAIT IS ANSWERED AS ONE: start() of a waiting service / task answers `state: waiting`
//      and the hub's words (never «what its last run left running is stopped first»); the approval's words promise no card
//      this version lacks and name the door that works now; a scheduled job whose fires would wait says so at its create;
//      a start DEFERRED behind its last run whose values would wait answers the wait (the review); a stop that lands while
//      the wrapper drains writes ONE `refused:stopped` and no `ok` (the job never ran).
//      CONTROLS: r1's line written as the frame was queued · r1's start answer · a wrapper that ACKs before it reads the stop
//   ⑨ THE APPROVAL CARD (lane vault-job-approval, L1b) — over the REAL For-you store: a wait for approval files ONE card per job ×
//      entry (its facts: the program's / script's real paths and who may change them, the folder, the command, the fd; no
//      value anywhere; no expiry), never a second at a re-judge; 允许 without 验证是你 writes nothing, with it ONE member through
//      the grants store's writer and the job starts by itself; 拒绝 refuses the job + 10 minutes' quiet; 4 per conversation, 64
//      on the hub (each a refusal by name); a removed or stopped job closes its card; a card outlives a restart.
//      MUTANTS (a copy of the door each — RED): no reauth check · a card per re-judge · a Deny that leaves its job · no bound
//   THE SCRATCH — every root a leg makes carries THIS run's pid in its name and is removed at the end (a failed leg too: the
//   exit hook); the last line counts what is left of THIS run's prefix in the tmp dir — registered or not (0)
import './scratch.mjs';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import os from 'os';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const R = (p) => require(path.join(REPO, p));
const VE = R('src/server/vault-engine.js'), VR = R('src/vault-run.js'), VJ = R('src/vault-job.js'), M = R('src/job-model.js');
const DOOR = R('src/server/vault-job-door.js'), GS = R('src/server/grants-store.js');
const { UserTodoManager } = R('src/user-todos.js');   // lane vault-job-approval: the REAL For-you store — the card is its item
const Module = require('module');
const DOOR_PATH = path.join(REPO, 'src/server/vault-job-door.js'), DOOR_SRC = fs.readFileSync(DOOR_PATH, 'utf8');
const doorOf = (src) => { if (!src) return DOOR; const m = new Module(DOOR_PATH, null); m.filename = DOOR_PATH; m.paths = Module._nodeModulePaths(path.dirname(DOOR_PATH)); m._compile(src, DOOR_PATH); return m.exports; };
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
const gotF = path.join(out, 'got-' + process.pid + '.json');   // int374 (B-b1f5): written whole, then renamed in — the suite polls this dir
fs.writeFileSync(gotF + '.tmp', JSON.stringify({ v, again, fd3, pid: process.pid })); fs.renameSync(gotF + '.tmp', gotF);
console.log('plain ' + v); console.log('b64 ' + Buffer.from(v).toString('base64')); console.log('hex ' + Buffer.from(v).toString('hex'));
console.log('url ' + encodeURIComponent(v)); console.error('err ' + v);
for (let i = 0; i < 200 && !fs.existsSync(path.join(out, 'release')); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15);
process.exit(Number(process.env.EXIT_CODE || 0));
`;
const jmOf = (src) => { if (!src) return JobManager; const m = new Module(JOBS, null); m.filename = JOBS; m.paths = Module._nodeModulePaths(path.dirname(JOBS)); m._compile(src, JOBS); return m.exports.JobManager; };
const swap = (src, from, to) => { const n = src.split(from).length - 1; if (n !== 1) throw new Error(`mutant anchor ×${n}: ${from.slice(0, 60)}`); return src.replace(from, to); };

// round 2 (the acceptance: ~15 roots per run left in /tmp, a tmpfs whose INODES ran out once): every root is ours to remove
const ROOTS = new Set(), PREFIX = `vs-vjob-${process.pid}-`;
const ours = () => { try { return fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith(PREFIX)).map((n) => path.join(os.tmpdir(), n)); } catch { return []; } };   // the review: counted in the tmp dir, never only in the set
const sweepRoots = () => { for (const r of new Set([...ROOTS, ...ours()])) { try { fs.rmSync(r, { recursive: true, force: true }); } catch { } } return ours().length; };
process.on('exit', () => { sweepRoots(); });
async function world(tag, { jobs = null, wrap = WRAP_SRC, masker = true, dataDir = null, vault = null, doorSrc = null, grants: grants0 = null, held = false } = {}) {
  const root = dataDir ? path.dirname(dataDir) : fs.mkdtempSync(path.join(os.tmpdir(), `${PREFIX}${tag}-`));
  ROOTS.add(root);
  const dd = dataDir || path.join(root, 'data');
  if (!dataDir) {
    if (masker) fs.symlinkSync(path.join(REPO, 'src'), path.join(root, 'src'));
    fs.mkdirSync(path.join(dd, 'bin'), { recursive: true }); fs.mkdirSync(path.join(root, 'out'));
    fs.writeFileSync(path.join(dd, 'bin', 'job-wrapper.js'), wrap); fs.writeFileSync(path.join(root, 'prog.js'), PROG);
  }
  const v = vault || VE.create({ dataDir: dd, kdf: { N: 1024, r: 8, p: 1 }, log: { log() { }, warn() { } }, idleTimer: false, register: false });
  if (!vault) await v.setup(PW);
  const grants = grants0 || GS.create({ memory: true });
  if (held) fs.mkdirSync(path.join(dd, 'user-todos.json'));   // B-44f3: a READ that fails (EISDIR) — For you HELD unread; the leg lifts it itself
  const todos = new UserTodoManager({ dataDir: dd, expirySweepMs: 0, ...(held ? { unreadRetry: { firstMs: 60e3, maxMs: 60e3 } } : {}) });   // lane vault-job-approval: a wait for approval files its card here
  const frames = [], journal = [], told = [];   // told: what the owner conversation is messaged (lane vault-job-approval — a revoke says it once)
  const JM = jmOf(jobs);
  // archivePolicy as the hub's wiring gives it (the settings' defaults): without it the engine reads «no policy» as archive-off
  // (Number(null) = 0 hours) and ⑩c's archive sweep moves nothing — the first two gates on the moved tip
  const jm = new JM({ dataDir: dd, broadcast: (t, p) => frames.push(JSON.stringify(p || {})), notifyUser() { return { ok: true }; }, log: (...a) => journal.push(a.join(' ')), memoryRungs: [], archivePolicy: () => ({ doneAfterHours: 24, failedAfterDays: 7 }),
    deliverToConversation: async (cid, text) => { told.push({ cid, text: String(text) }); return { ok: true, lane: 'message', peerName: 'owner' }; }, notifyGlobal: () => true, peerReachable: () => true, groupNotifyFor: () => null });
  jm.init();
  const door = doorOf(doorSrc).create({ vault: v, grants: () => grants, userTodos: todos, nameOf: (cid) => (cid === 'conv-a' ? 'Chat A' : null) }), built = [];
  const pay = door.payload; door.payload = (x) => { const r = pay(x); if (r && r.ok) built.push(r.frame); return r; };   // every frame the door builds, read after the start
  jm.setVaultJob(door);
  const owner = { conversation: { id: 'conv-a' }, sessionId: 'w-a', createdBy: 'agent', groupsSnapshot: [] };
  const create = (o) => jm.create({ kind: 'task', name: tag, cmd: { argv: [process.execPath, path.join(root, 'prog.js'), path.join(root, 'out')], cwd: root, env: o.env || {} }, owner, vault: ['TOK=vault://agent:conv-a/tok'], ...o, env: undefined }, { conversationId: 'conv-a', groups: new Set() });
  const until = async (pred, n = 400) => { for (let i = 0; i < n; i++) { try { await jm._sweep(); } catch { } if (pred()) return true; await nap(15); } return false; };
  // a wait that SAYS its outcome, bounded in TIME against what it waits for (never a count of sweeps a slow runner exhausts): { ok, ms }
  const untilMs = async (pred, ms) => { const t0 = Date.now(); for (;;) { try { await jm._sweep(); } catch { } if (pred()) return { ok: true, ms: Date.now() - t0 }; if (Date.now() - t0 >= ms) return { ok: false, ms: Date.now() - t0 }; await nap(15); } };
  // int374 (B-b1f5): only a whole got-<pid>.json is read; an empty one (an in-place write caught mid-way — the 2.369.373 master CI at load
  // 7.8) and a .tmp are skipped, never parsed
  const got = () => fs.readdirSync(path.join(root, 'out')).filter((f) => /^got-\d+\.json$/.test(f)).map((f) => fs.readFileSync(path.join(root, 'out', f), 'utf8')).filter((t) => t.length > 0).map((t) => JSON.parse(t));
  const release = () => fs.writeFileSync(path.join(root, 'out', 'release'), '1');
  const audit = () => { try { return fs.readFileSync(path.join(dd, 'vault-audit.jsonl'), 'utf8'); } catch { return ''; } };
  const uses = (id) => audit().split('\n').filter((l) => l.includes('"event":"vault-use"') && l.includes('"door":"service"') && (!id || l.includes(`Background job ${id}`))).map((l) => JSON.parse(l));
  const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else if (e.isFile()) out.push(fs.readFileSync(p, 'latin1')); } return out; };
  const end = () => { try { for (const t of jm._timers || []) clearInterval(t); jm.readOnly = true; jm.shutdown(); } catch { } try { todos.stop(); } catch { } };
  return { root, dd, vault: v, grants, todos, door, frames, journal, told, jm, built, create, until, untilMs, got, release, audit, uses, walk, end, put: (s) => v.agentPut('agent:conv-a/tok', s) };
}
const procRead = (pid, f) => { try { return fs.readFileSync(`/proc/${pid}/${f}`, 'latin1'); } catch { return ''; } };
// lane vault-job-approval: the door's «an agent cannot change it» rule (OWNERSHIP — root owns every component, none group/other-
// writable), restated for the expectation: a root-owned node (a container run as root) is no agent's to change, an nvm one is
const rootChain = (p) => { let cur = ''; for (const part of String(p).split('/').slice(1)) { cur += '/' + part; try { const st = fs.statSync(cur); if (st.uid !== 0 || (st.mode & 0o022)) return false; } catch { return false; } } return true; };
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
  { // CONTROL (int374, B-b1f5): a 0-byte got file and a half-written .tmp, planted — got() skips both; the old reader (every got-* parsed) throws on them
    const o = path.join(W.root, 'out'), planted = [path.join(o, 'got-1.json'), path.join(o, 'got-2.json.tmp')];
    fs.writeFileSync(planted[0], ''); fs.writeFileSync(planted[1], '{"v":');
    let g = null, err = '', oldErr = '';
    try { g = W.got(); } catch (e) { err = String(e && e.message || e); }
    try { fs.readdirSync(o).filter((f) => f.startsWith('got-')).map((f) => JSON.parse(fs.readFileSync(path.join(o, f), 'utf8'))); } catch (e) { oldErr = String(e && e.message || e); }
    for (const f of planted) fs.rmSync(f, { force: true });
    row(Array.isArray(g) && g.length === 0 && !err && /JSON/.test(oldErr), 'CONTROL (int374, B-b1f5): a 0-byte got file (an in-place write caught mid-way) and a half-written .tmp are SKIPPED by got(), never parsed — the old reader threw on them', { got: g, err, oldErr }); }
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
  const st = W.jm.start(job);
  rows.startAnswer = st;
  row(st.ok && st.state === 'waiting' && st.waitFor === 'vault' && st.after === VJ.waitWords('vault') && /⚙ System ▸ Vault…/.test(st.after) && job.state === 'waiting' && job.runs.length === 0, 'round 2: start() of the waiting service answers its WAIT — state waiting, the hub\'s words (where a person unlocks it) — never «what its last run left running is stopped first»', st);
  for (let i = 0; i < 6; i++) W.jm._spawn(job, 'restart-policy');
  row(job.state === 'waiting' && job.runs.length === 0 && job.supervise.consecutiveFails === 0 && !job.supervise.parkedAt, 'six more locked starts: still waiting — never parked by a lock');
  await W.vault.unlock(PW);
  // the wait is for BOTH things the leg judges — the child's read of its value AND the hub's use line (written by the hub on its own, so it may
  // land after the child's read) — bounded at 20 s: a child process's start and one read on a loaded runner, with the hub's audit write.
  // The leg SAYS what it read (its three numbers and the wait's own outcome) whenever it is red (B-d24c, 2.369.406's hosted red said nothing).
  const LOCK_WAIT_MS = 20000;
  const w = await W.untilMs(() => W.got().length >= 1 && W.uses(job.id).length >= 1, LOCK_WAIT_MS);
  const read = { starts: job.runs.length, valueMatches: (W.got()[0] || {}).v === S, valuesRead: W.got().length, useLines: W.uses(job.id).length, wait: w.ok ? `reached in ${w.ms} ms` : `GAVE UP after ${w.ms} ms (bound ${LOCK_WAIT_MS} ms)` };
  row(w.ok && read.starts === 1 && read.valueMatches && read.useLines === 1, 'the unlock starts it, with its value (one start, one use line)', read);
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
  // (主开发 r183: a crash writes nothing after it) the run's end is ON DISK before the crash point — A.end() stops A without its stop's
  // flush, so the next engine's load never lands what A still owed: B boots on what the disk holds
  { const r = require('../src/store-writer.js').storeWriter().flushSync([A.jm.file, A.jm.notifsFile]); if (r.deferred || (r.left && r.left.length)) throw new Error(`the run's end did not land before the crash point: ${JSON.stringify(r.left)}`); }
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
  const st = W.jm.start(job), words = String(st.after || '');
  row(st.ok && st.state === 'waiting' && st.waitFor === 'approval' && job.runs.length === 0 && /ONE card per entry asks the user in their For-you tray/.test(words) && /starts by itself once they allow it/.test(words) && /vibespace-vault put/.test(words) && !/later VibeSpace update/.test(words), 'round 2 + lane vault-job-approval: start() of the waiting task answers its wait in the words of now — the card in the user\'s tray, what each answer does, and the door that needs none (an entry the agent puts)', st);   // stale-pins: kept (an absence check: L1a's words must be gone)
  W.grants.set('vault-job', 'secrets:agent:conv-a/tok#secret', { to: [{ kind: 'conversation', key: 'conv-a', jobs: [job.id] }] }, 'test');
  await W.until(() => W.got().length === 1 && job.state === 'done');
  const minted = W.vault.secretGet('agent:conv-a/tok').value.toString();
  const log = fs.readFileSync(job.runs[0].log, 'utf8');
  row((W.got()[0] || {}).v === minted && formsAbsent(log, minted) && job.runs.length === 1, 'a vault-job row naming THIS job starts it (the grants store\'s change): the job read the minted value, its log holds none of it');
  W.end();
  return rows;
}
// ── ⑨ THE APPROVAL CARD (lane vault-job-approval, design-vault-service-secret L1b — the owner's decisions ① ②) ──────────────
const cards = (W, st = 'open') => ((W.todos.snapshot() || {})[st] || []).filter((i) => i.action && i.action.type === 'vault-job-ask');
const resolvedOf = (W, askId) => (W.todos.snapshot().resolved || []).find((i) => i.action && i.action.askId === askId) || {};
const jobLines = (W) => W.audit().split('\n').filter((l) => l.includes('"event":"vault-job"'));
async function legCard(doorSrc = null) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world('card', { doorSrc });
  W.vault.agentMint('agent:conv-a/tok', { length: 32 }); W.release();
  const minted = W.vault.secretGet('agent:conv-a/tok').value.toString();
  const job = W.jm.jobs.get(W.create({}).job.id);
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  const c0 = cards(W), it = c0[0] || {}, a = it.action || {}, f = it.facts || {};
  rows.first = { job, a };
  row(job.state === 'waiting' && job.waitFor === 'approval' && c0.length === 1 && VJ.ASK_ID_RE.test(String(a.askId)) && a.jobId === job.id && a.entry === 'secrets:agent:conv-a/tok#secret' && a.name === 'TOK' && a.conv === 'conv-a' && it.sessionKey === 'claude:conv-a' && !it.expiresAt && it.sessionName === 'Chat A' && it.jobId === job.id,
    'a value the hub MINTED waits for approval — and ONE card is filed: vault-job-ask (the job, the entry, the NAME, the owner conversation), under that conversation, NO expiry', { state: job.state, n: c0.length, action: a, key: it.sessionKey, exp: it.expiresAt });
  row(f.v === 1 && f.job && f.job.id === job.id && f.job.kind === 'task' && f.entry && f.entry.var === 'TOK_FD' && f.program && f.program.path === fs.realpathSync(process.execPath) && f.program.writable === !rootChain(fs.realpathSync(process.execPath)) && f.script && f.script.path === fs.realpathSync(path.join(W.root, 'prog.js')) && f.script.writable === true && f.folder === W.root && f.dest === 'unknown' && /prog\.js/.test(f.command) && /— an agent can change this script\./.test(it.detail) && /Where it sends the secret: unknown/.test(it.detail),
    'its facts: the job and its kind, the fd it reads ($TOK_FD), the program\'s and the script\'s real paths and that an agent can change them (plain facts), the folder, the command, the destination unknown', f);
  row(!JSON.stringify(W.todos.snapshot()).includes(minted) && formsAbsent(JSON.stringify(W.todos.snapshot()), minted) && W.walk(W.dd).every((t) => !t.includes(minted)), 'the card, the For-you store and every file of the data dir hold no spelling of the value (the card is an accident road)');
  W.jm.vaultChanged('vault-approved'); W.jm.start(job); W.jm.vaultChanged('vault-unlocked');
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  rows.rejudge = cards(W).length;
  row(cards(W).length === 1 && job.state === 'waiting', 'every re-judge of the waiting job (an approval change, a start, an unlock) files NO second card — one per job × entry', cards(W).length);
  const no = W.door.answer(a.askId, { answer: 'allow', reauthed: false, by: 'user', person: true });
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  row(!no.ok && no.code === 'reveal_needs_password' && W.grants.rowsFor('vault-job', a.entry).length === 0 && job.state === 'waiting' && cards(W).length === 1, '允许 WITHOUT this page\'s 验证是你 writes nothing (reveal_needs_password) — the job waits, the card stays', no);
  rows.unauthed = no;
  const bad = W.door.answer(a.askId, { answer: 'always', reauthed: true });
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  row(!bad.ok && bad.code === 'bad_job_answer' && cards(W).length === 1, 'an answer that is neither allow nor deny is refused by name, nothing written', bad);
  const yes = W.door.answer(a.askId, { answer: 'allow', reauthed: true, by: 'user', person: true });
  await W.until(() => W.got().length === 1 && job.state === 'done');
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  const gr = W.grants.rowsFor('vault-job', a.entry)[0] || {}, m = (gr.to || [])[0] || {}, res = resolvedOf(W, a.askId);
  row(yes.ok && yes.outcome === 'allowed' && (gr.to || []).length === 1 && m.kind === 'conversation' && m.key === 'conv-a' && JSON.stringify(m.jobs) === JSON.stringify([job.id]) && res.resolvedBy === 'allowed' && res.resolvedFact && res.resolvedFact.decidedBy === 'person' && cards(W).length === 0,
    '允许 WITH 验证是你: ONE member (the owner conversation, jobs [this job]) through the grants store\'s ONE writer; the card closed «allowed», the person\'s mark on it', { yes, to: gr.to, by: res.resolvedBy });
  row((W.got()[0] || {}).v === minted && job.runs.length === 1, 'the waiting job starts BY ITSELF at the allow (the row\'s change) — with the minted value', { runs: job.runs.length });
  const au = jobLines(W).filter((l) => l.includes(`"askId":"${a.askId}"`));
  row(au.filter((l) => l.includes('"op":"ask"')).length === 1 && au.filter((l) => l.includes('"op":"allow"')).length === 1 && formsAbsent(jobLines(W).join('\n'), minted), 'exactly ONE vault-job audit line for its ask (three re-judges wrote none) and ONE for its allow — ids and references, never the value', au.length);
  rows[rows.length - 1].push(jobLines(W).filter((l) => l.includes(`"askId":"${a.askId}"`)));   // the lines it judged — printed green or red (2.369.413 lesson b)
  const again = W.door.answer(a.askId, { answer: 'deny', by: 'user', person: true });
  row(!again.ok && again.code === 'ask_settled', 'answered again ⇒ ask_settled (nothing changes)', again);
  W.end();
  return rows;
}
async function legDeny(doorSrc = null) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world('deny', { doorSrc });
  W.vault.agentMint('agent:conv-a/tok', { length: 32 }); W.release();
  const job = W.jm.jobs.get(W.create({ kind: 'service', restart: 'never' }).job.id);
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  const a = (cards(W)[0] || {}).action || {};
  const d = W.door.answer(a.askId, { answer: 'deny', by: 'user', person: true });
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  const res = resolvedOf(W, a.askId);
  rows.state = job.state;
  row(d.ok && d.outcome === 'denied' && job.state === 'failed' && job.desiredUp === false && job.runs.length === 0 && res.resolvedBy === 'denied' && W.journal.some((l) => l.includes(`${job.id} refused to run (vault-denied)`) && l.includes('vault_denied')) && W.grants.rowsFor('vault-job', a.entry).length === 0 && jobLines(W).some((l) => l.includes('"op":"deny"')),
    '拒绝 is a click: the job is REFUSED by name (vault_denied, said once) and never started; the card closed «denied»; nothing written; its audit line', { d, state: job.state, by: res.resolvedBy });
  rows[rows.length - 1].push([...W.journal.filter((l) => l.includes(job.id) && l.includes('refused')), ...jobLines(W).filter((l) => l.includes('"op":"deny"'))]);   // the lines it judged — printed green or red (2.369.413 lesson b)
  const r2 = W.create({ kind: 'task', name: 'deny2' }), j2 = W.jm.jobs.get(r2.job && r2.job.id);
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  row(!!j2 && j2.state === 'failed' && /less than 10 minutes ago/.test(String(r2.error)) && cards(W).length === 0, 'the same conversation × entry within 10 minutes of a Deny: the next job is refused by name (ask_quiet) — no new card', { err: r2.error, state: j2 && j2.state, n: cards(W).length });
  W.end();
  return rows;
}
async function legCaps(doorSrc = null) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world('caps', { doorSrc });
  W.vault.agentMint('agent:conv-a/tok', { length: 32 }); W.release();
  const made = []; for (let i = 0; i < 5; i++) made.push(W.create({ name: `cap${i}` }));
  const states = made.map((r) => (W.jm.jobs.get(r.job && r.job.id) || {}).state);
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  rows.n = cards(W).length;
  row(cards(W).length === 4 && states.slice(0, 4).every((s) => s === 'waiting') && states[4] === 'failed' && /Background Work jobs waiting for the user's approval/.test(String(made[4].error)), 'FOUR open cards per conversation: the fifth job is refused by name (too_many_asks) — never a silent wait', { n: cards(W).length, states, err: made[4].error });
  const first = W.jm.jobs.get(made[0].job.id), fa = ((cards(W).find((i) => i.action.jobId === first.id)) || {}).action || {};
  W.jm.rm(first);
  const overAt = await W.untilMs(() => resolvedOf(W, fa.askId).resolvedBy === 'ask-over', 8000);   // the card closes at the removal's LANDING (it rides it)
  const late = W.door.answer(fa.askId, { answer: 'allow', reauthed: true, by: 'user', person: true });
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  row(overAt.ok && resolvedOf(W, fa.askId).resolvedBy === 'ask-over' && cards(W).length === 3 && !late.ok && late.code === 'ask_settled' && W.grants.rowsFor('vault-job', fa.entry).length === 0 && jobLines(W).some((l) => l.includes('"op":"over"') && l.includes(fa.askId)), 'a waiting job REMOVED ⇒ its card closes (ask-over) — never an orphan card; a late 允许 writes nothing', { by: resolvedOf(W, fa.askId).resolvedBy, late });
  rows[rows.length - 1].push(jobLines(W).filter((l) => l.includes(fa.askId)));   // the lines it judged — printed green or red (2.369.413 lesson b)
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  const second = W.jm.jobs.get(made[1].job.id), sa = ((cards(W).find((i) => i.action.jobId === second.id)) || {}).action || {};
  W.jm.stop(second);
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  row(resolvedOf(W, sa.askId).resolvedBy === 'ask-over' && cards(W).length === 2 && second.state !== 'waiting', 'a waiting job STOPPED ⇒ its card closes (ask-over) — its next start asks again', { by: resolvedOf(W, sa.askId).resolvedBy, state: second.state });
  W.jm.start(second);
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  row(cards(W).filter((i) => i.action.jobId === second.id).length === 1 && second.state === 'waiting', '…and it does: start() files ONE new card');
  const D = doorOf(doorSrc).create({ vault: W.vault, grants: () => W.grants, userTodos: W.todos });   // the hub's bound, over the same store
  const fake = (i) => ({ id: `jb-${(0x10000000 + i).toString(16)}`, kind: 'task', owner: { conversation: { id: `conv-h${Math.floor(i / 4)}` } }, vault: [{ name: 'TOK', ref: `vault://agent:conv-h${Math.floor(i / 4)}/tok` }] });
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  const open0 = cards(W).length, room = VJ.ASKS_MAX - open0, got = [];
  for (let i = 0; i < room; i++) got.push(D.ask(fake(i), { missing: ['TOK'] }));
  const over = D.ask(fake(room), { missing: ['TOK'] });   // refused at once: a card being filed counts as one filed
  await D.factsLanded();
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  row(got.every((x) => x.ok && x.reading === 1) && cards(W).length === VJ.ASKS_MAX && !over.ok && over.code === 'too_many_asks_hub', `${VJ.ASKS_MAX} open cards on the hub: the next is refused by name (too_many_asks_hub)`, { open0, n: cards(W).length, code: over.code });
  W.end();
  return rows;
}
async function legCardRestart() {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world('crst');
  W.vault.agentMint('agent:conv-a/tok', { length: 32 }); W.release();
  const minted = W.vault.secretGet('agent:conv-a/tok').value.toString();
  const job = W.jm.jobs.get(W.create({ kind: 'service', restart: 'never' }).job.id);
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  const a = (cards(W)[0] || {}).action || {};
  W.end();
  const W2 = await world('crst', { dataDir: W.dd, vault: W.vault, grants: W.grants });
  await W2.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  const j2 = W2.jm.jobs.get(job.id), n = cards(W2).length;
  const yes = W2.door.answer(a.askId, { answer: 'allow', reauthed: true, by: 'user', person: true });
  await W2.until(() => W2.got().length === 1);
  row(!!j2 && n === 1 && yes.ok && (W2.got()[0] || {}).v === minted, 'a card filed BEFORE a restart is still ONE card after it (the item IS the ask — the boot\'s re-judge files no second) and its 允许 starts the job', { n, yes, got: W2.got().length });
  W2.end();
  return rows;
}
// ── ⑨c THE ADVERSARIAL READ'S CURES (lane vault-job-approval) ─────────────────────────────────────────────────────────────────
async function legCronCard() {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world('ccard');
  W.vault.agentMint('agent:conv-a/tok', { length: 32 }); W.release();
  const task = { cmd: { argv: [process.execPath, path.join(W.root, 'prog.js'), path.join(W.root, 'out')], cwd: W.root }, vault: ['TOK=vault://agent:conv-a/tok'] };
  const mk = (name) => { const r = W.jm.create({ kind: 'cron', name, schedule: { everyMs: 3600e3 }, action: { type: 'spawn-task', task }, owner: { conversation: { id: 'conv-a' }, sessionId: 'w-a', createdBy: 'agent', groupsSnapshot: [] } }, { conversationId: 'conv-a', groups: new Set() }); return W.jm.jobs.get(r.job && r.job.id); };
  const runsOf = (c) => [...W.jm.jobs.values()].filter((j) => j.cronParent === c.id);
  const c1 = mk('cron-allow');
  W.jm._fireCron(c1, 'test');
  const k1 = runsOf(c1)[0];
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  const mine = cards(W).filter((i) => i.action.jobId === c1.id), a1 = (mine[0] || {}).action || {};
  row(!!k1 && k1.state === 'waiting' && k1.waitFor === 'approval' && mine.length === 1 && !cards(W).some((i) => i.action.jobId === k1.id), 'a SCHEDULED run that waits files ONE card — for its CRON (the approval is the schedule\'s: every fire reads it), never one per run', { k1: k1 && k1.state, n: mine.length });
  const y = W.door.answer(a1.askId, { answer: 'allow', reauthed: true, by: 'user', person: true });
  await W.untilMs(() => W.got().length >= 1 && k1.state === 'done', 4000);
  const m1 = (((W.grants.rowsFor('vault-job', a1.entry)[0] || {}).to || [])[0] || {}).jobs || [];
  row(y.ok && JSON.stringify(m1) === JSON.stringify([c1.id]) && k1.state === 'done', '允许 on the cron\'s card writes the CRON\'s id — its waiting run starts with the value', { y, m1, k1: k1.state });
  const runs0 = runsOf(c1).reduce((n, k) => n + (k.runs || []).length, 0), got0 = W.got().length;
  W.jm._fireCron(c1, 'test');   // a cron's fires may reuse its run record — counted by RUNS, never by child records
  const fired = await W.untilMs(() => W.got().length > got0 && runsOf(c1).reduce((n, k) => n + (k.runs || []).length, 0) > runs0 && runsOf(c1).every((k) => k.state !== 'waiting'), 4000);
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  row(fired.ok && cards(W).filter((i) => i.action.jobId === c1.id).length === 0, '…and its next fire runs at once — no card (every fire reads the cron\'s approval)', { fired, runs0, got: W.got().length, states: runsOf(c1).map((k) => k.state) });
  const c2 = mk('cron-deny');
  W.jm._fireCron(c2, 'test');
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  const k2 = runsOf(c2)[0], a2 = ((cards(W).find((i) => i.action.jobId === c2.id)) || {}).action || {};
  const d = W.door.answer(a2.askId, { answer: 'deny', by: 'user', person: true });
  row(d.ok && c2.state === 'failed' && c2.desiredUp === false && c2.nextFireAt == null && !!k2 && k2.state === 'failed', '拒绝 on a cron\'s card refuses the SCHEDULE whole (no next fire) and its waiting run', { d, c2: c2.state, k2: k2 && k2.state });
  W.end();
  return rows;
}
async function legDenyVaultWait(jobs = null) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world(jobs ? 'dlockm' : 'dlock', { jobs });
  W.vault.agentMint('agent:conv-a/tok', { length: 32 }); W.release();
  const job = W.jm.jobs.get(W.create({ kind: 'service', restart: 'never', name: 'dlock' }).job.id);
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  const a = ((cards(W).find((i) => i.action.jobId === job.id)) || {}).action || {};
  W.vault.lock('boot', { quiet: true });   // THE LOCKED BOOT'S STATE — no lock ACT (a restart is none: its card, filed before, stays open); a lock ACT withdraws the cards (B-a08e r1665, ⑩e)
  W.jm.start(job);   // a re-judge while locked (a boot's replay reads the same): the approval wait is now a VAULT wait — its card still open
  const before = job.waitFor;
  const d = W.door.answer(a.askId, { answer: 'deny', by: 'user', person: true });
  rows.state = job.state;
  row(before === 'vault' && d.ok && job.state === 'failed' && job.desiredUp === false && W.journal.some((l) => l.includes(`${job.id} refused to run (vault-denied)`)), 'a Deny after the wait turned into a VAULT wait (a locked boot\'s re-judge) still REFUSES the job by name — never a card closed «denied» over a job that waits on', { before, d, state: job.state });
  rows[rows.length - 1].push(W.journal.filter((l) => l.includes(job.id) && l.includes('refused')));   // the lines it judged — printed green or red (2.369.413 lesson b)
  W.end();
  return rows;
}
async function legCapJobs(doorSrc = null) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world(doorSrc ? 'capjm' : 'capj', { doorSrc });
  for (let i = 1; i <= 5; i++) W.vault.agentMint(`agent:conv-a/t${i}`, { length: 32 });
  W.vault.agentMint('agent:conv-a/tok', { length: 32 }); W.release();
  const five = W.jm.jobs.get(W.create({ name: 'five', vault: [1, 2, 3, 4, 5].map((i) => `K${i}=vault://agent:conv-a/t${i}`) }).job.id);
  rows.state = five.state;
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  row(five.state === 'waiting' && five.waitFor === 'approval' && cards(W).filter((i) => i.action.jobId === five.id).length === 5, 'a job with FIVE entries to approve WAITS on five cards — the cap counts JOBS (four per conversation), so a job with many values can still start', { state: five.state, n: cards(W).length });
  const two = W.jm.jobs.get(W.create({ name: 'two', vault: ['A=vault://agent:conv-a/tok', 'B=vault://agent:conv-a/tok'] }).job.id);
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  row(two.state === 'waiting' && cards(W).filter((i) => i.action.jobId === two.id).length === 1, 'two NAMEs on ONE entry: one card (one per job × entry)', cards(W).filter((i) => i.action.jobId === two.id).length);
  W.end();
  return rows;
}
async function legOwnAndGone() {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world('owng');
  W.put(SENT('own')); W.release();
  const own = W.jm.jobs.get(W.create({ name: 'own' }).job.id);
  await W.untilMs(() => own.state === 'done', 4000);
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  row(own.state === 'done' && cards(W).length === 0, 'a value the conversation PUT itself files NO card — the job just runs', { state: own.state, n: cards(W).length });
  W.vault.agentMint('agent:conv-a/m1', { length: 32 });
  const job = W.jm.jobs.get(W.create({ name: 'gone', vault: ['TOK=vault://agent:conv-a/m1'] }).job.id);
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  const a = ((cards(W).find((i) => i.action.jobId === job.id)) || {}).action || {};
  W.vault.secretDrop('agent:conv-a/m1');   // the entry deleted while its card is open
  const y = W.door.answer(a.askId, { answer: 'allow', reauthed: true, by: 'user', person: true });
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  row(!y.ok && y.code === 'entry_unknown' && W.grants.rowsFor('vault-job', a.entry).length === 0 && resolvedOf(W, a.askId).resolvedBy === 'ask-over', '允许 on the card of an entry DELETED meanwhile writes nothing (entry_unknown — a later entry of that name never inherits it) and the card closes', { y, by: resolvedOf(W, a.askId).resolvedBy });
  W.end();
  return rows;
}
// ── ⑩ TAKEN BACK = STOPPED, A LOCK STOPS NOTHING (lane vault-job-approval — the owner's decisions ④ ③) ────────────────────────
async function approvedService(W, name) {   // a service the owner approved, running and holding its value
  const job = W.jm.jobs.get(W.create({ kind: 'service', restart: 'never', name }).job.id);
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  const a = ((cards(W).find((i) => i.action.jobId === job.id)) || {}).action || {};
  const y = W.door.answer(a.askId, { answer: 'allow', reauthed: true, by: 'user', person: true });
  const up = await W.untilMs(() => W.got().length >= 1 && job.state === 'up', 4000);
  return { job, a, ok: !!(y.ok && up.ok) };
}
async function legRevoke(doorSrc = null) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world('revk', { doorSrc });
  W.vault.agentMint('agent:conv-a/tok', { length: 32 });
  const { job, a, ok: up } = await approvedService(W, 'revk');
  const t0 = W.told.length;
  const rv = W.door.revoke(a.entry, job.id, { by: 'user' });
  await W.untilMs(() => job.state !== 'up' && job.state !== 'starting', 3000);
  rows.desired = job.desiredUp;   // the control's signal: the stop's own intent (no clock — the program also exits by itself after ~3 s)
  const notes = W.told.slice(t0).filter((x) => /took back its vault entry/.test(x.text));
  row(up && rv.ok && rv.outcome === 'revoked' && rv.stopped === true && W.grants.rowsFor('vault-job', a.entry).length === 0 && job.desiredUp === false && !['up', 'starting'].includes(job.state),
    'REVOKE = STOP: the ✕ takes the job out of the entry\'s row (no member left — the row gone) and STOPS it at once (desiredUp false: no restart)', { up, rv, state: job.state, desired: job.desiredUp });
  row(notes.length === 1 && notes[0].cid === 'conv-a' && /a value it read cannot be taken back/.test(notes[0].text) && notes[0].text.length <= 400 && jobLines(W).some((l) => l.includes('"op":"revoke"')), 'ONE notice to the owner conversation (the user took it back, the job stopped, a value already read cannot be taken back) and its vault-job audit line', W.told.slice(t0));
  rows[rows.length - 1].push(jobLines(W).filter((l) => l.includes('"op":"revoke"')));   // the lines it judged — printed green or red (2.369.413 lesson b)
  const st = W.jm.start(job);
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  row(st.ok && st.state === 'waiting' && st.waitFor === 'approval' && cards(W).filter((i) => i.action.jobId === job.id).length === 1, 'its next start ASKS AGAIN: waiting for approval, ONE new card', st);
  const again = W.door.revoke(a.entry, job.id, { by: 'user' });
  row(!again.ok && again.code === 'not_approved', 'a ✕ on a job no longer approved ⇒ not_approved, nothing written', again);
  W.release(); W.end();
  return rows;
}
async function legEntryGone(doorSrc = null) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world('gone', { doorSrc });
  W.vault.agentMint('agent:conv-a/tok', { length: 32 });
  const { job, a, ok: up } = await approvedService(W, 'gone');
  const j2 = W.jm.jobs.get(W.create({ name: 'gone2' }).job.id);   // a second job naming the entry, still waiting for its approval
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  const c2 = cards(W).filter((i) => i.action.jobId === j2.id).length;
  const t0 = W.told.length;
  const d = W.door.dropRow(a.entry, { by: 'user' });
  W.vault.secretDrop('agent:conv-a/tok');
  const n = W.door.entryGone(a.entry, { label: 'tok' });
  await W.untilMs(() => job.state !== 'up' && job.state !== 'starting', 3000);
  rows.desired = job.desiredUp;
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  row(up && c2 === 1 && d.ok && JSON.stringify(d.jobs) === JSON.stringify([job.id]) && W.grants.rowsFor('vault-job', a.entry).length === 0 && n === 2 && job.desiredUp === false && !['up', 'starting'].includes(job.state) && j2.state === 'failed' && cards(W).filter((i) => i.action.jobId === j2.id).length === 0,
    'AN ENTRY DELETED: its row goes FIRST (naming the approved job), then every job naming the entry stops — the running one stopped (desiredUp false), the waiting one refused by name (entry_unknown), its card closed', { up, c2, d, n, state: job.state, j2: j2.state });
  row(W.told.slice(t0).filter((x) => /deleted its vault entry/.test(x.text)).length === 1, 'ONE notice to the running job\'s owner conversation (the waiting one\'s refusal is its own words)', W.told.slice(t0));
  W.release(); W.end();
  return rows;
}
async function legGone() {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world('jgone');
  W.vault.agentMint('agent:conv-a/tok', { length: 32 }); W.release();
  const mk = async (name) => { const j = W.jm.jobs.get(W.create({ name }).job.id); await W.door.factsLanded(); const a = ((cards(W).find((i) => i.action.jobId === j.id)) || {}).action || {}; W.door.answer(a.askId, { answer: 'allow', reauthed: true, by: 'user', person: true }); await W.untilMs(() => j.state === 'done', 4000); return { j, a }; };
  const { j: j1, a } = await mk('g1'), { j: j2 } = await mk('g2');
  const jobsOf = () => (((W.grants.rowsFor('vault-job', a.entry)[0] || {}).to || [])[0] || {}).jobs || [];
  const before = jobsOf().slice();
  W.jm.rm(j1);
  const rmLanded = await W.untilMs(() => jobsOf().length < 2, 8000);   // the approval leaves at the removal's LANDING (it rides it)
  const afterRm = jobsOf().slice();
  W.jm.clearJobs([j2.id], { by: 'owner' });
  const clearLanded = await W.untilMs(() => W.grants.rowsFor('vault-job', a.entry).length === 0, 8000);   // …and at the clear's
  row(JSON.stringify(before) === JSON.stringify([j1.id, j2.id]) && rmLanded.ok && JSON.stringify(afterRm) === JSON.stringify([j2.id]) && clearLanded.ok && W.grants.rowsFor('vault-job', a.entry).length === 0 && jobLines(W).filter((l) => l.includes('"op":"gone"')).length === 2,
    'a job REMOVED takes its id out of the row; a job whose content is CLEARED too (its next start asks again) — the last one out, the row is gone (each at its landing)', { before, rmLanded, afterRm, clearLanded, left: W.grants.rowsFor('vault-job', a.entry) });
  rows[rows.length - 1].push(jobLines(W).filter((l) => l.includes('"op":"gone"')));   // the lines it judged — printed green or red (2.369.413 lesson b)
  W.end();
  return rows;
}
async function legLockRuns(doorSrc = null) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world('lkrun', { doorSrc });
  W.vault.agentMint('agent:conv-a/tok', { length: 32 });
  const { job, ok: up } = await approvedService(W, 'lkrun');
  W.vault.lock('door');
  for (let i = 0; i < 8; i++) { try { await W.jm._sweep(); } catch { } await nap(15); }
  rows.desired = job.desiredUp;
  const code = DOOR_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');   // the door's CODE (a comment naming the hook is no hook)
  const lockAt = code.indexOf('vault.onLock('), lockRoad = lockAt < 0 ? '' : code.slice(lockAt, code.indexOf('\n  });', lockAt));   // B-a08e (主开发 r1665): its ONE lock road — the cards' withdraw
  row(up && W.vault.state() === 'locked' && job.state === 'up' && job.desiredUp !== false && job.runs.length === 1 && (code.match(/\bonLock\(/g) || []).length === 1 && /withdrawAll\(\)/.test(lockRoad) && !/\bjm\b/.test(lockRoad), 'A LOCK STOPS NOTHING RUNNING (decision ③): the vault locked, the approved service runs on — its one run untouched; the job door\'s ONE lock road withdraws cards and touches no job', { up, state: job.state, runs: job.runs.length });
  W.release(); W.end();
  return rows;
}
// B-a08e (主开发 r1665 — the lock's «asks» consequence, test-vault-engine's census): A LOCK WITHDRAWS EVERY UNANSWERED APPROVAL CARD —
// closed «vault_locked» by the door itself (never «closed elsewhere»: its job is NOT refused); the job keeps WAITING (a lock stops no
// job) and at the unlock it is judged again and ONE new card is filed
async function legLockWithdraw(doorSrc = null) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world('lkwd', { doorSrc });
  W.vault.agentMint('agent:conv-a/tok', { length: 32 }); W.release();
  const job = W.jm.jobs.get(W.create({}).job.id);
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  const a = (cards(W)[0] || {}).action || {};
  W.vault.lock('door');
  await W.door.factsLanded();
  const res = resolvedOf(W, a.askId);
  rows.locked = { open: cards(W).length, by: res.resolvedBy || null, state: job.state, waitFor: job.waitFor };
  row(!!a.askId && cards(W).length === 0 && res.resolvedBy === 'vault_locked' && job.state === 'waiting', 'a LOCK withdraws the open approval card — closed «vault_locked» by the door — and its job keeps WAITING (never refused: a lock stops no job)', rows.locked);
  await W.vault.unlock(PW);
  await W.door.factsLanded();
  const b = (cards(W)[0] || {}).action || {};
  row(cards(W).length === 1 && VJ.ASK_ID_RE.test(String(b.askId)) && b.askId !== a.askId && b.jobId === job.id && job.state === 'waiting', 'at the UNLOCK the waiting job is judged again and ONE new card is filed (a new ask)', { n: cards(W).length, before: a.askId, after: b.askId, state: job.state });
  const au = jobLines(W).filter((l) => l.includes(`"askId":"${a.askId}"`) && l.includes('"why":"locked"'));
  row(au.length === 1, 'ONE vault-job audit line says the card was withdrawn by the lock (ids only)', au.length);
  W.end();
  return rows;
}
// 主开发 r1874 (round w7w1lo9et's MUST): THE WITHDRAW IS THE LOCK'S — owed to For you's read, it withdraws ONLY if the vault is locked
// THEN. The scene: a card open in the file from before a restart; For you HELD unread at the boot; a re-judge owes the ask to the read;
// the vault LOCKS (the withdraw owed); it UNLOCKS (nothing more owed); the store READS: the owed re-judge finds the file's open card and
// files nothing — and the owed withdraw, asked the state, leaves it: ONE open card, the job waiting on it. RED: the state not asked
async function legHeldWithdraw(doorSrc = null) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world(doorSrc ? 'hwdm' : 'hwd');
  W.vault.agentMint('agent:conv-a/tok', { length: 32 }); W.release();
  const job = W.jm.jobs.get(W.create({ name: 'hwd' }).job.id);
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  const a = (cards(W).find((i) => i.action.jobId === job.id) || {}).action || {};
  W.end(); W.vault.close();   // the restart: this world's door and its hooks go with its vault engine (a quiet lock: no hook runs)
  const f = path.join(W.dd, 'user-todos.json'); fs.renameSync(f, f + '.kept');   // the file kept aside; the boot meets a read that fails (held)
  const v2 = VE.create({ dataDir: W.dd, kdf: { N: 1024, r: 8, p: 1 }, log: { log() { }, warn() { } }, idleTimer: false, register: false });
  await v2.unlock(PW);
  const W2 = await world(doorSrc ? 'hwdm' : 'hwd', { dataDir: W.dd, vault: v2, grants: W.grants, held: true, doorSrc });
  const j2 = W2.jm.jobs.get(job.id);
  const waited = await W2.untilMs(() => !!j2 && j2.state === 'waiting' && j2.waitFor === 'approval', 8000);
  W2.jm.vaultChanged('vault-approved');   // a re-judge while held: the ask is OWED to the read (the door's held road)
  W2.vault.lock('door');                  // the lock: its withdraw OWED to the read (For you is held)
  await W2.vault.unlock(PW);              // the unlock: its re-judge finds the ask owed already — nothing more is queued
  fs.rmdirSync(f); fs.renameSync(f + '.kept', f);
  const lifted = await W2.todos.readAgain();
  await W2.door.factsLanded();
  const open = cards(W2).filter((i) => i.action.jobId === job.id), res = resolvedOf(W2, a.askId);
  rows.after = { open: open.length, same: open.length === 1 && open[0].action.askId === a.askId, closedBy: res.resolvedBy || null, state: j2 && j2.state, waitFor: j2 && j2.waitFor };
  row(!!a.askId && waited.ok && lifted === true && W2.vault.state() === 'unlocked' && rows.after.same && !res.resolvedBy && j2.state === 'waiting' && j2.waitFor === 'approval',
    'HELD → the ask owed → the LOCK (its withdraw owed) → the UNLOCK → the READ: the withdraw asks the vault, finds it OPEN and closes nothing — the file\'s ONE card stays open, the job waiting on it', rows.after);
  W2.end();
  return rows;
}
// the REAL road of a delete: the Vault window's 删除 of a free entry (src/server/vault-paste-door.js dropEntry) over the real job door
const PASTE_PATH = path.join(REPO, 'src/server/vault-paste-door.js'), PASTE_SRC = fs.readFileSync(PASTE_PATH, 'utf8');
const pasteOf = (src) => { if (!src) return R('src/server/vault-paste-door.js'); const m = new Module(PASTE_PATH, null); m.filename = PASTE_PATH; m.paths = Module._nodeModulePaths(path.dirname(PASTE_PATH)); m._compile(src, PASTE_PATH); return m.exports; };
async function legPasteDelete(pasteSrc = null) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world('pdel');
  const paste = pasteOf(pasteSrc).create({ vault: W.vault, userTodos: W.todos, vaultJob: W.door, log: () => { } });
  const S = SENT('pdel');
  const add = paste.addEntry({ label: 'Bot token', kind: 'api-key', value: S, by: 'user' });
  const job = W.jm.jobs.get(W.create({ kind: 'service', restart: 'never', name: 'pdel', vault: [`TOK=${add.ref}`] }).job.id);
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  const a = ((cards(W).find((i) => i.action.jobId === job.id)) || {}).action || {};
  W.door.answer(a.askId, { answer: 'allow', reauthed: true, by: 'user', person: true });
  const up = await W.untilMs(() => W.got().length >= 1 && job.state === 'up', 4000);
  const del = paste.dropEntry(String(add.entry || '').replace(/^secret:/, ''), { by: 'user' });
  await W.untilMs(() => job.state !== 'up' && job.state !== 'starting', 3000);
  rows.desired = job.desiredUp; rows.acted = !!(add.ok && up.ok && del.ok);   // a control reads its intent only over a delete that HAPPENED on a running job
  row(add.ok && up.ok && (W.got()[0] || {}).v === S && del.ok && W.grants.rowsFor('vault-job', a.entry).length === 0 && job.desiredUp === false && !['up', 'starting'].includes(job.state) && W.told.some((x) => /deleted its vault entry «Bot token»/.test(x.text)),
    'THE REAL ROAD: a key the owner stored, a job approved on it and running — the Vault window\'s 删除 (vault-paste-door dropEntry) removes its approval row and STOPS the job, its owner told («Bot token» deleted)', { add: add.ok, up: up.ok, del, state: job.state });
  W.release(); W.end();
  return rows;
}
// …and the AGENT's own entry's 删除 (B-3fb5 — vault-paste-door dropAgentEntry): the same two steps — its approval row first, then
// every job naming it stops (a value the hub minted, approved and running)
async function legAgentDelete(pasteSrc = null) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const tag = pasteSrc ? 'adelm' : 'adel';
  const W = await world(tag);
  W.vault.agentMint('agent:conv-a/tok', { length: 32 });
  const { job, a, ok: up } = await approvedService(W, tag);
  const paste = pasteOf(pasteSrc).create({ vault: W.vault, userTodos: W.todos, vaultJob: W.door, log: () => { } });
  const t0 = W.told.length;
  const del = paste.dropAgentEntry('agent:conv-a/tok', { by: 'user', who: 'the test' });
  const stopped = await W.untilMs(() => job.state !== 'up' && job.state !== 'starting', 3000);
  rows.desired = job.desiredUp; rows.acted = !!(up && del.ok);   // a control reads its intent only over a delete that HAPPENED on a running job
  if (pasteSrc) { W.release(); W.end(); return rows; }
  row(up && del.ok && W.grants.rowsFor('vault-job', a.entry).length === 0 && stopped.ok && job.desiredUp === false && !['up', 'starting'].includes(job.state) && W.told.slice(t0).filter((x) => /deleted its vault entry «/.test(x.text)).length === 1,
    'THE AGENT\'S ENTRY DELETED (B-3fb5\'s 删除 — vault-paste-door dropAgentEntry): its approval row removed, the approved service running on it STOPPED, its owner told once', { up, del, state: job.state, desired: job.desiredUp, stopped, told: W.told.slice(t0) });
  W.release(); W.end();
  return rows;
}
// ⑩d FOR YOU HELD UNREAD (B-44f3, the train's store-read law): while the tray's file cannot be read no card can be filed — the job
// WAITS (never refused for it: a refusal fails it and ends a schedule's next fire), a card's answer is refused by name
// (todos-unread), and at the read the job is judged again and its card filed
async function legHeld(doorSrc = null) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world(doorSrc ? 'heldm' : 'held', { held: true, doorSrc });
  W.vault.agentMint('agent:conv-a/tok', { length: 32 }); W.release();
  const job = W.jm.jobs.get(W.create({ name: 'held' }).job.id);
  const settled = await W.untilMs(() => job.state === 'failed' || (job.state === 'waiting' && job.waitFor === 'approval'), 8000);
  await W.door.factsLanded();   // a card being filed lands first (the control's copy files over the held tray THEN — and is refused)
  rows.state = job.state;
  if (doorSrc) { W.end(); return rows; }
  const held = W.todos.isHeldUnread();
  const ans = W.door.answer('vj-' + '0'.repeat(16), { answer: 'allow', reauthed: true, by: 'user', person: true });
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  row(held && settled.ok && job.state === 'waiting' && job.waitFor === 'approval' && cards(W).length === 0 && ans.code === 'todos-unread' && /For you cannot read its saved list/.test(String(ans.words || '')),
    'FOR YOU HELD UNREAD (B-44f3): the job WAITS for its approval (never refused for it), no card is filed over an unread list, and a card\'s answer is refused BY NAME (todos-unread, the store\'s own words)', { held, settled, state: job.state, waitFor: job.waitFor, ans });
  const f = path.join(W.dd, 'user-todos.json'); fs.rmdirSync(f); fs.writeFileSync(f, JSON.stringify({ items: [] }));
  const lifted = await W.todos.readAgain();
  const filed = await W.untilMs(() => cards(W).filter((i) => i.action.jobId === job.id).length === 1, 8000);
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  row(lifted === true && filed.ok && job.state === 'waiting' && job.waitFor === 'approval', 'at the READ the waiting job is judged again and its ONE card is filed (against the file\'s open items)', { lifted, filed, state: job.state, cards: cards(W).length });
  W.end();
  return rows;
}
// ── ⑫ THE FOLLOW (主开发 r850 — round w6tezed7d): the card's file facts OFF THE LOOP, bounded; legs for laws that had none ──────
const STALL_MS = 1500, BOUND_MS = 400, HOLD_MS = 350;
// a PLACED stall: every async read answers after STALL_MS (a slow / newly hung mount); a synchronous read is HELD HOLD_MS on the
// loop's own thread (Atomics.wait — no CPU spent) and counted — the real door makes none
const stallFs = () => {
  let sync = 0, answered = 0;
  const fake = { uid: 0, mode: 0o40755, isFile: () => true };
  const later = (v) => new Promise((r) => setTimeout(() => { answered++; r(v); }, STALL_MS));   // `answered`: how many stalled reads have answered (an event, never a clock)
  const hold = () => { sync++; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, HOLD_MS); };
  return { fsp: { stat: () => later(fake), realpath: (p) => later(p), statSync: () => { hold(); return fake; }, realpathSync: (p) => { hold(); return p; } }, syncCalls: () => sync, answered: () => answered };
};
async function legFactsOffLoop(doorSrc = null) {
  const D = doorOf(doorSrc), st = stallFs();
  let last = performance.now(), gap = 0;
  const iv = setInterval(() => { const t = performance.now(); gap = Math.max(gap, t - last); last = t; }, 5);   // the loop's turns, while the read runs
  const t0 = performance.now();
  const p = await D.programFacts({ argv: [process.execPath, '/srv/stalled/bot.js'], cwd: '/srv/stalled' }, { fsp: st.fsp, ms: BOUND_MS, state: D.newReadState() });
  const answeredThen = st.answered();   // the facts came back BEFORE any stalled read answered ⇔ the bound ended the read
  const took = Math.round(performance.now() - t0);
  clearInterval(iv);
  return { p, took, gap: Math.round(gap), sync: st.syncCalls(), answeredThen };
}
async function legFactsCard() {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world('fcard');
  const st = stallFs();
  const D = doorOf(null).create({ vault: W.vault, grants: () => W.grants, userTodos: W.todos, fsp: st.fsp, factsMs: BOUND_MS });
  const fake = { id: 'jb-1f000001', kind: 'task', owner: { conversation: { id: 'conv-a' } }, cmd: { argv: [process.execPath, '/srv/stalled/bot.js'], cwd: '/srv/stalled' }, vault: [{ name: 'TOK', ref: 'vault://agent:conv-a/tok' }] };
  const t0 = performance.now();
  const a = D.ask(fake, { missing: ['TOK'] });
  const before = cards(W).filter((i) => i.action.jobId === fake.id).length;
  const again = D.ask(fake, { missing: ['TOK'] });   // a re-judge while its facts are read: nothing read or filed twice
  await D.factsLanded();
  const answeredThen = st.answered(), took = Math.round(performance.now() - t0);   // filed before any stalled read answered ⇔ at the bound
  const mine = cards(W).filter((i) => i.action.jobId === fake.id), c = mine[0] || {}, f = c.facts || {};
  row(a.ok && a.reading === 1 && before === 0 && again.ok && !again.reading && mine.length === 1 && f.program && f.program.unread === true && f.program.writable === true && f.script && f.script.unread === true && /could not be read in time/.test(String(c.detail || '')) && answeredThen === 0,
    'THE CARD IS FILED WHEN ITS FILE FACTS LAND (主开发 r850 item 2): ask answers at once (reading 1, no card yet), a re-judge meanwhile reads nothing twice, and at the BOUND (never the stall\'s end) ONE card says its program\'s and script\'s facts «could not be read in time», counted as ones an agent can change', { a, before, again, answeredThen, took, program: f.program, script: f.script, cards: mine.length });
  W.end();
  return rows;
}
async function legWrapperSkip(doorSrc = null) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const D = doorOf(doorSrc);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${PREFIX}wrap-`)); ROOTS.add(dir);
  const script = path.join(dir, 'bot.js'); fs.writeFileSync(script, '// a scratch script\n');
  const node = fs.realpathSync(process.execPath), real = fs.realpathSync(script);
  // the wrapper itself, as the card would find it on PATH (its real path), or the word as typed when it is not installed
  const onPath = (w) => { for (const d of String(process.env.PATH || '').split(':').filter(Boolean)) { try { const p = fs.realpathSync(path.join(d, w)); if (fs.statSync(p).isFile()) return p; } catch { } } return w; };
  const understood = [['timeout', '3600'], ['nohup'], ['nice', '-n', '5'], ['env', 'A=1', 'B=2'], ['timeout', '--signal=KILL', '30s', 'nice', '-n', '5'], [],
    // 主开发 r1042 item 2: an option that takes a VALUE — never named as the program
    ['timeout', '-s', 'KILL', '60'], ['timeout', '--signal', 'KILL', '60'], ['timeout', '-k', '5', '60'], ['env', '-u', 'HOME'], ['env', 'FOO.BAR=1'], ['stdbuf', '-o', 'L'], ['stdbuf', '-oL'], ['taskset', '0x3'], ['taskset', '-c', '0-1'], ['nice', '-5']];
  // …and (主开发 r1091 — follow 3) every env word that changes WHERE the program is looked up: a change of folder, PATH assigned or
  // unset, an empty environment — the card names env itself, counted as one an agent can change
  const notUnderstood = [['timeout', '--weird', '5'], ['env', '-S', 'node bot.js'], ['taskset', '-p', '123'], ['stdbuf', '-x', 'L'],
    ['env', '-C', dir], ['env', `PATH=${path.dirname(process.execPath)}:/usr/bin`], ['env', '-u', 'PATH'], ['env', '--unset=PATH'], ['env', '-i'], ['env', '-']];
  // options end at the FIRST operand (as GNU reads them): a dash word after it is the program the wrapper would exec
  const operandEnds = [[['env', 'A=1', '-i'], '-i'], [['timeout', '60', '--'], '--']];
  const got = [], wrap = [];
  for (const pre of understood) { const p = await D.programFacts({ argv: [...pre, process.execPath, script, '--poll', '60'], cwd: dir }); got.push({ pre: pre.join(' ') || '(none)', program: p.program.path, script: p.script && p.script.path, command: p.command, unread: !!p.program.unread }); }
  for (const pre of notUnderstood) { const p = await D.programFacts({ argv: [...pre, process.execPath, script], cwd: dir }); wrap.push({ pre: pre.join(' '), program: p.program.path, want: onPath(pre[0]), script: p.script && p.script.path, command: p.command, unparsed: p.program.unparsed === true, writable: p.program.writable === true }); }
  const ends = [];
  for (const [pre, want] of operandEnds) { const p = await D.programFacts({ argv: [...pre, process.execPath, script], cwd: dir }); ends.push({ pre: pre.join(' '), program: p.program.path, want }); }
  rows.got = got;
  row(got.every((g) => g.program === node && g.script === real && g.command.endsWith('bot.js --poll 60') && !g.unread) && got.filter((g) => g.pre !== '(none)').every((g) => g.command.startsWith(g.pre.split(' ')[0] + ' ')),
    'THE WRAPPERS IN FRONT (rounds w6tezed7d, whmslzr9y): `timeout 3600`, `nohup`, `nice -n 5`, `env A=1 B=2`, two in a row — and an option that takes a VALUE (`timeout -s KILL 60`, `--signal KILL`, `-k 5`, `env -u HOME`, `env -C <dir>`, `stdbuf -o L`, `stdbuf -oL`, `taskset 0x3`, `taskset -c 0-1`, `nice -5`): the card names the program it RUNS (node\'s real path) and its script — never an option\'s value', got.filter((g) => !(g.program === node && g.script === real && g.command.endsWith('bot.js --poll 60') && !g.unread && (g.pre === '(none)' || g.command.startsWith(g.pre.split(' ')[0] + ' ')))));   // the cases that missed, whatever they missed
  row(wrap.every((w) => w.program === w.want && !w.script && w.command.startsWith(w.pre.split(' ')[0] + ' ') && w.unparsed && w.writable),
    'a word the wrapper\'s grammar does not understand (`timeout --weird`, `env -S`, `taskset -p`, `stdbuf -x`) — and every env word that changes WHERE the program is found (`env -C <dir>`, `env PATH=…`, `env -u PATH`, `--unset=PATH`, `env -i`, `env -`): the card names THE WRAPPER itself — what is literally run — the whole command as typed, what it starts counted as one an agent can change', wrap.filter((w) => !(w.program === w.want && !w.script && w.unparsed && w.writable)));
  row(ends.every((e) => e.program === e.want), 'options end at the FIRST operand, as GNU reads them: `env A=1 -i …` names «-i», `timeout 60 -- …` names «--» — the word the wrapper would exec', ends);
  return rows;
}
// ⑫c THE SECOND FOLLOW (主开发 r1042 — the narrow round whmslzr9y): ONE read on the pool at a time · a held read said · the wrappers' words
const heldFs = () => {
  const calls = []; let open = null;
  const gate = new Promise((r) => { open = r; });
  // the door's own timers are unref'd (they never hold the hub up): this ONE ref'd, bounded timer keeps the suite alive while a read is held
  const keep = setTimeout(() => { }, 15000);
  const free = () => { clearTimeout(keep); open(); };
  const fake = { uid: 0, mode: 0o40755, isFile: () => true };
  const on = (p, v) => { calls.push(String(p)); return String(p).startsWith('/srv/held/') ? gate.then(() => v) : Promise.resolve(v); };   // a path under /srv/held never replies until free()
  return { fsp: { stat: (p) => on(p, fake), realpath: (p) => on(p, p) }, calls, free };
};
async function legOneSlot(doorSrc = null) {
  const D = doorOf(doorSrc), h = heldFs(), state = D.newReadState();
  const a = D.programFacts({ argv: ['/srv/held/bin/prog'], cwd: '/srv/held' }, { fsp: h.fsp, ms: 300, state });
  const b = D.programFacts({ argv: ['/srv/ok/bin/prog'], cwd: '/srv/ok' }, { fsp: h.fsp, ms: 300, state });   // a SECOND card, filed while the first's read is held
  const [pa, pb] = await Promise.all([a, b]);
  const out = { a: pa.program, b: pb.program, okReads: h.calls.filter((c) => c.startsWith('/srv/ok/')).length, heldReads: h.calls.filter((c) => c.startsWith('/srv/held/')).length };
  h.free();
  // two cards on a HEALTHY folder (round wtjb84nh2): both read; the slot is a card's for its whole sequence — the second card's reads
  // all come after the first card's
  const h2 = heldFs(), st2 = D.newReadState();
  const [q1, q2] = await Promise.all([D.programFacts({ argv: ['/srv/ok1/bin/prog'], cwd: '/srv/ok1' }, { fsp: h2.fsp, ms: 2000, state: st2 }), D.programFacts({ argv: ['/srv/ok2/bin/prog'], cwd: '/srv/ok2' }, { fsp: h2.fsp, ms: 2000, state: st2 })]);
  h2.free();
  const i1 = h2.calls.map((c, i) => (c.startsWith('/srv/ok1/') ? i : -1)).filter((i) => i >= 0), i2 = h2.calls.map((c, i) => (c.startsWith('/srv/ok2/') ? i : -1)).filter((i) => i >= 0);
  out.pair = { read1: i1.length, read2: i2.length, unread: !!(q1.program.unread || q2.program.unread), inOrder: i1.length > 0 && i2.length > 0 && Math.max(...i1) < Math.min(...i2) };
  return out;
}
async function legHeldSaid() {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world('heldsaid');
  const h = heldFs(), logs = [];
  const D = doorOf(null).create({ vault: W.vault, grants: () => W.grants, userTodos: W.todos, fsp: h.fsp, factsMs: 300, log: (m) => logs.push(String(m)) });
  const fake = (n, dir) => ({ id: `jb-1f00010${n}`, kind: 'task', owner: { conversation: { id: 'conv-a' } }, cmd: { argv: [`${dir}/bin/prog`], cwd: dir }, vault: [{ name: 'TOK', ref: 'vault://agent:conv-a/tok' }] });
  const factsOf = (n) => ((cards(W).find((i) => i.action.jobId === `jb-1f00010${n}`)) || {});
  D.ask(fake(1, '/srv/held'), { missing: ['TOK'] }); await D.factsLanded();   // its folder never replies
  D.ask(fake(2, '/srv/ok'), { missing: ['TOK'] }); await D.factsLanded();     // a later card, a healthy folder: the slot is held
  const okBefore = h.calls.filter((c) => c.startsWith('/srv/ok/')).length, said = logs.filter((l) => /did not reply/.test(l));
  h.free();                                                                    // the held read replies: the slot is free again
  D.ask(fake(3, '/srv/ok'), { missing: ['TOK'] }); await D.factsLanded();
  const c1 = factsOf(1), c2 = factsOf(2), c3 = factsOf(3), f1 = c1.facts || {}, f2 = c2.facts || {}, f3 = c3.facts || {};
  row(!!c1.id && f1.program && f1.program.unread === true && !f1.held && !!c2.id && f2.program && f2.program.unread === true && f2.held === true && okBefore === 0 && /every card says its file facts could not be read/.test(String(c2.detail || '')) && said.length === 1,
    'A READ THAT NEVER REPLIES (主开发 r1042 items 1 + 3): its card says «could not be read in time»; a LATER card, on a healthy folder, reads nothing while that read holds the slot — still filed, its card says the earlier read did not reply and that this lasts until it replies or the hub restarts; the journal says it ONCE', { f1: f1.program, f2: { program: f2.program, held: f2.held }, okBefore, said });
  rows[rows.length - 1].push(said);   // the journal lines it judged
  row(!!c3.id && f3.program && !f3.program.unread && !f3.held && f3.program.writable === false, '…and once that read REPLIES the slot is free: the next card reads its facts again (root-owned here: not writable)', f3.program);
  W.end();
  return rows;
}
async function legClosedElsewhere(doorSrc = null) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world(doorSrc ? 'closem' : 'close', { doorSrc });
  W.vault.agentMint('agent:conv-a/tok', { length: 32 }); W.release();
  const job = W.jm.jobs.get(W.create({ kind: 'service', restart: 'never', name: 'closed' }).job.id);
  await W.door.factsLanded();
  const c = cards(W).find((i) => i.action.jobId === job.id) || {};
  // a GENERIC close (a tray ✕, «Mark all seen», a script) is refused by the store itself (a decision row's own verbs only) — the card
  // and its wait stay; its END (`ask-over`, one of the row's ends) written by ANOTHER road — never this door's settle — is the law's case
  let generic = null;
  try { if (c.id) W.todos.setStatus(c.id, 'done', 'user'); } catch (e) { generic = e && e.code; }
  const keptOpen = !!c.id && cards(W).some((i) => i.id === c.id) && job.state === 'waiting';
  try { if (c.id) W.todos.setStatus(c.id, 'done', 'ask-over'); } catch (e) { rows.closeErr = e && e.message; }
  const ended = await W.untilMs(() => job.state !== 'waiting', doorSrc ? 2000 : 8000);
  rows.state = job.state;
  if (doorSrc) { W.end(); return rows; }
  const entry = (c.action || {}).entry, askId = (c.action || {}).askId;
  row(generic === 'decision_row' && keptOpen, 'a GENERIC close of the card (a tray ✕) is refused by the store by name (decision_row) — the card and its job\'s wait stay', { generic, keptOpen });
  row(!!c.id && ended.ok && job.state === 'failed' && job.desiredUp === false && W.grants.rowsFor('vault-job', entry).length === 0 && W.journal.some((l) => l.includes(`${job.id} refused to run`) && l.includes('ask_closed')) && jobLines(W).some((l) => l.includes('"op":"over"') && l.includes(askId)),
    'A CARD ENDED THROUGH ANOTHER ROAD (its `ask-over` written to the store, never this door\'s settle): its job is REFUSED by name (ask_closed) and NOTHING is approved — never a job waiting for ever with no card', { filed: !!c.id, ended, state: job.state, closeErr: rows.closeErr });
  rows[rows.length - 1].push([...jobLines(W).filter((l) => askId && l.includes(askId)), ...W.journal.filter((l) => l.includes(job.id) && l.includes('refused'))]);   // the lines it judged
  W.end();
  return rows;
}
async function legRestartRevoke() {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world('rrev');
  W.vault.agentMint('agent:conv-a/tok', { length: 32 });
  const job = W.jm.jobs.get(W.create({ kind: 'service', restart: 'always', name: 'rrev' }).job.id);
  await W.door.factsLanded();
  const a = ((cards(W).find((i) => i.action.jobId === job.id)) || {}).action || {};
  W.door.answer(a.askId, { answer: 'allow', reauthed: true, by: 'user', person: true });
  const up = await W.untilMs(() => W.got().length >= 1 && job.state === 'up', 8000);
  const rv = W.door.revoke(a.entry, job.id, { by: 'user' });
  const down = await W.untilMs(() => !['up', 'starting'].includes(job.state), 8000);
  const runs0 = job.runs.length;
  { const r = require('../src/store-writer.js').storeWriter().flushSync([W.jm.file, W.jm.notifsFile]); if (r.deferred || (r.left && r.left.length)) throw new Error(`the revoke did not land before the restart point: ${JSON.stringify(r)}`); }
  W.end();
  // A HUB RESTART: a NEW engine (and a new door) over the same data folder and the same grants store
  const B = await world('rrev2', { dataDir: W.dd, vault: W.vault, grants: W.grants });
  const jb = B.jm.jobs.get(job.id), t0 = Date.now(), WAIT = M.SUPERVISE.backoffBaseMs + 1500;
  // past the supervisor's back-off with the new engine's sweeps — a restart would have started by then (a new run is what happened, or the time is)
  const past = await B.untilMs(() => (jb && jb.runs.length > runs0) || Date.now() - t0 >= WAIT, WAIT + 4000);
  row(up.ok && rv.ok && rv.stopped === true && down.ok && past.ok && !!jb && jb.desiredUp === false && jb.runs.length === runs0 && !['up', 'starting'].includes(jb.state) && B.grants.rowsFor('vault-job', a.entry).length === 0,
    'TAKEN BACK, THEN A HUB RESTART (a new engine over the same data folder): the restart:always service does NOT start on the old approval — no new run after the supervisor\'s back-off', { up, rv, down, past, state: jb && jb.state, desiredUp: jb && jb.desiredUp, runs: [runs0, jb && jb.runs.length] });
  const st = jb ? B.jm.start(jb) : {};
  await B.door.factsLanded();
  row(st.ok && st.state === 'waiting' && st.waitFor === 'approval' && cards(B).filter((i) => i.action.jobId === job.id).length === 1, '…and a start asks AGAIN — a fresh card (the old approval is gone)', { st: { ok: st.ok, state: st.state, waitFor: st.waitFor }, cards: cards(B).filter((i) => i.action.jobId === job.id).length });
  B.release(); B.end();
  return rows;
}
async function legSmalls() {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  // (1) a ✕ over an UNREADABLE grants store (its fail-closed row): the job still STOPS, the answer says so — nothing written
  const W = await world('small');
  W.vault.agentMint('agent:conv-a/tok', { length: 32 });
  const { job, a, ok: up } = await approvedService(W, 'small');
  const bad = { rowsFor: () => [{ door: 'vault-job', resource: a.entry, to: null }], onChange() { } };
  const D = doorOf(null).create({ vault: W.vault, grants: () => bad, userTodos: W.todos }); D.bindJobs(W.jm);
  const r = D.revoke(a.entry, job.id, { by: 'user' });
  const stopped = await W.untilMs(() => !['up', 'starting'].includes(job.state), 6000);
  row(up && r.ok === false && r.code === 'store_unreadable' && r.stopped === true && /nothing was written/.test(String(r.error)) && stopped.ok && job.desiredUp === false && W.grants.rowsFor('vault-job', a.entry).length === 1,
    'A ✕ OVER AN UNREADABLE APPROVALS STORE: the job is STOPPED all the same, the answer says store_unreadable with «nothing was written» (the page words it — vault-job-row.js)', { up, r, stopped, desiredUp: job.desiredUp });
  W.release(); W.end();
  // (2) the delete's job row cannot be written ⇒ the delete is REFUSED by name, the entry kept
  const W2 = await world('small2');
  const P2 = pasteOf(null).create({ vault: W2.vault, userTodos: W2.todos, vaultJob: { dropRow: () => ({ ok: false, code: 'not_written' }), entryGone() { throw new Error('never reached'); } }, log: () => { } });
  const e2 = P2.addEntry({ label: 'Kept key', kind: 'api-key', value: SENT('small2'), by: 'user' });
  const d2 = P2.dropEntry(String(e2.entry || '').replace(/^secret:/, ''), { by: 'user' });
  row(e2.ok && !d2.ok && d2.code === 'store_failed' && (W2.vault.secretNames() || []).some((s) => s && s.name === e2.entry), 'a delete whose Background-job row cannot be written is REFUSED (store_failed) and the entry is kept — never an entry gone with its approvals dangling', { e2: e2.ok, d2 });
  W2.end();
  // (3) the secret's drop fails AFTER its job row went ⇒ its jobs stop as TAKEN BACK (they would run on with no approval)
  const W3 = await world('small3');
  const v3 = Object.create(W3.vault); v3.secretDrop = () => ({ ok: false });
  const P3 = pasteOf(null).create({ vault: v3, userTodos: W3.todos, vaultJob: W3.door, log: () => { } });
  const e3 = pasteOf(null).create({ vault: W3.vault, userTodos: W3.todos, vaultJob: W3.door, log: () => { } }).addEntry({ label: 'Bot token', kind: 'api-key', value: SENT('small3'), by: 'user' });
  const job3 = W3.jm.jobs.get(W3.create({ kind: 'service', restart: 'never', name: 'small3', vault: [`TOK=${e3.ref}`] }).job.id);
  await W3.door.factsLanded();
  const a3 = ((cards(W3).find((i) => i.action.jobId === job3.id)) || {}).action || {};
  W3.door.answer(a3.askId, { answer: 'allow', reauthed: true, by: 'user', person: true });
  const up3 = await W3.untilMs(() => W3.got().length >= 1 && job3.state === 'up', 8000);
  const d3 = P3.dropEntry(String(e3.entry || '').replace(/^secret:/, ''), { by: 'user' });
  const s3 = await W3.untilMs(() => !['up', 'starting'].includes(job3.state), 6000);
  row(e3.ok && up3.ok && !d3.ok && d3.code === 'store_failed' && s3.ok && job3.desiredUp === false && W3.grants.rowsFor('vault-job', a3.entry).length === 0 && W3.told.some((x) => /took back its vault entry/.test(x.text)),
    'the secret\'s drop FAILS after its job row went: the delete is refused (store_failed) and the job is STOPPED as taken back — never running on with no approval', { e3: e3.ok, up3, d3, s3, desiredUp: job3.desiredUp });
  W3.release(); W3.end();
  return rows;
}
// ── ⑪ WHAT THE OWNER SEES (lane vault-job-approval L2): the Vault row's jobs, a job's uses, its starts counted ────────────────
async function legSurfaces(doorSrc = null) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world(doorSrc ? 'surfm' : 'surf', { doorSrc });
  W.vault.agentMint('agent:conv-a/tok', { length: 32 });
  const { job, a, ok: up } = await approvedService(W, 'surf');
  const f1 = W.door.rowFacts({ id: a.entry }) || [];
  const u1 = W.door.usesOf(job), lbl = W.jm.labelOf(job);
  rows.starts = (f1[0] || {}).starts;
  if (doorSrc) { W.release(); W.end(); return rows; }
  row(up && f1.length === 1 && f1[0].id === job.id && f1[0].name === lbl && f1[0].kind === 'service' && f1[0].state === 'running' && f1[0].starts === 1,
    'the Vault row\'s job facts (door rowFacts → the contents list\'s `jobs`): the approved job, its BELTED name (labelOf), a state CODE (running) and its starts counted from the audit (1) — never a value', f1);
  row(u1.length === 1 && u1[0].name === 'TOK' && u1[0].id === a.entry && u1[0].approved === true && typeof u1[0].label === 'string' && u1[0].label.length > 0 && JSON.stringify(W.jm.vaultUsesOf(job)) === JSON.stringify(u1),
    'a job\'s uses as its PERSON\'s card names them (usesOf / the engine\'s vaultUsesOf → GET /api/jobs `vaultUses`): the NAME, the entry\'s row id, its Vault name, approved', u1);
  const counted = W.vault.useCounts()['agent:conv-a/tok'] || {};
  row(counted.jobs && counted.jobs[job.id] === 1 && counted.uses >= 1, 'the use tally counts per job (src/vault-use.js countsOf `jobs`): the start that was handed the entry', counted);
  W.jm.stop(job);
  await W.untilMs(() => !['up', 'starting'].includes(job.state), 3000);
  const f2 = W.door.rowFacts({ id: a.entry }) || [];
  row(f2.length === 1 && f2[0].state === 'stopped', 'stopped, its chip says so (state code `stopped`) — still on the row: the approval stands until the ✕', f2);
  W.release(); W.end();
  const W2 = await world('surf2');
  W2.put(SENT('own2')); W2.release();
  const own = W2.jm.jobs.get(W2.create({ name: 'own2' }).job.id);
  const u2 = W2.door.usesOf(own);
  row(u2.length === 1 && u2[0].approved === false && W2.door.rowFacts({ id: 'secrets:agent:conv-a/tok#secret' }) === null, 'a value the conversation PUT: no approval (approved false — its card draws no ✕) and no chip on the Vault row', { u2, facts: W2.door.rowFacts({ id: 'secrets:agent:conv-a/tok#secret' }) });
  W2.end();
  return rows;
}
// the Vault row's chips (src/lib/vault-job-row.js) drawn under a minimal DOM — the words from the codes, the ✕ on every chip
async function legChips() {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const noop = () => { };
  const mk = (tag) => { const e = { tagName: tag, className: '', textContent: '', title: '', type: '', children: [], attrs: {}, dataset: {}, style: {}, append(...xs) { for (const x of xs) this.children.push(x); }, appendChild(x) { this.children.push(x); return x; }, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener: noop, classList: { add: noop, remove: noop, toggle: noop } }; return e; };
  const had = { window: globalThis.window, document: globalThis.document, localStorage: globalThis.localStorage, addEventListener: globalThis.addEventListener, removeEventListener: globalThis.removeEventListener };
  globalThis.window = globalThis; globalThis.addEventListener = globalThis.addEventListener || noop; globalThis.removeEventListener = globalThis.removeEventListener || noop;
  globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
  globalThis.document = { createElement: mk, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener: noop, removeEventListener: noop, documentElement: { style: {}, lang: 'en' }, body: mk('body'), head: mk('head') };
  try {
    const { pathToFileURL } = await import('node:url');
    const VJR = await import(pathToFileURL(path.join(REPO, 'src/lib/vault-job-row.js')).href);
    const r = { id: 'secrets:secret:k1#secret', jobs: [{ id: 'jb-0000aaaa', name: 'tg-bot', kind: 'service', state: 'running', starts: 3 }, { id: 'jb-0000bbbb', name: 'nightly', kind: 'cron', state: 'waiting-vault', starts: 0 }, { id: 'not-a-job', name: 'x', state: 'running' }] };
    const box = VJR.jobExtras(r, { refresh: noop }).box;
    const chips = box.children, words = chips.map((c) => c.children[0].textContent), xs = chips.map((c) => c.children[1]);
    row(chips.length === 2 && words[0] === 'Background job: tg-bot · running · started 3×' && words[1] === 'Background job: nightly · waiting for the unlock' && /vw-job-running/.test(chips[0].className) && /vw-job-waiting-vault/.test(chips[1].className),
      'one chip per approved job — «Background job: <name> · <state in words> · started N×» from the codes (an id that is no job id is never drawn)', words);
    row(xs.every((x) => x && x.tagName === 'button' && x.textContent === '✕' && x.type === 'button' && /the job stops now/.test(x.title) && x.attrs['aria-label'] === x.title && typeof x.onclick === 'function'), 'every chip carries its ✕ (a real button, its title and label say the job stops now)', xs.map((x) => x && x.title));
  } finally { for (const [k, v] of Object.entries(had)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; } }
  return rows;
}
// ── ⑩c THE SECOND ADVERSARIAL READ'S CURES (lane vault-job-approval) ──────────────────────────────────────────────────────────
async function legCronRevoke() {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world('crvk');
  W.vault.agentMint('agent:conv-a/tok', { length: 32 });
  const task = { cmd: { argv: [process.execPath, path.join(W.root, 'prog.js'), path.join(W.root, 'out')], cwd: W.root }, vault: ['TOK=vault://agent:conv-a/tok'] };
  const r = W.jm.create({ kind: 'cron', name: 'crvk', schedule: { everyMs: 3600e3 }, action: { type: 'spawn-task', task }, owner: { conversation: { id: 'conv-a' }, sessionId: 'w-a', createdBy: 'agent', groupsSnapshot: [] } }, { conversationId: 'conv-a', groups: new Set() });
  const cron = W.jm.jobs.get(r.job && r.job.id);
  W.jm._fireCron(cron, 'test');
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  const a = ((cards(W).find((i) => i.action.jobId === cron.id)) || {}).action || {};
  W.door.answer(a.askId, { answer: 'allow', reauthed: true, by: 'user', person: true });
  const child = [...W.jm.jobs.values()].find((j) => j.cronParent === cron.id);
  const up = await W.untilMs(() => W.got().length >= 1 && !!child && child.state === 'up', 4000);
  const t0 = W.told.length;
  const rv = W.door.revoke(a.entry, cron.id, { by: 'user' });
  const off = await W.untilMs(() => !!child && !['up', 'starting'].includes(child.state), 3000);
  row(up.ok && rv.ok && rv.stopped === true && cron.desiredUp === false && off.ok && !['up', 'starting'].includes(child.state) && W.told.slice(t0).filter((x) => /took back its vault entry/.test(x.text)).length === 1,
    'REVOKE on a SCHEDULE: its run that is UP holding the value is stopped with it (not only its waiting runs), no next fire, ONE notice', { up: up.ok, rv, cron: cron.desiredUp, child: child && child.state, told: W.told.slice(t0).map((x) => x.text.slice(0, 120)) });
  W.release(); W.end();
  return rows;
}
async function legRmNoRefile() {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world('rmref');
  W.vault.agentMint('agent:conv-a/tok', { length: 32 }); W.vault.agentMint('agent:conv-a/t2', { length: 32 }); W.release();
  const job = W.jm.jobs.get(W.create({ name: 'two-entries', vault: ['TOK=vault://agent:conv-a/tok', 'T2=vault://agent:conv-a/t2'] }).job.id);
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  const first = ((cards(W).find((i) => i.action.jobId === job.id && i.action.name === 'TOK')) || {}).action || {};
  W.door.answer(first.askId, { answer: 'allow', reauthed: true, by: 'user', person: true });   // approved on one entry, still waiting on the other
  const waits = job.state === 'waiting' && job.waitFor === 'approval';
  W.jm.rm(job);
  const landed = await W.untilMs(() => cards(W).filter((i) => i.action.jobId === job.id).length === 0 && W.grants.rowsFor('vault-job', first.entry).length === 0, 8000);   // at the removal's LANDING
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  row(waits && landed.ok && cards(W).filter((i) => i.action.jobId === job.id).length === 0 && W.grants.rowsFor('vault-job', first.entry).length === 0 && jobLines(W).filter((l) => l.includes('"op":"ask"') && l.includes(job.id)).length === 2,
    'a job REMOVED while approved on one entry and waiting on another leaves NO open card — its id leaves the row after it left the registry, so nothing re-judges it and no card is filed again', { waits, landed, open: cards(W).filter((i) => i.action.jobId === job.id).length });
  rows[rows.length - 1].push(jobLines(W).filter((l) => l.includes('"op":"ask"') && l.includes(job.id)));   // the lines it judged — printed green or red (2.369.413 lesson b)
  W.end();
  return rows;
}
async function legArchivePrune() {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world('arch');
  W.vault.agentMint('agent:conv-a/tok', { length: 32 }); W.release();
  const job = W.jm.jobs.get(W.create({ name: 'one-shot' }).job.id);
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  const a = ((cards(W).find((i) => i.action.jobId === job.id)) || {}).action || {};
  W.door.answer(a.askId, { answer: 'allow', reauthed: true, by: 'user', person: true });
  // each wait for WHAT HAPPENED, its outcome in the row (the first gate on the moved tip: 4 s bounds at load 67 — the run not yet
  // done or its wrapper still alive, the sweep archived nothing and the row did not say which)
  const done = await W.untilMs(() => job.state === 'done', 20000);
  const exited = await W.untilMs(() => !W.jm._verifyAlive(W.jm._readStamp(job)), 20000);   // the sweep keeps a job whose wrapper still lives (its last ms after the run's end)
  const named0 = JSON.stringify((((W.grants.rowsFor('vault-job', a.entry)[0] || {}).to || [])[0] || {}).jobs || []);
  const at = Date.now() + 30 * 86400e3, verdict = M.archiveVerdict(job, { now: at, alive: false, ...W.jm._archivePolicy() });   // the verdict under the ENGINE's policy (what the sweep reads)
  // B-0248 step 3: the records (and their approvals) leave at the archive's LANDING. A record CHANGED while its write was in flight
  // (its end notice booked after the hand-off: lastNotify, the notify log) stays the store's and the NEXT sweep moves it (the first
  // gate of the move: {archived: []} at the landing) — so the leg sweeps again while it stays, bounded, and says how many sweeps
  const tries = []; let sw = { archived: [] };
  for (const t0 = Date.now(); !(sw.archived || []).includes(job.id) && Date.now() - t0 < 20000;) {
    let got = null; const handed = W.jm.archiveSweep({ now: at, why: 'test', answer: (x) => { got = x; } });
    await W.untilMs(() => got !== null, 20000); sw = got || handed; tries.push(sw);
  }
  row(done.ok && exited.ok && named0 === JSON.stringify([job.id]) && (sw.archived || []).includes(job.id) && W.grants.rowsFor('vault-job', a.entry).length === 0, 'an ARCHIVED one-shot runs no more — its approval leaves the row (it never holds one of the member\'s 64 places for ever)', { done, exited, state: job.state, verdict, named0, sw, sweeps: tries.length });
  W.grants.set('vault-job', a.entry, { to: [{ kind: 'conversation', key: 'conv-a', jobs: ['jb-deadbeef'] }] }, 'test');   // an id an older version left behind
  const j2 = W.jm.jobs.get(W.create({ name: 'next' }).job.id);
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  const a2 = ((cards(W).find((i) => i.action.jobId === j2.id)) || {}).action || {};
  W.door.answer(a2.askId, { answer: 'allow', reauthed: true, by: 'user', person: true });
  const now2 = (((W.grants.rowsFor('vault-job', a.entry)[0] || {}).to || [])[0] || {}).jobs || [];
  row(JSON.stringify(now2) === JSON.stringify([j2.id]), 'an 允许 prunes the ids of jobs that no longer exist from the member as it writes it', now2);
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
  row(!!r.vaultWait && r.vaultWait.waitFor === 'vault' && r.vaultWait.words === VJ.waitWords('vault'), 'round 2: a scheduled job created while its fires would wait says so at once (`vaultWait`: the hub\'s words beside «scheduled»)', r.vaultWait);
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
async function legNoMasker(jobs = null) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world(jobs ? 'nomaskm' : 'nomask', { masker: false, jobs }), S = SENT('nomask');
  W.put(S); W.release();
  const r = W.create({});
  const job = W.jm.jobs.get(r.job.id);
  await W.until(() => ['done', 'failed'].includes(job.state) && W.uses(job.id).length > 0);
  const log = fs.readFileSync(job.runs[0].log, 'utf8');
  row(W.got().length === 0 && /refused: the log masker \(src\/vault-run\.js\) could not be loaded/.test(log) && !log.includes(S), 'no masker beside the wrapper ⇒ not started, by name (the job never ran, its value never reached the log)', log.slice(0, 300));
  const u = W.uses(job.id), counted = (W.vault.useCounts() || {})['agent:conv-a/tok'];
  rows.okLines = u.filter((x) => x.outcome === 'ok').length;
  row(u.length === 1 && u[0].outcome === 'refused:masker_missing' && rows.okLines === 0 && !(counted && counted.uses), 'round 2: …and its use line says so — 0 `ok` lines, ONE `refused:masker_missing` (the wrapper never acknowledged the frame; no «used N×»)', { u, counted });
  W.end();
  return rows;
}
async function legWindow() {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world('window', { wrap: swap(WRAP_SRC, 'const PROTO = 3;', 'const PROTO = 4;') }), S = SENT('window');
  W.put(S); W.release();
  const r = W.create({});
  const job = W.jm.jobs.get(r.job.id);
  await W.until(() => !['up', 'starting'].includes(job.state) && W.uses(job.id).length > 0);
  const u = W.uses(job.id);
  row(W.got().length === 0 && u.length === 1 && u[0].outcome === 'refused:update_window' && !u.some((x) => x.outcome === 'ok'), 'round 2: a wrapper of another protocol (an update in flight) never read the frame ⇒ 0 `ok` lines, ONE `refused:update_window`', { u, state: job.state });
  W.end();
  return rows;
}
async function mutantStart() {
  const name = 'CONTROL — r1\'s start answer (no wait answer): «what its last run left running is stopped first» for a waiting service — RED on the copy';
  try {
    const jobs = swap(swap(JOBS_SRC, "      if (job.state === 'waiting') return this._waitAnswer(job); // lane vault-job-road r2: it waits for its values — nothing is «stopped first»\n", ''), "      if (vw) return { ok: true, state: 'waiting', waitFor: vw.waitFor, after: `${after} — and its vault values would wait now: ${vw.words}` };\n", '');   // r1 had neither answer
    const W = await world('mutstart', { jobs }); W.put(SENT('ms')); W.vault.lock('door');
    const job = W.jm.jobs.get(W.create({ kind: 'service', restart: 'never' }).job.id);
    const st = W.jm.start(job);
    W.end();
    return [st.state !== 'waiting' && /stopped first/.test(String(st.after)), name, st];
  } catch (e) { return [false, name, `the copy could not be built (${e.message})`]; }
}
// the review: a start DEFERRED behind its last run (something it left still being cleared — `_pending`, held open here: the
// deferral never fires) whose values would wait now answers the wait — r2's first cut answered «stopped first» and the CLI «started»
async function legDeferred() {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world('defer'); W.put(SENT('defer')); W.vault.lock('door');
  const job = W.jm.jobs.get(W.create({ kind: 'service', restart: 'never' }).job.id);
  W.jm.stop(job);
  W.jm._pending = () => true; W.jm._clearBefore = () => new Promise(() => { });
  const st = W.jm.start(job);
  row(st.ok && st.state === 'waiting' && st.waitFor === 'vault' && String(st.after).endsWith(`and its vault values would wait now: ${VJ.waitWords('vault')}`) && job.state !== 'up' && job.runs.length === 0, 'round 2 (the review): a start deferred behind its last run whose values would wait now answers the WAIT (the CLI prints «waiting», never «started»)', st);
  delete job._starting; W.end();
  return rows;
}
// the review: a STOP that lands while the wrapper drains (the frame held back 600 ms in a jobs.js copy; the stop sent once the
// wrapper's SIGTERM handler is installed — its SigCgt) ⇒ the job never ran, ONE `refused:stopped`, no `ok`
const sigCaught = (pid, n) => { const m = /^SigCgt:\s*([0-9a-f]+)$/m.exec(procRead(pid, 'status')); return !!m && ((BigInt('0x' + m[1]) >> BigInt(n - 1)) & 1n) === 1n; };
const HELD = (() => { try { return swap(JOBS_SRC, '    s.end(frame, zero);\n  }', '    setTimeout(() => s.end(frame, zero), 600);\n  }'); } catch { return null; } })();
// int380 seam (B-7fda — red on two mirrors at load 7.5–8.5: armed, the job never ran, ONE refused:not_started, the stop settled 305 ms
// after it, inside the 600 ms hold): the stop is gated on the wrapper being IN its drain — a wrapper copy writes `draining.mark` in its
// ctl dir once drainValues has its listeners on fd 3 — never on its SIGTERM handler being installed (SigCgt), which holds BEFORE the
// drain begins. The facts print stays (armed / armMs / inDrain / drainMs / stopMs).
const DRAIN_AT = "    sock.on('close', () => { clearTimeout(timer); if (values) resolve({ values }); }); // the fd is closed now — nothing spawned after this inherits it\n";
const markDrain = (src) => swap(src, DRAIN_AT, DRAIN_AT + "    try { fs.writeFileSync(path.join(process.argv[2], 'draining.mark'), String(Date.now())); } catch { } // the leg's gate: IN its drain\n");
const LATE_DRAIN = (() => { try { return markDrain(swap(WRAP_SRC, 'if (VPLAN) drainValues().then(', 'if (VPLAN) new Promise((r) => setTimeout(r, 400)).then(() => drainValues()).then(')); } catch { return null; } })();
const HELD_LONG = (() => { try { return swap(JOBS_SRC, '    s.end(frame, zero);\n  }', '    setTimeout(() => s.end(frame, zero), 1500);\n  }'); } catch { return null; } })();
async function legStopDrain(wrap = WRAP_SRC) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  if (!HELD) { row(false, 'round 2: a stop while the wrapper drains — the jobs.js copy could not be built (its anchor is missing)'); return rows; }
  let marked = null; try { marked = markDrain(wrap); } catch { }
  if (!marked) { row(false, 'round 2: a stop while the wrapper drains — the drain-marker copy could not be built (its anchor is missing)'); return rows; }
  const W = await world(wrap === WRAP_SRC ? 'stopdrain' : 'stopdrainm', { jobs: HELD, wrap: marked }); W.put(SENT('sd')); W.release();
  const job = W.jm.jobs.get(W.create({}).job.id);
  const wpid = job.proc && job.proc.pid;
  const ctlOf = () => { const d = path.join(W.dd, 'job-logs', job.id); try { const r = fs.readdirSync(d).sort(); return r.length ? path.join(d, r[r.length - 1]) : null; } catch { return null; } };
  const inDrainNow = () => { const c = ctlOf(); return !!c && fs.existsSync(path.join(c, 'draining.mark')); };
  // int378 seam 6 (B-7fda, diagnostic only — no behaviour change): the facts say how long the arm took and when the stop was
  // read against the 600 ms hold (attempt 2 of ci/int378-r2: armed, got 0, ONE refused:not_started — the stop before the drain)
  const tArm = Date.now();
  for (let i = 0; i < 100 && !sigCaught(wpid, 15); i++) await nap(10);
  const armed = sigCaught(wpid, 15), armMs = Date.now() - tArm;
  const tDrain = Date.now();
  for (let i = 0; i < 500 && !inDrainNow(); i++) await nap(10);   // THE GATE: the wrapper IN its drain (bounded 5 s — never armed alone)
  const inDrain = inDrainNow(), drainMs = Date.now() - tDrain;
  const tStop = Date.now();
  W.jm.stop(job);
  await W.until(() => W.uses(job.id).length > 0 && !['up', 'starting'].includes(job.state));
  const u = W.uses(job.id), stopMs = Date.now() - tStop;
  rows.okLines = u.filter((x) => x.outcome === 'ok').length;
  row(armed && inDrain && W.got().length === 0 && u.length === 1 && u[0].outcome === 'refused:stopped' && rows.okLines === 0, 'round 2 (the review): a stop that lands while the wrapper drains ⇒ the job never ran, ONE `refused:stopped`, no `ok` (the ACK only after the stop is read)', { armed, armMs, inDrain, drainMs, stopMs, holdMs: 600, u, got: W.got().length });
  W.end();
  return rows;
}
// int380 seam (B-7fda) — THE CONTROL: a wrapper whose drain starts 400 ms AFTER its SIGTERM handler is installed (the frame held 1.5 s):
// the OLD precondition — the handler armed — holds while the wrapper is NOT in its drain (a stop then lands outside it: the old gate
// is red by name); the drain marker waits those 400 ms, and the stop lands inside the drain: ONE refused:stopped, the job never ran
async function legStopDrainLate() {
  if (!LATE_DRAIN || !HELD_LONG) return [false, 'CONTROL (B-7fda) — the late-drain copies could not be built (an anchor is missing)'];
  const W = await world('stopdrainlate', { jobs: HELD_LONG, wrap: LATE_DRAIN }); W.put(SENT('sl')); W.release();
  const job = W.jm.jobs.get(W.create({}).job.id);
  const wpid = job.proc && job.proc.pid;
  const ctlOf = () => { const d = path.join(W.dd, 'job-logs', job.id); try { const r = fs.readdirSync(d).sort(); return r.length ? path.join(d, r[r.length - 1]) : null; } catch { return null; } };
  const inDrainNow = () => { const c = ctlOf(); return !!c && fs.existsSync(path.join(c, 'draining.mark')); };
  for (let i = 0; i < 100 && !sigCaught(wpid, 15); i++) await nap(10);
  const armed = sigCaught(wpid, 15), inDrainAtArm = inDrainNow();   // what the OLD gate stopped on
  for (let i = 0; i < 500 && !inDrainNow(); i++) await nap(10);
  const inDrain = inDrainNow();
  W.jm.stop(job);
  await W.until(() => W.uses(job.id).length > 0 && !['up', 'starting'].includes(job.state));
  const u = W.uses(job.id), ran = W.got().length;
  W.end();
  return [armed && !inDrainAtArm && inDrain && ran === 0 && u.length === 1 && u[0].outcome === 'refused:stopped',
    'CONTROL (B-7fda) — a drain that starts 400 ms after the handler: the OLD precondition (armed) holds while the wrapper is NOT in its drain (red by name); the drain marker waits for it, and the stop then lands inside: ONE refused:stopped, nothing ran',
    { armed, inDrainAtArm, inDrain, ran, u: u.map((x) => x.outcome) }];
}
const EARLY_ACK = (() => { try { return swap(WRAP_SRC, '      if (stopping) { for (const v of r.values) v.fill(0); stoppedBefore(); }\n', '      try { fs.writeSync(3, Buffer.from([VJ.ACK])); } catch { }\n      if (stopping) { for (const v of r.values) v.fill(0); stoppedBefore(); }\n'); } catch { return null; } })();
const QUEUED = (() => { try { return swap(JOBS_SRC, '    s.end(frame, zero);\n  }', "    s.end(frame, zero);\n    note('ok');\n  }"); } catch { return null; } })();   // r1's line, written as the frame was queued
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

const [handed, locked, crash, boot, bootMut, approval, noMasker, noMaskerMut, windowRows, startMut, mutLock, deferred, stopDrain, stopDrainMut, cronStopped, cronMut, ...muts] = await Promise.all([
  legHanded(), legLocked(), legCrash(), legBoot(), legBoot(swap(JOBS_SRC, 'const vj = VJ.refsOf(job).length ? this._vaultGate(job, trigger) : null;', "const vj = VJ.refsOf(job).length && trigger !== 'boot' ? this._vaultGate(job, trigger) : null;")),
  legApproval(), legNoMasker(), QUEUED ? legNoMasker(QUEUED) : { okLines: -1 }, legWindow(), mutantStart(), mutantLock(), legDeferred(), legStopDrain(), EARLY_ACK ? legStopDrain(EARLY_ACK) : { okLines: -1 }, legCronStopped(),
  legCronStopped(swap(swap(JOBS_SRC, '    if (!job.cronParent) return true;\n', '    return true;\n'), "    if (job.kind === 'cron') for (const k of this.jobs.values()) if (k.cronParent === job.id) this._settleWait(k, 'its schedule was stopped');", '')), ...MUTANTS.map(([n, o, red]) => mutant(n, o, red)), legStopDrainLate(),
]);
// lane vault-job-approval: the card's legs and their mutants (each a copy of the door compiled at its real path)
const dmut = (from, to) => { try { return swap(DOOR_SRC, from, to); } catch { return null; } };
const MUT_REAUTH = dmut("    if (reauthed !== true) return named('reveal_needs_password');\n", '');
const MUT_DEDUPE = (() => { try { return swap(swap(DOOR_SRC, 'const fresh = need.filter((r) => !open.some((q) => q.jobId === jobId && q.entry === r.id) && !pend.has(`${jobId}\\n${r.id}`));', 'const fresh = need;'), '      if ([...asks.values()].some((q) => q.jobId === jobId && q.entry === r.id)) continue;\n', ''); } catch { return null; } })();   // both open-card checks cut (the ask\'s and the landing\'s)
const MUT_DENY = dmut("try { jm.vaultRefused(q.jobId, named('vault_denied', { key: q.name })); }", 'try { void q; }');
const MUT_CAP = dmut("    if (!mine.has(jobId) && mine.size + 1 > VJ.ASKS_PER_CONV) return named('too_many_asks');\n", '');
const [card, deny, caps, cardRestart, cardMutReauth, cardMutDedupe, denyMut, capsMut] = await Promise.all([legCard(), legDeny(), legCaps(), legCardRestart(),
  MUT_REAUTH ? legCard(MUT_REAUTH) : {}, MUT_DEDUPE ? legCard(MUT_DEDUPE) : {}, MUT_DENY ? legDeny(MUT_DENY) : {}, MUT_CAP ? legCaps(MUT_CAP) : {}]);
// ⑨c: the cures and their mutants — a Deny that refuses an APPROVAL wait only (r1's engine), a cap that counts CARDS (r1's door)
const MUT_DENYWAIT = (() => { try { return swap(JOBS_SRC, "    if (job.state !== 'waiting') return false;\n    this._vaultRefuse(job, v0, trigger);", "    if (job.state !== 'waiting' || job.waitFor !== 'approval') return false;\n    this._vaultRefuse(job, v0, trigger);"); } catch { return null; } })();
const MUT_CAPCARDS = dmut("    if (!mine.has(jobId) && mine.size + 1 > VJ.ASKS_PER_CONV) return named('too_many_asks');", "    if (open.filter((q) => q.conv === conv).length + fresh.length > VJ.ASKS_PER_CONV) return named('too_many_asks');");
const [cronCard, denyWait, capJobs, ownGone, denyWaitMut, capJobsMut] = await Promise.all([legCronCard(), legDenyVaultWait(), legCapJobs(), legOwnAndGone(),
  MUT_DENYWAIT ? legDenyVaultWait(MUT_DENYWAIT) : {}, MUT_CAPCARDS ? legCapJobs(MUT_CAPCARDS) : {}]);
// ⑩'s mutants: a ✕ that leaves the job running · a deleted entry that leaves it running · a lock that stops it
const MUT_REVOKE = dmut("try { stopped = !!(jm && jm.vaultRevoked(j, VJ.stopWords('revoked', entryLabelOf(VJ.entryOfRow(id))))); } catch (e) {", 'try { stopped = false; } catch (e) {');
const MUT_GONE = dmut('try { if (jm.vaultEntryGone(job.id, words)) n++; }', 'try { void words; }');
const MUT_LOCK = dmut('  const bindJobs = (engine) => { jm = engine || null; };', '  const bindJobs = (engine) => { jm = engine || null; try { vault.onLock(() => { for (const j of [...jm.jobs.values()]) if (VJ.refsOf(j).length) jm.stop(j); }); } catch { } };');
const pmut = (from, to) => { try { return swap(PASTE_SRC, from, to); } catch { return null; } };   // a copy of the paste door — its anchor gone ⇒ null, the control RED by name
const MUT_PASTE = pmut('    if (vaultJob) { try { vaultJob.entryGone(rowId, { label }); }', '    if (false) { try { vaultJob.entryGone(rowId, { label }); }');
const MUT_AGENT_DEL = pmut('    if (vaultJob) { try { vaultJob.entryGone(id, { label }); }', '    if (false) { try { vaultJob.entryGone(id, { label }); }');
const MUT_NOWITHDRAW = dmut("  if (typeof vault.onLock === 'function') vault.onLock(() => {\n", "  if (false) vault.onLock(() => {\n");   // B-a08e's control: the door without its lock road
const [lockWithdraw, lockWithdrawMut] = await Promise.all([legLockWithdraw(), MUT_NOWITHDRAW ? legLockWithdraw(MUT_NOWITHDRAW) : {}]);
const MUT_NOSTATE = dmut("    if (stateOf() !== 'locked') return;\n    index();", '    index();');   // r1874's control: the owed withdraw not asking the vault's state
const [heldWithdraw, heldWithdrawMut] = await Promise.all([legHeldWithdraw(), MUT_NOSTATE ? legHeldWithdraw(MUT_NOSTATE) : {}]);
const [revoke, gone, jgone, lockRuns, pdel, adel, revokeMut, goneMut, lockMut, pdelMut, adelMut] = await Promise.all([legRevoke(), legEntryGone(), legGone(), legLockRuns(), legPasteDelete(), legAgentDelete(),
  MUT_REVOKE ? legRevoke(MUT_REVOKE) : {}, MUT_GONE ? legEntryGone(MUT_GONE) : {}, MUT_LOCK ? legLockRuns(MUT_LOCK) : {}, MUT_PASTE ? legPasteDelete(MUT_PASTE) : {}, MUT_AGENT_DEL ? legAgentDelete(MUT_AGENT_DEL) : {}]);
const MUT_HELD = (() => { try { return swap(swap(DOOR_SRC, '    if (userTodos.isHeldUnread?.()) {\n', '    if (false) {\n'), '    if (userTodos.isHeldUnread?.()) return void ask(', '    if (false) return void ask('); } catch { return null; } })();   // ⑩d's control: the door files over a held tray (both held branches cut)
const [held, heldMut] = await Promise.all([legHeld(), MUT_HELD ? legHeld(MUT_HELD) : {}]);
// ⑫'s runs and controls: the bound removed (the card waits for the stall) · the read made SYNCHRONOUS (the loop held) · the listener of
// another door's close removed (the job waits for ever with no card)
const MUT_NOBOUND = dmut('t = setTimeout(() => res(LATE), left);', 't = setTimeout(() => res(LATE), left + 60e3);');
const MUT_SYNCREAD = dmut('const realOf = async (p) => (await call((x) => fsp.realpath(x), p)).v || null;', 'const realOf = async (p) => fsp.realpathSync(p);');
const MUT_ONSTATUS = dmut("  if (userTodos && typeof userTodos.onStatus === 'function') {\n", '  if (false) {\n');
// ⑫c's controls: the slot guard cut (a second card reads while the first is held) · an option's value named as the program (planted)
const MUT_NOSLOT = dmut('    if (lateHere || !(await take())) throw LATE;', '    if (lateHere) throw LATE;');
const MUT_VALUEPROG = dmut('function pastWrapper(argv, i) {\n', "function pastWrapper(argv, i) {\n  if (argv[i + 1] === '-s') return i + 2;\n");
const [oneSlot, oneSlotMut, heldSaid, wrapMut] = await Promise.all([legOneSlot(), MUT_NOSLOT ? legOneSlot(MUT_NOSLOT) : null, legHeldSaid(), MUT_VALUEPROG ? legWrapperSkip(MUT_VALUEPROG) : null]);
const [offLoop, offNoBound, offSync, factsCard, wrapSkip, closedElse, closedMut, restartRevoke, smalls] = await Promise.all([legFactsOffLoop(), MUT_NOBOUND ? legFactsOffLoop(MUT_NOBOUND) : null, MUT_SYNCREAD ? legFactsOffLoop(MUT_SYNCREAD) : null,
  legFactsCard(), legWrapperSkip(), legClosedElsewhere(), MUT_ONSTATUS ? legClosedElsewhere(MUT_ONSTATUS) : {}, legRestartRevoke(), legSmalls()]);
const MUT_STARTS = dmut('return n + (k === j || (c && c.cronParent === j) ? Number(v) || 0 : 0);', 'return n;');   // ⑪'s control: the starts never counted
const [cronRevoke, rmNoRefile, archivePrune] = await Promise.all([legCronRevoke(), legRmNoRefile(), legArchivePrune()]);   // ⑩c
const [surfaces, chips, surfacesMut] = await Promise.all([legSurfaces(), legChips(), MUT_STARTS ? legSurfaces(MUT_STARTS) : {}]);   // ⑪ (lane vault-job-approval L2)
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };
const print = (title, rows) => { console.log(title); for (const [c, n, e, judged] of rows) { ok(c, n, e); if (Array.isArray(judged)) { console.log(`      judged (${judged.length} line(s)):`); for (const l of judged.slice(0, 12)) console.log('        ' + String(l).slice(0, 240)); } } };   // a leg that judges journal / audit lines prints them
print('① HANDED, NEVER LEFT LYING', handed);
print('② LOCKED = WAIT', locked);
print('③ THE CRASH LOOP', crash);
console.log('④ A LOCKED BOOT WAITS (the frp class)');
ok(boot.waited, 'a service whose run ended, a new engine over its data dir, the vault locked: the boot replay starts NOTHING (waiting for the vault)');
ok(boot.after, 'the unlock starts it — with its value');
print('⑤ AN APPROVAL', approval);
print('⑥ NO MASKER, NO START', noMasker);
print('⑥b A STOPPED SCHEDULE STARTS NOTHING', cronStopped);
print('⑥c AN UPDATE WINDOW\'S WRAPPER (round 2)', windowRows);
print('⑥d A DEFERRED START · A STOP WHILE IT DRAINS (round 2, the review)', [...deferred, ...stopDrain]);
print('⑨ THE APPROVAL CARD (lane vault-job-approval — one card per job × entry, 允许 = 验证是你 + the grant row, 拒绝 = refused)', [...card, ...deny, ...caps, ...cardRestart]);
print('⑨c THE ADVERSARIAL READ\'S CURES — a cron\'s card, a Deny after a locked boot, the cap counts jobs, one card per entry, an own value, a deleted entry', [...cronCard, ...denyWait, ...capJobs, ...ownGone]);
console.log('⑨b MUTANTS of the card (each a copy of the door — RED)');
ok(!!MUT_DENYWAIT && denyWaitMut.state === 'waiting', 'CONTROL — a Deny that refuses only an APPROVAL wait (r1): the job still waits after the locked boot\'s re-judge — RED on the copy', MUT_DENYWAIT ? denyWaitMut.state : 'the copy could not be built (its anchor is missing)');
ok(!!MUT_CAPCARDS && capJobsMut.state === 'failed', 'CONTROL — the cap counting CARDS (r1): a five-entry job is refused for ever — RED on the copy', MUT_CAPCARDS ? capJobsMut.state : 'the copy could not be built (its anchor is missing)');
ok(!!MUT_REAUTH && !!cardMutReauth.unauthed && cardMutReauth.unauthed.ok === true, 'CONTROL — 允许 without 验证是你 (the door\'s reauth check removed): the row is WRITTEN — RED on the copy', MUT_REAUTH ? cardMutReauth.unauthed : 'the copy could not be built (its anchor is missing)');
ok(!!MUT_DEDUPE && cardMutDedupe.rejudge > 1, 'CONTROL — a card per re-judge (the open-card check removed): a second card — RED on the copy', MUT_DEDUPE ? cardMutDedupe.rejudge : 'the copy could not be built (its anchor is missing)');
ok(!!MUT_DENY && denyMut.state === 'waiting', 'CONTROL — a Deny that leaves its job (the refusal removed): the job still waits — RED on the copy', MUT_DENY ? denyMut.state : 'the copy could not be built (its anchor is missing)');
ok(!!MUT_CAP && capsMut.n === 5, 'CONTROL — no per-conversation bound: a fifth card — RED on the copy', MUT_CAP ? capsMut.n : 'the copy could not be built (its anchor is missing)');
print('⑩ TAKEN BACK = STOPPED · A LOCK STOPS NOTHING (lane vault-job-approval — decisions ④ ③)', [...revoke, ...gone, ...jgone, ...lockRuns, ...pdel, ...adel]);
print('⑩e A LOCK WITHDRAWS THE CARDS (B-a08e, 主开发 r1665) — the job waits, the unlock asks again', lockWithdraw);
ok(!!MUT_NOWITHDRAW && !!lockWithdrawMut.locked && lockWithdrawMut.locked.open === 1, 'CONTROL — the door without its lock road: the card stays OPEN over a locked vault — RED on the copy', MUT_NOWITHDRAW ? lockWithdrawMut.locked : 'the copy could not be built (its anchor is missing)');
print('⑩f THE WITHDRAW IS THE LOCK\'S (主开发 r1874) — owed to a held read, it withdraws only over a vault locked THEN', heldWithdraw);
ok(!!MUT_NOSTATE && !!heldWithdrawMut.after && heldWithdrawMut.after.open === 0 && heldWithdrawMut.after.closedBy === 'vault_locked', 'CONTROL — the owed withdraw not asking the state: the card is closed «vault_locked» over an OPEN vault and the job waits with no card — RED on the copy', MUT_NOSTATE ? heldWithdrawMut.after : 'the copy could not be built (its anchor is missing)');
console.log('⑩b MUTANTS (each a copy of the door — RED)');
ok(!!MUT_REVOKE && revokeMut.desired === true, 'CONTROL — a ✕ that leaves the job running (the stop removed): still meant to run (desiredUp) — RED on the copy', MUT_REVOKE ? revokeMut.desired : 'the copy could not be built (its anchor is missing)');
ok(!!MUT_GONE && goneMut.desired === true, 'CONTROL — a deleted entry that leaves its job running (the stop removed): still meant to run — RED on the copy', MUT_GONE ? goneMut.desired : 'the copy could not be built (its anchor is missing)');
ok(!!MUT_PASTE && pdelMut.acted === true && pdelMut.desired === true, 'CONTROL — the Vault window\'s delete that never tells the job door (vault-paste-door\'s entryGone call removed): the job runs on — RED on the copy', MUT_PASTE ? { acted: pdelMut.acted, desired: pdelMut.desired } : 'the copy could not be built (its anchor is missing)');
ok(!!MUT_AGENT_DEL && adelMut.acted === true && adelMut.desired === true, 'CONTROL — the agent entry\'s delete that never tells the job door (dropAgentEntry\'s entryGone call removed): the job runs on — RED on the copy', MUT_AGENT_DEL ? { acted: adelMut.acted, desired: adelMut.desired } : 'the copy could not be built (its anchor is missing)');
ok(!!MUT_LOCK && lockMut.desired === false, 'CONTROL — a lock that stops the jobs (a lock hook planted): the service is stopped (desiredUp false) — RED on the copy', MUT_LOCK ? lockMut.desired : 'the copy could not be built (its anchor is missing)');
print('⑩c THE SECOND READ\'S CURES — a schedule\'s revoke stops its running run, rm files nothing again, an archived job leaves the row, an allow prunes', [...cronRevoke, ...rmNoRefile, ...archivePrune]);
print('⑩d FOR YOU HELD UNREAD (B-44f3) — the job waits, the answer is refused by name, the card is filed at the read', held);
ok(!!MUT_HELD && heldMut.state === 'failed', 'CONTROL — the door filing over a held tray (its held branch removed): the add is refused, the job is FAILED for it — RED on the copy', MUT_HELD ? heldMut.state : 'the copy could not be built (its anchor is missing)');
console.log('⑫ THE FOLLOW (主开发 r850 — round w6tezed7d)');
{ const o = offLoop || {}, p = o.p || {};
  ok(p.program && p.program.unread === true && p.script && p.script.unread === true && o.sync === 0 && o.answeredThen === 0,
    'THE CARD\'S FILE FACTS OFF THE LOOP: a PLACED stall in every read — the facts come back at the BOUND, before any stalled read answered, with NO synchronous read on the loop\'s thread, and the facts it could not read are said «could not be read» (program and script)', { answeredThen: o.answeredThen, sync: o.sync, program: p.program, script: p.script });
  console.log(`      judged: stalled reads answered when the facts came back ${o.answeredThen} · synchronous reads ${o.sync} (said, not judged: took ${o.took} ms, the loop's longest gap ${o.gap} ms)`); }
ok(!!MUT_NOBOUND && !!offNoBound && offNoBound.answeredThen > 0, 'CONTROL — the bound removed: the facts come back only after the stall itself answered — RED on the copy', MUT_NOBOUND ? offNoBound && { answeredThen: offNoBound.answeredThen, took: offNoBound.took } : 'the copy could not be built (its anchor is missing)');
ok(!!MUT_SYNCREAD && !!offSync && offSync.sync > 0, 'CONTROL — the read made SYNCHRONOUS: the placed stall is read on the loop\'s own thread (each a held turn) — RED on the copy', MUT_SYNCREAD ? offSync && { sync: offSync.sync, gap: offSync.gap } : 'the copy could not be built (its anchor is missing)');
print('⑫b THE CARD AT ITS LANDING · THE WRAPPERS IN FRONT · A CARD CLOSED ELSEWHERE · A RESTART AFTER A TAKE-BACK · THE SMALLS', [...factsCard, ...wrapSkip, ...closedElse, ...restartRevoke, ...smalls]);
ok(!!MUT_ONSTATUS && closedMut.state === 'waiting', 'CONTROL — another door\'s close not heard (the store\'s listener removed): the job waits for ever with no card — RED on the copy', MUT_ONSTATUS ? closedMut.state : 'the copy could not be built (its anchor is missing)');
{ const o = oneSlot || {};
  ok(!!o.a && o.a.unread === true && !!o.b && o.b.unread === true && o.okReads === 0 && o.heldReads === 1,
    'ONE READ ON THE POOL AT A TIME (主开发 r1042 item 1): a SECOND card filed while the first card\'s read is held reads NOTHING (its facts «could not be read in time»), the held read the only one taken', o);
  ok(!!o.pair && o.pair.read1 > 0 && o.pair.read2 > 0 && !o.pair.unread && o.pair.inOrder === true, '…two cards on a HEALTHY folder both read — the second card\'s reads all after the first card\'s (the slot is a card\'s for its whole sequence: in a burst the earlier cards finish first)', o.pair); }
ok(!!MUT_NOSLOT && !!oneSlotMut && oneSlotMut.okReads > 0, 'CONTROL — the slot guard cut: the second card reads while the first is held (another pool thread) — RED on the copy', MUT_NOSLOT ? oneSlotMut && { okReads: oneSlotMut.okReads } : 'the copy could not be built (its anchor is missing)');
print('⑫c A HELD READ, SAID · THE NEXT CARD READS AGAIN', heldSaid);
ok(!!MUT_VALUEPROG && !!wrapMut && ((wrapMut.got || []).find((g) => g.pre === 'timeout -s KILL 60') || {}).program === 'KILL', 'CONTROL — an option\'s value taken for the program (planted: `-s` skipped without its value): the card says «Program: KILL» — RED on the copy', MUT_VALUEPROG ? wrapMut && ((wrapMut.got || []).find((g) => g.pre === 'timeout -s KILL 60') || {}) : 'the copy could not be built (its anchor is missing)');
print('⑪ WHAT THE OWNER SEES (L2) — the Vault row\'s jobs, a job\'s uses, the starts counted, the chips', [...surfaces, ...chips]);
ok(!!MUT_STARTS && surfacesMut.starts === 0, 'CONTROL — the Vault row\'s starts never counted (the door\'s tally removed): «started 0×» for a job that started — RED on the copy', MUT_STARTS ? surfacesMut.starts : 'the copy could not be built (its anchor is missing)');
console.log('⑦ MUTANTS');
ok(!bootMut.waited, 'CONTROL — a locked boot starts it (the gate skipped at the replay): RED on the copy');
ok(mutLock[0], mutLock[1]);
ok(!!cronMut.started, 'CONTROL — a stopped schedule\'s waiting run is still started at the unlock (its two guards removed): RED on the copy');
for (const [c, n, e] of muts) ok(c, n, e);
ok(noMaskerMut.okLines > 0, 'CONTROL — r1\'s use line (written as the frame was queued): an `ok` line for the run the wrapper refused — RED on the copy', QUEUED ? { okLines: noMaskerMut.okLines } : 'the copy could not be built (its anchor is missing)');
ok(startMut[0], startMut[1], startMut[2]);
ok(stopDrainMut.okLines > 0, 'CONTROL — a wrapper that ACKs before it reads the stop: an `ok` line for a job that never ran — RED on the copy', EARLY_ACK ? { okLines: stopDrainMut.okLines } : 'the copy could not be built (its anchor is missing)');
// THE SCRATCH: the jobs this suite started have ended (each leg waits for its end or stops it); a wrapper still booting could make
// its run dir again — swept twice, 300 ms apart, and what is left is counted
let left = sweepRoots(); await nap(300); left = sweepRoots();
ok(left === 0, `every scratch root this run made (${ROOTS.size} registered; ${PREFIX}* counted in the tmp dir, registered or not) is removed`, { left });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
console.log(`scratch roots left: ${left}`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
// B-a08e STAGE L3 — THE INDEPENDENT VERIFICATION of the vault's service secret for jobs (lane bl-proposals, 主开发 r2476): each leg
// states one law of design-vault-service-secret.zh.md (the owner's design of
// 10-30) and asks the REAL road — the vault engine on a scratch dir, the real JobManager, the real vault-job door, the real
// data/bin/job-wrapper.js, the real For-you store, a real job program; stand-in values only (a sentinel joined at run time).
// THE THREAT MODEL is the owner's: ACCIDENT (a value shown by mistake), never a deliberate agent. A RED here is a FINDING (a law the
// code does not keep); a GREEN leg is the positive control the finding needs. Its findings were cured in 2.369.417–2.369.419 (lines
// 564, 616 and 640): «ALL PASS (61)» at the release 2.369.419, both zones. Since B-a08e's last piece (主开发 r4366) it is a HEAVY row of
// scripts/ci.mjs (real job wrappers and children, the masker's settle waits: ~48 s alone). It stays the lane's check, written from the law
// and the design: a builder never edits it to fit its code.
//   F10 THE JOB LOG, a value written in TWO pieces with a quiet between them (a block-buffered stdout whose block edge falls in the
//       value — the next block may come minutes later): design D5 «job 日志在落盘之前按值擦» + the run door's §8.6 ③ «分块到两次写之间
//       ——我们留窗口». CONTROL: the same value in ONE write is masked
//   F11 THE JOB LOG at the main's EXIT (主开发 r2525: every place the masker is ended and started again mid-stream): the second
//       half written by the job's own child during the end's drain, a gap under the quiet
//   F12 THE CARD SAYS T6 (design §4: what the program writes to its own files, config, caches stays open — «卡上写»)
//   W1–W3 主开发 r2571's three walks (not reached in the first page): a value across the two pipes (the cut in SPACE); a wrapper
//       killed while the hub was down; a crasher started again past its minimum uptime (a stand-in clock)
//   R1/R2 主开发 r2601: a quiet releases the log's latest words — a short last line reaches the log, an until-marker completes its
//       task (a regression a one-masker cure can open; F10's walk stays beside them)
//   E1  主开发 r2656: every ENCODED spelling (the masker's table) in two pieces with a quiet — the settle keeps a form's first piece back
//   C1–C3 主开发 r2704: the card's set SHRINKS, SWAPS at the same count, and the JOB CARD's take-back (every row naming the job)
//   R1b/R2b r2887: the same quiet with a line / marker ending in the first character of the value's hex / base64 spelling — deterministic
//   S1  主开发 r2895: a scheduled task ending on a marker — its second run ends only on the marker it printed itself
//   F1  ONE CARD PER JOB (the owner's decided ①: «每个用 key 的后台工作一张卡，你批一次»): a job with two entries to approve
//   F3  THE WAIT's AUDIT LINE (design D9: «批准、拒绝、撤销、等待各记一条 vault-job 审计行»): a start that waits for the vault
//   F5  THE TEACHING promises no more than the design (docs/agent/vault-manual.md «Where it never is»: the job log IS in data/)
//   F4  EVERY REFUSAL NAMES THE VAULT (brief L3 item 6): the road's own refusal words
//   F2  THE ROTATION SENTENCE (design D8: the row says a running job keeps the old value until its next start)
//   F8  AN EDGE SAID (brief L3 item 5): a conversation that holds control of the job starts it — with the approved values
import './scratch.mjs';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const R = (p) => require(path.join(REPO, p));
const VE = R('src/server/vault-engine.js'), VJ = R('src/vault-job.js'), M = R('src/job-model.js');
const DOOR = R('src/server/vault-job-door.js'), GS = R('src/server/grants-store.js');
const VR = R('src/vault-run.js');
const { UserTodoManager } = R('src/user-todos.js');
const { JobManager } = R('src/jobs.js');
const WRAP_SRC = fs.readFileSync(path.join(REPO, 'data/bin/job-wrapper.js'), 'utf8');
const { ok, report } = checker();
const PW = ['pw', 'vault', 'verify', 'l3'].join('-');
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const SENT = (tag) => ['vjv', tag, require('crypto').randomBytes(8).toString('hex')].join('-');   // a stand-in value, joined at run time

// THE JOB PROGRAM: reads its value from the fd the hub handed (TOK_FD), keeps a copy OUTSIDE the data dir (the positive control),
// prints it once whole (the masker must replace it), then prints it in two pieces with a quiet longer than the wrapper's window
// between them — what a block-buffered stdout does when its block edge falls inside the value
const PROG = `const fs = require('fs'), path = require('path');
const out = process.argv[2], fd = Number(process.env.TOK_FD);
let v = ''; try { v = fs.readFileSync(fd, 'utf8'); } catch (e) { v = 'ERR:' + e.code; }
fs.writeFileSync(path.join(out, 'got.tmp'), JSON.stringify({ v })); fs.renameSync(path.join(out, 'got.tmp'), path.join(out, 'got.json'));
const half = Math.floor(v.length / 2), still = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
process.stdout.write('whole ' + v + '\\n');
still(600);
process.stdout.write('split ' + v.slice(0, half));
still(1500);
process.stdout.write(v.slice(half) + '\\n');
still(900);
process.exit(0);
`;

// THE EXIT-CUT SCENE (F11): the job's main writes the first half and ends 100 ms later (under the 400 ms quiet); a child it
// started (its own group's, as a task's worker is) writes the second half when the end's drain sends it SIGTERM — a gap shorter
// than the quiet, so only the masker's cut at the main's EXIT event can part the two halves
const PROG2 = `const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const out = process.argv[2], fd = Number(process.env.TOK_FD);
let v = ''; try { v = fs.readFileSync(fd, 'utf8'); } catch (e) { v = 'ERR:' + e.code; }
fs.writeFileSync(path.join(out, 'got2.tmp'), JSON.stringify({ v })); fs.renameSync(path.join(out, 'got2.tmp'), path.join(out, 'got2.json'));
const half = Math.floor(v.length / 2), still = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
spawn(process.execPath, [path.join(__dirname, 'gc.js'), out], { stdio: ['ignore', 'inherit', 'inherit'], env: { PATH: process.env.PATH || '', HALF2: v.slice(half) } });
for (let i = 0; i < 500 && !fs.existsSync(path.join(out, 'gc-ready')); i++) still(10);
process.stdout.write('exitcut ' + v.slice(0, half));
still(100);
process.exit(0);
`;
const GC = `const fs = require('fs'), path = require('path'), out = process.argv[2];
const say = (how) => { fs.writeSync(1, process.env.HALF2 + '\\n'); fs.writeFileSync(path.join(out, 'gc-wrote'), how); process.exit(0); };
process.on('SIGTERM', () => say('on-term'));
fs.writeFileSync(path.join(out, 'gc-ready'), '1');
setTimeout(() => say('late'), 4000);
`;
// THE PIPES SCENE (W1, 主开发 r2571 item 1 — the cut in SPACE): one case a job; 150 ms between the writes (under the 400 ms quiet,
// above a loaded loop's turn), so the two pipes' bytes arrive in the order written
const PROG3 = `const fs = require('fs'), path = require('path');
const out = process.argv[2], k = process.argv[3], fd = Number(process.env.TOK_FD);
let v = ''; try { v = fs.readFileSync(fd, 'utf8'); } catch (e) { v = 'ERR:' + e.code; }
fs.writeFileSync(path.join(out, 'got3-' + k + '.json'), JSON.stringify({ v }));
const h = Math.floor(v.length / 2), still = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const steps = { a: [[1, 'a1 ' + v.slice(0, h)], [2, v.slice(h) + ' a2\\n']], b: [[2, 'b1 ' + v.slice(0, h)], [1, v.slice(h) + ' b2\\n']],
  c: [[1, 'c1 ' + v.slice(0, h)], [2, '[the other pipe]\\n'], [1, v.slice(h) + ' c2\\n']], d: [[2, 'd1 ' + v.slice(0, h)], [1, '[the other pipe]\\n'], [2, v.slice(h) + ' d2\\n']] }[k];
for (const [p, s] of steps) { fs.writeSync(p, s); still(150); }
still(700);
process.exit(0);
`;
// THE RESTART SCENES (W2 a wrapper killed while the hub is down, W3 a crasher): each start appends what it read OUTSIDE the data
// dir (out/starts-<name>), prints the value once whole (masked), lives <ms>, ends with <code>
const PROG4 = `const fs = require('fs'), path = require('path');
const [out, name, ms, code] = process.argv.slice(2), fd = Number(process.env.TOK_FD);
let v = ''; try { v = fs.readFileSync(fd, 'utf8'); } catch (e) { v = 'ERR:' + e.code; }
fs.appendFileSync(path.join(out, 'starts-' + name), JSON.stringify({ v, at: Date.now() }) + '\\n');
process.stdout.write('whole ' + v + '\\n');
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(ms));
process.exit(Number(code));
`;
// THE QUIET SCENES (R1 / R2, 主开发 r2601 — a regression a cure can open): a job given values prints ONE short line and then waits
// quietly; it notes the moment it printed OUTSIDE the data dir (out/printed-<name>)
const PROG5 = `const fs = require('fs'), path = require('path');
const [out, name, line, ms] = process.argv.slice(2), fd = Number(process.env.TOK_FD);
let v = ''; try { v = fs.readFileSync(fd, 'utf8'); } catch (e) { v = 'ERR:' + e.code; }
process.stdout.write(line + '\\n');
fs.writeFileSync(path.join(out, 'printed-' + name), String(Date.now()));
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(ms));
process.exit(0);
`;
// THE ENCODED SCENE (E1, 主开发 r2656): the job spells its value in every SPELLED form the masker's table knows (src/vault-run.js
// formsOf — the design's forms: base64 std / url-safe with and without padding, percent upper / lower, JSON escapes, hex upper /
// lower, UTF-16, base32), each in two pieces with a quiet (900 ms) between them; it records only the forms' NAMES outside the data dir
const PROG6 = `const fs = require('fs'), path = require('path');
const out = process.argv[2], fd = Number(process.env.TOK_FD);
let v = ''; try { v = fs.readFileSync(fd, 'utf8'); } catch (e) { v = 'ERR:' + e.code; }
const forms = require(path.join(__dirname, 'src', 'vault-run.js')).formsOf(v).filter((f) => f.form !== 'raw');
fs.writeFileSync(path.join(out, 'forms-encoded.json'), JSON.stringify({ read: v.length, forms: forms.map((f) => f.form) }));
const still = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
forms.forEach((f, i) => { const h = Math.floor(f.text.length / 2); process.stdout.write('E' + i + ' ' + f.text.slice(0, h)); still(900); process.stdout.write(f.text.slice(h) + '\\n'); still(150); });
still(500);
process.exit(0);
`;
// THE MASKER IN PROCESS (R1 / R2's placing, 主开发 r2887): the same text through createRunMasker's push and its quiet's settle —
// whether the MASKER itself hands the line on (the wrapper's road aside)
const probeSettle = (value, text) => { try { const m = VR.createRunMasker([{ ref: { label: 'TOK' }, value }], ['out', 'err']); const a = m.push('out', text); const b = typeof m.settle === 'function' ? m.settle() : null; const got = (a.out || '') + ((b && b.out) || ''); return { settle: typeof m.settle === 'function', onPush: (a.out || '').length, onSettle: b ? (b.out || '').length : null, handedOn: got.includes(text.replace(/\n$/, '')) }; } catch (e) { return { threw: String((e && e.message) || e).slice(0, 200) }; } };
// THE SCHEDULED SCENE (S1, 主开发 r2895): a cron's task that ends on an until-marker. Its first run prints the marker with no line end
// (as `printf` does) and is ended by it; its second run prints another line first and its own marker 1.5 s later. Each print's moment
// is noted outside the data dir (out/sched-<n>-<what>)
const PROG7 = `const fs = require('fs'), path = require('path');
const [out, mark] = process.argv.slice(2), fd = Number(process.env.TOK_FD);
try { fs.readFileSync(fd, 'utf8'); } catch { }
const n = (fs.existsSync(path.join(out, 'sched-n')) ? fs.readFileSync(path.join(out, 'sched-n'), 'utf8').length : 0) + 1;
fs.appendFileSync(path.join(out, 'sched-n'), 'x');
const still = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const note = (what) => fs.writeFileSync(path.join(out, 'sched-' + n + '-' + what), String(Date.now()));
if (n === 1) { process.stdout.write(mark); note('mark'); still(4000); }
else { process.stdout.write('the second run says hello\\n'); note('hello'); still(1500); process.stdout.write(mark + '\\n'); note('mark'); still(4000); }
process.exit(0);
`;
const spellings = (s) => [s, Buffer.from(s).toString('base64').replace(/=+$/, ''), Buffer.from(s).toString('hex')];
const ROOTS = new Set(), PREFIX = `vs-vjverify-${process.pid}-`;
process.on('exit', () => { for (const r of ROOTS) { try { fs.rmSync(r, { recursive: true, force: true }); } catch { } } });
async function world(tag, { from = null } = {}) {   // `from`: the NEXT hub over the same data dir and vault (a restart)
  const root = from ? from.root : fs.mkdtempSync(path.join(os.tmpdir(), `${PREFIX}${tag}-`)); ROOTS.add(root);
  const dd = path.join(root, 'data');
  if (!from) {
  fs.symlinkSync(path.join(REPO, 'src'), path.join(root, 'src'));   // the wrapper finds its maskers beside it, as on a hub
  fs.mkdirSync(path.join(dd, 'bin'), { recursive: true }); fs.mkdirSync(path.join(root, 'out'));
  fs.writeFileSync(path.join(dd, 'bin', 'job-wrapper.js'), WRAP_SRC); fs.writeFileSync(path.join(root, 'prog.js'), PROG); fs.writeFileSync(path.join(root, 'prog2.js'), PROG2); fs.writeFileSync(path.join(root, 'gc.js'), GC);
  fs.writeFileSync(path.join(root, 'prog3.js'), PROG3); fs.writeFileSync(path.join(root, 'prog4.js'), PROG4); fs.writeFileSync(path.join(root, 'prog5.js'), PROG5); fs.writeFileSync(path.join(root, 'prog6.js'), PROG6); fs.writeFileSync(path.join(root, 'prog7.js'), PROG7);
  }
  const vault = from ? from.vault : VE.create({ dataDir: dd, kdf: { N: 1024, r: 8, p: 1 }, log: { log() { }, warn() { } }, idleTimer: false, register: false });
  if (!from) await vault.setup(PW);
  const grants = from ? from.grants : GS.create({ memory: true });
  const todos = new UserTodoManager({ dataDir: dd, expirySweepMs: 0 });
  const journal = [];
  const jm = new JobManager({ dataDir: dd, broadcast() { }, notifyUser() { return { ok: true }; }, log: (...a) => journal.push(a.join(' ')), memoryRungs: [],
    deliverToConversation: async () => ({ ok: true, lane: 'message', peerName: 'owner' }), notifyGlobal: () => true, peerReachable: () => true, groupNotifyFor: () => null });
  jm.init();
  const door = DOOR.create({ vault, grants: () => grants, userTodos: todos, nameOf: () => 'Chat A' });
  jm.setVaultJob(door);
  const owner = { conversation: { id: 'conv-a' }, sessionId: 'w-a', createdBy: 'agent', groupsSnapshot: [] };
  const create = (o) => jm.create({ kind: 'task', name: tag, cmd: { argv: [process.execPath, path.join(root, 'prog.js'), path.join(root, 'out')], cwd: root, env: {} }, owner, vault: ['TOK=vault://agent:conv-a/tok'], ...o }, { conversationId: 'conv-a', sessionId: 'w-a', sessionCreatedAt: 1, groups: new Set() });
  const untilMs = async (pred, ms) => { const t0 = Date.now(); for (;;) { try { await jm._sweep(); } catch { } if (pred()) return true; if (Date.now() - t0 >= ms) return false; await nap(25); } };
  const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else if (e.isFile()) out.push([p, fs.readFileSync(p, 'latin1')]); } return out; };
  const audit = () => { try { return fs.readFileSync(path.join(dd, 'vault-audit.jsonl'), 'utf8'); } catch { return ''; } };
  const cards = () => ((todos.snapshot() || {}).open || []).filter((i) => i.action && i.action.type === 'vault-job-ask');
  const end = () => { try { for (const t of jm._timers || []) clearInterval(t); jm.readOnly = true; jm.shutdown(); } catch { } try { todos.stop(); } catch { } };
  const uses = (id) => audit().split('\n').filter((l) => l.includes('"event":"vault-use"') && l.includes('"door":"service"') && l.includes(`Background job ${id}`)).map((l) => JSON.parse(l));
  const starts = (name) => { try { return fs.readFileSync(path.join(root, 'out', 'starts-' + name), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  const prog4 = (name, ms, code) => ({ argv: [process.execPath, path.join(root, 'prog4.js'), path.join(root, 'out'), name, String(ms), String(code)], cwd: root, env: {} });
  return { root, dd, vault, grants, todos, door, jm, journal, create, untilMs, walk, audit, cards, end, uses, starts, prog4 };
}

// ── F10 — THE JOB LOG HOLDS NO SPELLING OF THE VALUE, a value written in two pieces with a quiet between them ──────────────────
console.log('F10 the job log, a value written in two pieces with a quiet between them (design D5 + the run door §8.6 ③)');
{
  const W = await world('split'), S = SENT('split');
  W.vault.agentPut('agent:conv-a/tok', S);   // a value this conversation PUT itself: no approval needed (design D2) — the road runs at once
  const job = W.jm.jobs.get(W.create({ name: 'split' }).job.id);
  const ended = await W.untilMs(() => ['done', 'failed', 'interrupted'].includes(job.state), 20000);
  let got = null; try { got = JSON.parse(fs.readFileSync(path.join(W.root, 'out', 'got.json'), 'utf8')); } catch { }
  const files = W.walk(W.dd), holders = files.filter(([, t]) => t.includes(S)).map(([p]) => path.relative(W.dd, p));
  const log = files.filter(([p]) => /current\.log(\.1)?$/.test(p)).map(([, t]) => t).join('\n');
  const wholeLine = (log.split('\n').find((l) => l.startsWith('whole ')) || '');
  ok(ended && !!got && got.v === S, 'the scene: the job ran to its end and read the value from its fd (the POSITIVE CONTROL: its own copy, outside the data dir)', { state: job.state, read: !!got && got.v === S });
  ok(wholeLine !== '' && !wholeLine.includes(S), 'CONTROL: the value printed in ONE write is masked in the job log (the masker runs on this road)', { wholeLine: wholeLine.replace(S, '<THE VALUE>') });
  ok(holders.length === 0, 'F10 — THE LAW (design D5 «落盘之前按值擦»; §8.6 ③ «分块到两次写之间——我们留窗口»): no file of the data dir holds the value — RED: a value written in two pieces with a quiet over the wrapper\'s 400 ms window lands WHOLE in the job log', { files: holders, splitLine: (log.split('\n').find((l) => l.startsWith('split ')) || '').replace(S, '<THE VALUE, WHOLE>') });
  W.end();
}

// ── F11 — THE MASKER's CUT AT THE MAIN's EXIT: what the job's group still writes during the end's drain ─────────────────────
console.log('F11 the job log, a value whose second half comes from the job\'s own child after its main ended (gap < the 400 ms quiet)');
{
  const W = await world('exitcut'), S = SENT('exitcut');
  W.vault.agentPut('agent:conv-a/tok', S);
  const job = W.jm.jobs.get(W.create({ name: 'exitcut', cmd: { argv: [process.execPath, path.join(W.root, 'prog2.js'), path.join(W.root, 'out')], cwd: W.root, env: {} } }).job.id);
  const ended = await W.untilMs(() => ['done', 'failed', 'interrupted'].includes(job.state), 20000);
  let got = null, wrote = ''; try { got = JSON.parse(fs.readFileSync(path.join(W.root, 'out', 'got2.json'), 'utf8')); } catch { }
  try { wrote = fs.readFileSync(path.join(W.root, 'out', 'gc-wrote'), 'utf8'); } catch { }
  const files = W.walk(W.dd), holders = files.filter(([, t]) => t.includes(S)).map(([p]) => path.relative(W.dd, p));
  const log = files.filter(([p]) => /current\.log(\.1)?$/.test(p)).map(([, t]) => t).join('\n');
  ok(ended && !!got && got.v === S && wrote === 'on-term', 'the scene: the job read its value; its child wrote the second half when the end\'s drain sent it SIGTERM (not on its own late timer)', { state: job.state, read: !!got && got.v === S, wrote });
  ok(holders.length === 0, 'F11 — THE LAW (D5 «两条管道同一个窗口 … 然后才落盘»; the run door\'s «保留末尾 … 到下一块或 EOF 再判»: the window ends at the pipes\' EOF, never at the main\'s exit): no file of the data dir holds the value — RED: the wrapper flushes its held tail at the main\'s EXIT event (job-wrapper.js ended(): flushMask) and a FRESH masker takes what the job\'s group writes during the drain, so a value parted there lands WHOLE', { files: holders, line: (log.split('\n').find((l) => l.startsWith('exitcut ')) || '').replace(S, '<THE VALUE, WHOLE>') });
  W.end();
}

// ── F1 — ONE CARD PER JOB, approved once (the owner's decided ①) ─────────────────────────────────────────────────────────────
console.log('F1 one card per job, approved once (the owner\'s decided ①)');
{
  const W = await world('cards');
  W.vault.agentMint('agent:conv-a/t1', { length: 32 }); W.vault.agentMint('agent:conv-a/t2', { length: 32 });   // minted: the agent never saw them — each needs the person's approval
  const job = W.jm.jobs.get(W.create({ name: 'two-keys', vault: ['K1=vault://agent:conv-a/t1', 'K2=vault://agent:conv-a/t2'] }).job.id);
  await W.door.factsLanded();
  const mine = W.cards().filter((i) => i.action.jobId === job.id);
  ok(job.state === 'waiting' && job.waitFor === 'approval', 'the scene: a job with two minted entries waits for the person\'s approval', { state: job.state, waitFor: job.waitFor });
  ok(mine.length === 1, 'F1 — THE LAW (decided ①: «每个用 key 的后台工作一张卡，你批一次»): ONE card for the job, approved once — RED: one card per job × entry, so the person approves twice (each with 验证是你)', { cards: mine.length });
  W.end();
}

// ── F3 — A WAIT FOR THE VAULT WRITES ITS vault-job AUDIT LINE (design D9) ───────────────────────────────────────────────────
console.log('F3 the wait\'s audit line (design D9)');
{
  const W = await world('wait'), S = SENT('wait');
  W.vault.agentPut('agent:conv-a/tok', S); W.vault.lock('door');
  const before = W.audit();
  const job = W.jm.jobs.get(W.create({ name: 'locked', kind: 'service', restart: 'never' }).job.id);
  const added = W.audit().slice(before.length).split('\n').filter(Boolean);
  const jobLines = added.filter((l) => l.includes('"vault-job"') && l.includes(job.id));
  ok(job.state === 'waiting' && job.waitFor === 'vault', 'the scene: a start while the vault is locked waits for the vault', { state: job.state, waitFor: job.waitFor });
  ok(jobLines.length >= 1, 'F3 — THE LAW (D9 «批准、拒绝、撤销、等待各记一条 vault-job 审计行»): the wait writes a vault-job audit line naming the job — RED: none (the door audits ask / allow / deny / over / revoke / drop / gone only)', { added: added.map((l) => l.slice(0, 160)) });
  W.end();
}

// ── F5 — THE TEACHING PROMISES NO MORE THAN THE DESIGN ───────────────────────────────────────────────────────────────────────
console.log('F5 the agent manual promises no more than the design');
{
  const manual = fs.readFileSync(path.join(REPO, 'docs/agent/vault-manual.md'), 'utf8');
  const never = manual.split('\n').find((l) => /\*\*Where it never is:\*\*/.test(l)) || '';
  ok(never !== '', 'the scene: the manual\'s «Where it never is» sentence is found', never.slice(0, 120));
  ok(!/\bdata\//.test(never), 'F5 — THE LAW (design D5: the job log is masked by a SIEVE — «擦除器是筛子»): the manual never says a value is never in data/ — RED: «Where it never is: … data/ …», while the job log lives in data/job-logs (and F10 lands a value there whole)', never.slice(0, 260));
}

// ── F4 — EVERY REFUSAL OF THE ROAD NAMES THE VAULT (brief L3 item 6) ─────────────────────────────────────────────────────────
console.log('F4 every refusal names the vault');
{
  const silent = ['too_many_asks', 'too_many_asks_hub', 'ask_unfiled'].filter((c) => !/vault/i.test(VJ.WORDS[c] || ''));
  ok(silent.length === 0, 'F4 — THE LAW (brief L3 6: «every refusal and waiting sentence names the vault»): each refusal of the road names the vault — RED: these never do', silent.map((c) => `${c}: ${String(VJ.WORDS[c]).slice(0, 120)}`));
}

// ── F2 — THE ROTATION SENTENCE ON THE ROW (design D8: the debt said where the person looks) ─────────────────────────────────
console.log('F2 the row says a running job keeps the old value until its next start (design D8)');
{
  const row = fs.readFileSync(path.join(REPO, 'src/lib/vault-job-row.js'), 'utf8');
  ok(/vw-job-chip/.test(row), 'the scene: the Vault window\'s row of an approved job is drawn by src/lib/vault-job-row.js');
  const said = /(?:new|renewed|rotated|changed) value[^'`]*next start|next start[^'`]*(?:new|renewed|rotated|changed) value|old value[^'`]*next start|next start[^'`]*old value/i;   // «its next start asks you again» (a take-back) is not this sentence
  ok(said.test("t('A running job keeps the old value until its next start')") && !said.test("t('Taken back — its next start asks you again')"), 'CONTROL — the check sees the rotation sentence, and not the take-back\'s «its next start asks you again»');
  ok(said.test(row), 'F2 — THE LAW (D8 «行上写一句「在跑的 service 下次启动才用新值」»): the row says a running job uses a renewed value only at its next start — RED: no such sentence');
}

// ── F8 — AN EDGE SAID: ANOTHER CONVERSATION THAT HOLDS CONTROL STARTS IT WITH THE VALUES (brief L3 5) ────────────────────────
console.log('F8 the teaching says who else starts a job that holds values (brief L3 5: a groupmate\'s start)');
{
  const manual = fs.readFileSync(path.join(REPO, 'docs/agent/vault-manual.md'), 'utf8');
  const at = manual.indexOf('## A Background Work job that needs a secret'), part = at < 0 ? '' : manual.slice(at, manual.indexOf('\n## ', at + 4));
  const routes = fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf8');
  ok(part !== '' && /needsControl = \[[^\]]*'start'/.test(routes), 'the scene: the manual\'s jobs-with-a-secret part is found, and a conversation granted control may `start` a job (src/agent-routes.js needsControl)');
  ok(/control/i.test(part), 'F8 — THE LAW (brief L3 5 «EDGES, said»): the part says a conversation that holds control of the job can start it, and its start hands the approved values to the program — RED: it never says so');
}

// ── F12 — THE CARD SAYS WHAT STAYS OPEN: the program's own files (design §4 T6 «开——owner 接受，卡上写») ─────────────────────
console.log('F12 the approval card says the program\'s own files, config and caches are not protected (design T6)');
{
  const src = fs.readFileSync(path.join(REPO, 'src/foryou-actions.js'), 'utf8');
  const at = src.indexOf('function jobCardOf('), card = at < 0 ? '' : src.slice(at, src.indexOf('\nfunction ', at + 10));
  const said = /(?:writes|keeps|stores|saves)[^'"`]*(?:files?|config|database|cache)|(?:files?|config|database|cache)[^'"`]*(?:it writes|it keeps|it stores|it saves)/i;
  ok(card !== '' && /An agent can change this program/.test(card) && /cannot read where a program connects/.test(card), 'the scene: the job\'s approval card (src/foryou-actions.js jobCardOf) is found, and it already says T7 (an agent can change the program) and T8 (where it sends: unknown)');
  ok(said.test("t('What the program writes to its own files, config or caches is not protected')") && !said.test("t('its program reads it once from the descriptor names — never from its environment, its command line or a file')"), 'CONTROL — the check sees the T6 sentence, and not the card\'s «… never from … a file»');
  ok(said.test(card), 'F12 — THE LAW (T6 «agent 读 service 自己写的文件、配置、数据库、缓存 — 开——owner 接受，卡上写»): the card says the program\'s own files are open — RED: no such sentence on the card');
}

// ── W1 — THE CUT IN SPACE: a value across the two pipes (主开发 r2571 item 1) ────────────────────────────────────────────────
// WHAT THE DESIGN PROMISES: D5 «createRunMasker（同一个 FORMS 表、两条管道同一个窗口）»; createRunMasker's own law (src/vault-run.js):
// «a value split between stdout and stderr is seen whole AND a value inside one stream is never lost to the other's chunks between
// its characters». (The wrapper's header comment lists «between stdout and stderr» among the residuals that pass — the leg decides.)
// A value's halves arriving in REVERSE order are two partial values — the design's residual («只出现一部分的值»), not walked.
console.log('W1 a value across the two pipes: split between them, and whole on one with the other\'s bytes between its pieces');
{
  const W = await world('pipes'), S = SENT('pipes'), h = Math.floor(S.length / 2), A = S.slice(0, h), B = S.slice(h);
  W.vault.agentPut('agent:conv-a/tok', S);
  const CASES = [['a', 'its first half on stdout, the rest on stderr'], ['b', 'its first half on stderr, the rest on stdout'], ['c', 'whole on stdout, stderr bytes arriving between its pieces'], ['d', 'whole on stderr, stdout bytes arriving between its pieces']];
  for (const [k, what] of CASES) {
    const job = W.jm.jobs.get(W.create({ name: 'pipes-' + k, cmd: { argv: [process.execPath, path.join(W.root, 'prog3.js'), path.join(W.root, 'out'), k], cwd: W.root, env: {} } }).job.id);
    const ended = await W.untilMs(() => ['done', 'failed', 'interrupted'].includes(job.state), 20000);
    let got = null; try { got = JSON.parse(fs.readFileSync(path.join(W.root, 'out', `got3-${k}.json`), 'utf8')); } catch { }
    const logs = W.walk(path.join(W.dd, 'job-logs', job.id)).map(([, t]) => t).join('\n');
    const pieces = [A, B].filter((x) => logs.includes(x)).length;
    ok(ended && !!got && got.v === S && logs.includes(`${k}1 `) && logs.includes(` ${k}2`), `W1${k} — the scene: the job read its value and wrote ${what} (both markers in its log)`, { state: job.state, read: !!got && got.v === S, lines: logs.split('\n').filter((l) => l && !l.startsWith('{')).map((l) => l.split(A).join('<FIRST HALF>').split(B).join('<SECOND HALF>')).slice(-8) });
    const OWN = { a: { out: ['a1 '], err: [' a2\n'] }, b: { err: ['b1 '], out: [' b2\n'] }, c: { out: ['c1 ', ' c2\n'], err: ['[the other pipe]\n'] }, d: { err: ['d1 ', ' d2\n'], out: ['[the other pipe]\n'] } }[k];
    const bare = logs.replace(/\[vault:[^\]]*\]/g, ''), lost = [];
    for (const [pipe, chunks] of Object.entries(OWN)) { let at = 0; for (const c of chunks) { const i = bare.indexOf(c, at); if (i < 0) lost.push(`${pipe}: ${JSON.stringify(c)}`); else at = i + c.length; } }
    ok(lost.length === 0, `W1${k} — THE LAW (the log shows what the job printed; the masker replaces only the value's spellings): every byte of the job's own words is in its log, in each pipe's order — RED: words lost`, { lost, lines: logs.split('\n').filter((l) => l && !l.startsWith('{')).map((l) => l.split(A).join('<FIRST HALF>').split(B).join('<SECOND HALF>')).slice(-8) });
    ok(pieces === 0, `W1${k} — THE LAW (D5 «两条管道同一个窗口»; createRunMasker «seen whole … never lost to the other\'s chunks»): ${what} — no piece of the value in the job log`, { piecesInLog: pieces, lines: logs.split('\n').filter((l) => l.includes(A) || l.includes(B)).map((l) => l.replace(A, '<FIRST HALF>').replace(B, '<SECOND HALF>')).slice(0, 4) });
  }
  W.end();
}

// ── W2 — A WRAPPER KILLED WHILE THE HUB WAS DOWN (主开发 r2571 item 2) ─────────────────────────────────────────────────────────
// What holds the values then: the wrapper's memory (gone with it) and the program's own. The NEXT hub (its vault locked, as every
// restart leaves it) must start nothing without values (D6 / T10 «绝不缺值启动»), count no failure, and leave no spelling of the
// value where a conversation reads (the log's tail, the run's control files, the store); the unlock starts it ONCE, said in the audit
console.log('W2 a wrapper killed (SIGKILL) while the hub was down, then the next hub with its vault locked');
{
  const A = await world('killed'), S = SENT('killed');
  A.vault.agentPut('agent:conv-a/tok', S);
  const id = A.create({ name: 'killed', kind: 'service', restart: 'never', cmd: A.prog4('killed', 2500, 0) }).job.id, job = A.jm.jobs.get(id);
  const up = await A.untilMs(() => job.state === 'up' && A.starts('killed').length === 1, 15000);
  const run = job.runs[job.runs.length - 1] || {}, ctl = A.jm._ctlDir(job, run.startedAt);
  let wpid = null; try { wpid = JSON.parse(fs.readFileSync(path.join(ctl, 'pid.json'), 'utf8')).pid; } catch { }
  { const r = require(path.join(REPO, 'src/store-writer.js')).storeWriter().flushSync([A.jm.file, A.jm.notifsFile]); if (r.deferred || (r.left && r.left.length)) console.log('  (the store did not land before the crash point)', r.left); }
  A.end(); A.vault.lock('door');   // the hub is down — its store as the disk holds it; a restart's vault is locked
  let killed = false; if (Number.isInteger(wpid) && wpid > 1) { try { process.kill(wpid, 'SIGKILL'); killed = true; } catch { } }   // the wrapper THIS suite's engine started
  let gone = false; for (let i = 0; i < 80 && killed && !gone; i++) { try { process.kill(wpid, 0); await nap(25); } catch { gone = true; } }
  const B = await world('killed2', { from: A }), job2 = B.jm.jobs.get(id);
  const waited = !!job2 && await B.untilMs(() => job2.state === 'waiting' && job2.waitFor === 'vault', 8000);
  const files = B.walk(A.dd), holders = files.filter(([, t]) => spellings(S).some((s) => t.includes(s))).map(([p]) => path.relative(A.dd, p));
  ok(up && killed && gone, 'W2 — the scene: the service ran with its value; the hub went down; its wrapper was killed by SIGKILL (no exit record, no handler)', { up, wpid: !!wpid, killed, gone });
  ok(waited && job2.supervise.consecutiveFails === 0 && A.starts('killed').length === 1, 'W2 — THE LAW (D6 / T10 «等：绝不缺值启动»): the next hub, its vault locked, starts nothing — the job waits for the vault, no failure counted', job2 && { state: job2.state, waitFor: job2.waitFor, fails: job2.supervise && job2.supervise.consecutiveFails, starts: A.starts('killed').length });
  ok(holders.length === 0, 'W2 — THE LAW (§2: never in a file, a log line unmasked): after the kill and the next boot no file of the data dir holds any spelling of the value (the log\'s tail, the run\'s control files, the store)', { files: holders, runFiles: files.map(([p]) => path.relative(A.dd, p)).filter((p) => p.startsWith(path.join('job-logs', id))) });
  await B.vault.unlock(PW);
  const again = !!job2 && await B.untilMs(() => A.starts('killed').length >= 2 && B.uses(id).length >= 2, 20000);
  const st = A.starts('killed');
  ok(again && st.length === 2 && st.every((g) => g.v === S) && B.uses(id).length === 2, 'W2 — THE LAW (D6 «解锁后自启» + D9 one vault-use line per start): the unlock starts it ONCE, with its value; one use line per start (2 in all)', { starts: st.length, uses: B.uses(id).length, runs: job2 && job2.runs.length });
  if (job2) { B.jm.stop(job2); await B.untilMs(() => !['up', 'starting', 'stopping'].includes(job2.state), 15000); }
  B.end();
}

// ── W3 — A CRASHER STARTED AGAIN AND AGAIN (主开发 r2571 item 3; brief L3 4: the 61-s crasher) ────────────────────────────────────
// The stand-in clock (the rule, not its clock, as test-vault-job ③ does): minUptimeMs 200 ms stands for 60 s, each run lives 300 ms
// — past it, so no start is a fast crash. A MINTED value, approved ONCE (D1: «你批一次», never expires): each new start takes it
// again with no new card (every spawn re-reads the grant row), and each start is said in the audit (D9: one vault-use line a spawn)
console.log('W3 a crasher that dies past its minimum uptime and is started again (stand-in clock: 200 ms for 60 s)');
{
  const keep = { ...M.SUPERVISE };
  M.SUPERVISE.minUptimeMs = 200; M.SUPERVISE.backoffBaseMs = 10; M.SUPERVISE.backoffMaxMs = 40;
  try {
    const W = await world('crasher');
    W.vault.agentMint('agent:conv-a/tok', { length: 32 });
    const minted = W.vault.secretGet('agent:conv-a/tok').value.toString();
    const id = W.create({ name: 'crasher', kind: 'service', cmd: W.prog4('crasher', 300, 1) }).job.id, job = W.jm.jobs.get(id);
    await W.door.factsLanded();
    const c = W.cards().filter((i) => i.action.jobId === id);
    // the press carries the revision of the card it drew (the card's `rev`, as the page sends it — a tree before the revision has none: undefined, ignored there)
    const yes = c.length === 1 ? W.door.answer(c[0].action.askId, { answer: 'allow', reauthed: true, by: 'user', person: true, rev: c[0].action.rev }) : null;
    const four = await W.untilMs(() => W.starts('crasher').length >= 4, 25000);
    const cardsAfter = W.cards().filter((i) => i.action.jobId === id).length, sup = { ...(job.supervise || {}) };
    W.jm.stop(job); await W.untilMs(() => !['up', 'starting', 'stopping'].includes(job.state), 15000); await nap(300);
    const st = W.starts('crasher'), u = W.uses(id), okLines = u.filter((x) => x.outcome === 'ok').length;
    ok(c.length === 1 && !!yes && yes.ok === true, 'W3 — the scene: a MINTED value, ONE card, allowed ONCE with 验证是你', { cards: c.length, yes });
    ok(four && st.every((g) => g.v === minted) && cardsAfter === 0 && !sup.parkedAt && (sup.consecutiveFails || 0) === 0, 'W3 — THE LAW (D1 approved once, never expires; supervision: a run past its minimum uptime is no fast crash): every new start takes the value again with NO new card, never parked', { starts: st.length, allRead: st.every((g) => g.v === minted), cardsAfter, sup });
    ok(u.length === job.runs.length && okLines === st.length && !spellings(minted).some((s) => W.audit().includes(s)), 'W3 — THE LAW (D9: one vault-use line per spawn): as many use lines as runs, an `ok` line for each start that read its value, no spelling of the value in the audit', { runs: job.runs.length, useLines: u.length, okLines, starts: st.length });
    W.end();
  } finally { Object.assign(M.SUPERVISE, keep); }
}

// ── E1 — AN ENCODED SPELLING IN TWO PIECES WITH A QUIET (主开发 r2656: a quiet's settle must keep a form's first piece back too) ───
// The design's forms (D5 FORMS; the run door §8: base64 std / url-safe ± padding, percent upper / lower, JSON escapes, hex upper /
// lower — and the table's UTF-16 and base32): each is a spelling of the value, masked by value like the raw one. A stand-in with
// characters percent and JSON escape (/ space + " & =) so every form differs from the raw spelling.
console.log('E1 every encoded spelling of a value, each written in two pieces with a quiet between them');
{
  const W = await world('encoded'), S = SENT('enc').replace(/^vjv-/, 'vjv/') + ' +"q"&=';
  W.vault.agentPut('agent:conv-a/tok', S);
  const id = W.create({ name: 'encoded', cmd: { argv: [process.execPath, path.join(W.root, 'prog6.js'), path.join(W.root, 'out')], cwd: W.root, env: {} } }).job.id, job = W.jm.jobs.get(id);
  const ended = await W.untilMs(() => ['done', 'failed', 'interrupted'].includes(job.state), 40000);
  let rec = null; try { rec = JSON.parse(fs.readFileSync(path.join(W.root, 'out', 'forms-encoded.json'), 'utf8')); } catch { }
  const forms = VR.formsOf(S).filter((f) => f.form !== 'raw');
  const logs = W.walk(path.join(W.dd, 'job-logs', id)).map(([, t]) => t).join('\n');
  const leaked = forms.filter((f) => logs.includes(f.text)).map((f) => f.form);
  const kinds = [...new Set(forms.map((f) => f.form))];
  ok(ended && !!rec && rec.read === S.length && rec.forms.length === forms.length && forms.every((_, i) => logs.includes(`E${i} `)), `E1 — the scene: the job read its value and wrote all ${forms.length} encoded spellings (${kinds.join(', ')}), each in two pieces with a quiet between`, { state: job.state, rec });
  ok(leaked.length === 0, 'E1 — THE LAW (D5: every spelling of the value is masked before disk, the raw one\'s window for each): no encoded spelling lands whole in the job log — RED: these forms\' first piece was released at the quiet', { leaked });
  W.end();
}

// ── C1–C3 — THE CARD's SET MOVES, AND THE JOB CARD's TAKE-BACK (主开发 r2704, from the design) ─────────────────────────────────
// D1: ONE card a job, approved once — its facts name the entries (their Vault names) the person approves, and an approval is a
// grant row per entry naming the job; D2: a value the conversation PUT itself needs no card; D8: a take-back (the Vault row's ✕ or
// the JOB CARD's ✕) stops the job and its next start asks again. An entry's need moves when its provenance moves — an agent's re-PUT over the name makes it
// the conversation's own, a re-MINT the hub's (each rotates the value, never a delete: a delete is D8's stop road): the set SHRINKS or SWAPS.
const E = (n) => `secrets:agent:conv-a/${n}#secret`;
const cardSet = (W, id) => { const cs = W.cards().filter((i) => i.action.jobId === id); const ids = new Set(); for (const c of cs) { const a = c.action || {}; for (const [k, v] of Object.entries(a)) if (/^e\d$/.test(k) && v) ids.add(v); if (a.entry) ids.add(a.entry); } return { cards: cs.length, entries: [...ids].sort(), rev: cs.length === 1 ? cs[0].action.rev : null, askId: cs.length === 1 ? cs[0].action.askId : null }; };
const sameSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const approves = (W, entry, id) => (W.grants.rowsFor('vault-job', entry) || []).some((r) => (r.to || []).some((m) => (m.jobs || []).includes(id)));
const judge = async (W) => { W.jm.vaultChanged('vault-changed'); await W.door.factsLanded(); };
const allow = (W, s) => (s.askId ? W.door.answer(s.askId, { answer: 'allow', reauthed: true, by: 'user', person: true, rev: s.rev }) : null);
console.log('C1 a card whose set SHRINKS (one of its two entries becomes the conversation\'s own PUT)');
{
  const W = await world('shrink');
  W.vault.agentMint('agent:conv-a/tok', { length: 32 }); W.vault.agentMint('agent:conv-a/t2', { length: 32 });
  const id = W.create({ name: 'shrink', vault: ['TOK=vault://agent:conv-a/tok', 'T2=vault://agent:conv-a/t2'] }).job.id, job = W.jm.jobs.get(id);
  await W.door.factsLanded();
  const s1 = cardSet(W, id);
  W.vault.agentPut('agent:conv-a/t2', SENT('own'));   // B: now this conversation's own PUT (D2: no approval)
  await judge(W);
  const s2 = cardSet(W, id);
  ok(s1.cards === 1 && sameSet(s1.entries, [E('tok'), E('t2')]), 'C1 — the scene: a job with two minted entries waits on ONE card naming both', s1);
  ok(s2.cards === 1 && sameSet(s2.entries, [E('tok')]), 'C1 — THE LAW (D1 the card names what the person approves; D2 an own PUT needs none): after the shrink the job\'s ONE card names the first entry alone', s2);
  const yes = allow(W, s2);
  await W.untilMs(() => job.runs.length >= 1, 10000);
  ok(!!yes && yes.ok === true && approves(W, E('tok'), id) && !approves(W, E('t2'), id) && job.runs.length >= 1, 'C1 — THE LAW (D1: an approval is a row per entry the card named): its Allow approves the first entry alone (the own one gets no row) and the job starts', { yes, rowTok: approves(W, E('tok'), id), rowT2: approves(W, E('t2'), id), runs: job.runs.length });
  if (['up', 'starting'].includes(job.state)) { W.jm.stop(job); await W.untilMs(() => !['up', 'starting', 'stopping'].includes(job.state), 15000); }
  W.end();
}
console.log('C2 a card whose set SWAPS an entry at the same count (B becomes own, C becomes minted)');
{
  const W = await world('swapset');
  W.vault.agentMint('agent:conv-a/tok', { length: 32 }); W.vault.agentMint('agent:conv-a/t2', { length: 32 }); W.vault.agentPut('agent:conv-a/t3', SENT('t3'));
  const id = W.create({ name: 'swapset', vault: ['TOK=vault://agent:conv-a/tok', 'T2=vault://agent:conv-a/t2', 'T3=vault://agent:conv-a/t3'] }).job.id, job = W.jm.jobs.get(id);
  await W.door.factsLanded();
  const s1 = cardSet(W, id);
  W.vault.agentMint('agent:conv-a/t3', { length: 32 });   // C: now hub-minted (needs approval)
  W.vault.agentPut('agent:conv-a/t2', SENT('t2own'));   // B: now the conversation's own (needs none)
  await judge(W);
  const s2 = cardSet(W, id);
  ok(s1.cards === 1 && sameSet(s1.entries, [E('tok'), E('t2')]), 'C2 — the scene: ONE card naming the two minted entries (the third is the conversation\'s own)', s1);
  ok(s2.cards === 1 && sameSet(s2.entries, [E('tok'), E('t3')]), 'C2 — THE LAW (D1): after the swap the ONE card names the entries the job now waits for — the third in, the second out, the same count', s2);
  const stale = s1.askId ? W.door.answer(s1.askId, { answer: 'allow', reauthed: true, by: 'user', person: true, rev: s1.rev }) : null;
  const staleWrote = approves(W, E('tok'), id) || approves(W, E('t2'), id) || approves(W, E('t3'), id);
  ok(!!stale && stale.ok === false && !staleWrote, 'C2 — THE LAW (D1: the person approves the entries the card SHOWED): a press carrying the card as it was before the swap writes nothing', { stale, staleWrote });
  const yes = allow(W, cardSet(W, id));
  await W.untilMs(() => job.runs.length >= 1, 10000);
  ok(!!yes && yes.ok === true && approves(W, E('tok'), id) && approves(W, E('t3'), id) && !approves(W, E('t2'), id) && job.runs.length >= 1, 'C2 — THE LAW: the press on the card as drawn now approves the first and the third entries (the second, own now, no row) and the job starts', { yes, tok: approves(W, E('tok'), id), t2: approves(W, E('t2'), id), t3: approves(W, E('t3'), id), runs: job.runs.length });
  if (['up', 'starting'].includes(job.state)) { W.jm.stop(job); await W.untilMs(() => !['up', 'starting', 'stopping'].includes(job.state), 15000); }
  W.end();
}
console.log('C3 the JOB CARD\'s take-back: every approval naming the job, an entry it has since dropped too (D8)');
{
  const W = await world('takeback');
  W.vault.agentMint('agent:conv-a/tok', { length: 32 }); W.vault.agentMint('agent:conv-a/t2', { length: 32 });
  const id = W.create({ name: 'takeback', kind: 'service', restart: 'never', cmd: W.prog4('takeback', 8000, 0), vault: ['TOK=vault://agent:conv-a/tok', 'T2=vault://agent:conv-a/t2'] }).job.id, job = W.jm.jobs.get(id);
  await W.door.factsLanded();
  const yes = allow(W, cardSet(W, id));
  const up = await W.untilMs(() => job.state === 'up' && W.starts('takeback').length === 1, 15000);
  W.vault.agentPut('agent:conv-a/t2', SENT('dropped'));   // the job no longer needs B's approval — its row still names the job
  await judge(W);
  const rowsBefore = { tok: approves(W, E('tok'), id), t2: approves(W, E('t2'), id) };
  ok(!!yes && yes.ok === true && up && rowsBefore.tok && rowsBefore.t2, 'C3 — the scene: both entries approved once, the service runs; the second entry is now the conversation\'s own, its row still naming the job', { yes, up, rowsBefore });
  const has = typeof W.door.revokeAll === 'function';
  const back = has ? W.door.revokeAll(id, { by: 'user' }) : null;
  await W.untilMs(() => !['up', 'starting', 'stopping'].includes(job.state), 15000);
  const rowsAfter = { tok: approves(W, E('tok'), id), t2: approves(W, E('t2'), id) };
  ok(has && !!back && back.ok !== false && !rowsAfter.tok && !rowsAfter.t2 && job.desiredUp === false && !['up', 'starting'].includes(job.state), 'C3 — THE LAW (D8 «撤销（job 卡 ✕）→ 停»): the job card\'s take-back takes the job out of EVERY row that names it — the dropped entry\'s too — and stops it', { door: has ? 'revokeAll' : 'the door has no job-card take-back', back, rowsAfter, desiredUp: job.desiredUp, state: job.state });
  const st = W.jm.start(job);
  await W.door.factsLanded();
  const s3 = cardSet(W, id);
  ok(job.state === 'waiting' && job.waitFor === 'approval' && s3.cards === 1 && sameSet(s3.entries, [E('tok')]) && W.starts('takeback').length === 1, 'C3 — THE LAW (D8: «start asks again»): its next start waits on ONE new card naming the entry it still needs, and runs nothing', { st: st && st.state, state: job.state, waitFor: job.waitFor, s3, starts: W.starts('takeback').length });
  if (['up', 'starting', 'waiting'].includes(job.state)) { W.jm.stop(job); await W.untilMs(() => !['up', 'starting', 'stopping', 'waiting'].includes(job.state), 15000); }
  W.end();
}

// ── R1 / R2 — A QUIET RELEASES THE LOG's LATEST WORDS (主开发 r2601: a cure that keeps ONE masker for a pipe's life must not hold a
// short last line until more output or the end) ─────────────────────────────────────────────────────────────────────────────
// The release's behaviour and the jobs design: a job's log shows what it printed (a card's last line, `logs`), and an until-marker
// completes its task (docs/agent/background-work-manual: `--until`). A value-masked log may hold back only a trailing run that could
// still BEGIN a value (D5's window) — never a whole short line that cannot. F10's walk (above) stays beside these: the quiet's
// release must not hand on a value's first half.
console.log('R1 a service given values prints one short line and idles: the line is in its log soon after the quiet');
{
  const W = await world('quiet'), S = SENT('quiet');
  W.vault.agentPut('agent:conv-a/tok', S);
  const line = 'idle-line-' + require('crypto').randomBytes(2).toString('hex');
  const id = W.create({ name: 'quiet', kind: 'service', restart: 'never', cmd: { argv: [process.execPath, path.join(W.root, 'prog5.js'), path.join(W.root, 'out'), 'quiet', line, '9000'], cwd: W.root, env: {} } }).job.id, job = W.jm.jobs.get(id);
  const printed = await W.untilMs(() => fs.existsSync(path.join(W.root, 'out', 'printed-quiet')), 15000);
  const at = printed ? Number(fs.readFileSync(path.join(W.root, 'out', 'printed-quiet'), 'utf8')) : 0;
  const logOf = () => W.walk(path.join(W.dd, 'job-logs', id)).filter(([p]) => /current\.log(\.1)?$/.test(p)).map(([, t]) => t).join('\n');
  const seen = printed && await W.untilMs(() => logOf().includes(line), 2000);
  const ms = seen ? Date.now() - at : null, stillUp = job.state === 'up';
  // PLACING a red (r2887): watch on while the service still idles — LATE (the leg's bound under load) or NEVER (the product); and the masker in process
  const late = !seen && printed && await W.untilMs(() => logOf().includes(line), 5000);
  const lateMs = late ? Date.now() - at : null, probe = seen ? null : probeSettle(S, line + '\n');
  ok(printed && stillUp, 'R1 — the scene: the service read its value, printed its one line and still runs (its quiet is not its end)', { printed, state: job.state });
  ok(seen, 'R1 — THE LAW (the log shows what the job printed; D5 holds back only a run that could still begin a value): the short last line is in the job\'s log within 2 s of its print, while the service idles — RED: it stays out of the log until more output or the end', { seenAfterMs: ms, lateAfterMs: lateMs, stillUpAtJudge: stillUp, logTail: logOf().split(S).join('<THE VALUE>').slice(-200), maskerInProcess: probe });
  W.jm.stop(job); await W.untilMs(() => !['up', 'starting', 'stopping'].includes(job.state), 15000);
  W.end();
}
console.log('R2 a task given values prints its until-marker and waits quietly: the marker completes the task');
{
  const keepGrace = process.env.VIBESPACE_JOBS_GRACE_MS; process.env.VIBESPACE_JOBS_GRACE_MS = '200';   // the engine's own knob: the grace after a hit
  try {
    const W = await world('until'), S = SENT('until');
    W.vault.agentPut('agent:conv-a/tok', S);
    const mark = 'until-mark-' + require('crypto').randomBytes(2).toString('hex');
    const id = W.create({ name: 'until', untilOutput: mark, cmd: { argv: [process.execPath, path.join(W.root, 'prog5.js'), path.join(W.root, 'out'), 'until', mark, '6000'], cwd: W.root, env: {} } }).job.id, job = W.jm.jobs.get(id);
    const printed = await W.untilMs(() => fs.existsSync(path.join(W.root, 'out', 'printed-until')), 15000);
    const at = printed ? Number(fs.readFileSync(path.join(W.root, 'out', 'printed-until'), 'utf8')) : 0;
    const hit = printed && await W.untilMs(() => job._untilHit === true, 2500);
    const hitMs = hit ? Date.now() - at : null;
    const ended = printed && await W.untilMs(() => ['done', 'failed', 'interrupted'].includes(job.state), 9000);
    const endMs = ended ? Date.now() - at : null;
    ok(printed, 'R2 — the scene: the task read its value and printed its until-marker, then waits quietly (its own end comes 6 s later)', { printed });
    ok(hit && ended && endMs < 4500, 'R2 — THE LAW (an until-marker completes its task): the marker is seen within 2.5 s of its print and the task ends by it, long before its own end — RED: the marker stays out of the log, the until scan never fires, the task runs on', { hitAfterMs: hitMs, endedAfterMs: endMs, state: job.state, untilHit: !!job._untilHit, logTail: W.walk(path.join(W.dd, 'job-logs', id)).filter(([p]) => /current\.log$/.test(p)).map(([, t]) => t).join('').split(S).join('<THE VALUE>').slice(-200), maskerInProcess: hit ? null : probeSettle(S, mark + '\n') });
    if (!['done', 'failed', 'interrupted'].includes(job.state)) { W.jm.stop(job); await W.untilMs(() => !['up', 'starting', 'stopping'].includes(job.state), 15000); }
    W.end();
  } finally { if (keepGrace === undefined) delete process.env.VIBESPACE_JOBS_GRACE_MS; else process.env.VIBESPACE_JOBS_GRACE_MS = keepGrace; }
}
// ── R1b / R2b — THE SAME QUIET, a line whose LAST character begins a spelling of the value (主开发 r2887: placing the early read's
// UTC-only reds). Every stand-in value starts «vjv-»: its hex spelling begins «7», its base64 spelling «d». A settle that reads a
// completed line through the wrap view (a line end decoded as nothing) sees that last character as a value's first piece and holds
// it back: the line never whole in the log, an until-marker cut in two. R1 / R2's random endings meet it about one run in eight;
// these meet it every time. Expected RED at the early read's e21601d97, green at ae7e390f6.
console.log('R1b a short last line ending in the value hex spelling\'s first character, before a quiet');
{
  const W = await world('quietb'), S = SENT('quietb');
  W.vault.agentPut('agent:conv-a/tok', S);
  const hex0 = Buffer.from(S).toString('hex')[0], line = 'idle-line-' + require('crypto').randomBytes(2).toString('hex').replace(/[0-9a-f]$/, '') + 'z' + hex0;
  const id = W.create({ name: 'quietb', kind: 'service', restart: 'never', cmd: { argv: [process.execPath, path.join(W.root, 'prog5.js'), path.join(W.root, 'out'), 'quietb', line, '9000'], cwd: W.root, env: {} } }).job.id, job = W.jm.jobs.get(id);
  const printed = await W.untilMs(() => fs.existsSync(path.join(W.root, 'out', 'printed-quietb')), 15000);
  const logOf = () => W.walk(path.join(W.dd, 'job-logs', id)).filter(([p]) => /current\.log(\.1)?$/.test(p)).map(([, t]) => t).join('\n');
  const seen = printed && await W.untilMs(() => logOf().includes(line), 2000);
  const late = !seen && printed && await W.untilMs(() => logOf().includes(line), 5000);
  ok(printed && job.state === 'up', 'R1b — the scene: the service printed its one line (it ends in «' + hex0 + '», the first character of the value\'s hex spelling) and idles', { printed, state: job.state });
  ok(seen, 'R1b — THE LAW (a completed line is the job\'s words, never a value\'s piece): the line is in the log within 2 s, its last character too — RED: the settle holds the line\'s end back', { line: line.replace(S, ''), late, logTail: logOf().split(S).join('<THE VALUE>').slice(-120), maskerInProcess: seen ? null : probeSettle(S, line + '\n') });
  W.jm.stop(job); await W.untilMs(() => !['up', 'starting', 'stopping'].includes(job.state), 15000);
  W.end();
}
console.log('R2b an until-marker ending in the value base64 spelling\'s first character, before a quiet');
{
  const keepGrace = process.env.VIBESPACE_JOBS_GRACE_MS; process.env.VIBESPACE_JOBS_GRACE_MS = '200';
  try {
    const W = await world('untilb'), S = SENT('untilb');
    W.vault.agentPut('agent:conv-a/tok', S);
    const b0 = Buffer.from(S).toString('base64')[0], mark = 'until-mark-' + require('crypto').randomBytes(2).toString('hex') + 'z' + b0;
    const id = W.create({ name: 'untilb', untilOutput: mark, cmd: { argv: [process.execPath, path.join(W.root, 'prog5.js'), path.join(W.root, 'out'), 'untilb', mark, '6000'], cwd: W.root, env: {} } }).job.id, job = W.jm.jobs.get(id);
    const printed = await W.untilMs(() => fs.existsSync(path.join(W.root, 'out', 'printed-untilb')), 15000);
    const at = printed ? Number(fs.readFileSync(path.join(W.root, 'out', 'printed-untilb'), 'utf8')) : 0;
    const hit = printed && await W.untilMs(() => job._untilHit === true, 2500);
    const ended = printed && await W.untilMs(() => ['done', 'failed', 'interrupted'].includes(job.state), 9000);
    const endMs = ended ? Date.now() - at : null;
    ok(printed, 'R2b — the scene: the task printed its until-marker (it ends in «' + b0 + '», the first character of the value\'s base64 spelling) and waits quietly', { printed });
    ok(hit && ended && endMs < 4500, 'R2b — THE LAW (an until-marker completes its task, whatever its last character): the marker is seen within 2.5 s and ends the task — RED: the settle holds its last character back, the scan never sees it whole', { hit, endedAfterMs: endMs, untilHit: !!job._untilHit, maskerInProcess: hit ? null : probeSettle(S, mark + '\n') });
    if (!['done', 'failed', 'interrupted'].includes(job.state)) { W.jm.stop(job); await W.untilMs(() => !['up', 'starting', 'stopping'].includes(job.state), 15000); }
    W.end();
  } finally { if (keepGrace === undefined) delete process.env.VIBESPACE_JOBS_GRACE_MS; else process.env.VIBESPACE_JOBS_GRACE_MS = keepGrace; }
}
// ── S1 — A SCHEDULED TASK THAT ENDS ON A MARKER: each run ends only on a marker IT printed (主开发 r2895) ──────────────────────────
// The jobs design: `--until` completes the RUN that printed it; a cron's runs are one child's runs, each a fresh run. A run's marker
// (or its last line's carry) never reaches into the next run.
console.log('S1 a scheduled task ending on a marker: its second run ends only on the marker the second run itself printed');
{
  const keepGrace = process.env.VIBESPACE_JOBS_GRACE_MS; process.env.VIBESPACE_JOBS_GRACE_MS = '200';
  try {
    const W = await world('sched'), S = SENT('sched');
    W.vault.agentPut('agent:conv-a/tok', S);
    const mark = 'sched-mark-' + require('crypto').randomBytes(2).toString('hex') + 'q';
    const task = { cmd: { argv: [process.execPath, path.join(W.root, 'prog7.js'), path.join(W.root, 'out'), mark], cwd: W.root }, vault: ['TOK=vault://agent:conv-a/tok'], untilOutput: mark };
    const r = W.jm.create({ kind: 'cron', name: 'sched', schedule: { everyMs: 3600e3 }, action: { type: 'spawn-task', task }, owner: { conversation: { id: 'conv-a' }, sessionId: 'w-a', createdBy: 'agent', groupsSnapshot: [] } }, { conversationId: 'conv-a', groups: new Set() });
    const cron = r && r.job ? W.jm.jobs.get(r.job.id) : null;
    const child = () => (cron ? [...W.jm.jobs.values()].find((x) => x.cronParent === cron.id) : null);
    const at = (n, what) => { try { return Number(fs.readFileSync(path.join(W.root, 'out', `sched-${n}-${what}`), 'utf8')); } catch { return 0; } };
    const done = (j) => !!j && ['done', 'failed', 'interrupted'].includes(j.state);
    if (cron) W.jm._fireCron(cron, 'test');
    let hit1 = false;   // the engine clears a run's hit at its end (its finalize): noted when SEEN, then the end awaited
    const first = await W.untilMs(() => { const c = child(); if (c && c._untilHit === true) hit1 = true; return at(1, 'mark') > 0 && hit1 && done(c); }, 12000);
    if (cron) W.jm._fireCron(cron, 'test');
    let hitAt = 0, endAt = 0;
    const second = await W.untilMs(() => { const c = child(); if (c && c._untilHit === true && !hitAt) hitAt = Date.now(); if (c && done(c) && at(2, 'hello') && !endAt) endAt = Date.now(); return !!endAt || (at(2, 'mark') > 0 && Date.now() - at(2, 'mark') > 3000); }, 15000);
    const hello2 = at(2, 'hello'), mark2 = at(2, 'mark');
    ok(!!cron && first && hello2 > 0, 'S1 — the scene: the first run printed its marker (no line end) and was ended by it; the second run started and printed its first line', { cron: !!cron, first, hello2: hello2 > 0 });
    ok(hello2 > 0 && mark2 > 0 && (!hitAt || hitAt >= mark2) && (!endAt || endAt >= mark2), 'S1 — THE LAW (an until-marker ends the run that printed it): the second run is not ended at its first output — it ends only on the marker it printed itself — RED: the first run\'s marker ends it', { hitAfterHelloMs: hitAt ? hitAt - hello2 : null, endAfterHelloMs: endAt ? endAt - hello2 : null, ownMarkAfterHelloMs: mark2 ? mark2 - hello2 : null });
    const c = child(); if (c && !done(c)) { W.jm.stop(c); await W.untilMs(() => done(c) || !['up', 'starting', 'stopping'].includes(c.state), 15000); }
    if (cron) { try { W.jm.stop(cron); } catch { } }
    W.end();
  } finally { if (keepGrace === undefined) delete process.env.VIBESPACE_JOBS_GRACE_MS; else process.env.VIBESPACE_JOBS_GRACE_MS = keepGrace; }
}
report();

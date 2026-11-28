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
if (process.env.PIPES) {   // 主开发 r2773 (1): a value across the two pipes — split between them (a, b), or whole on one with the other's bytes between its pieces (c, d)
  const h = Math.floor(v.length / 2), nl = String.fromCharCode(10), still = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms), k = process.env.PIPES;
  const steps = { a: [[1, 'a1 ' + v.slice(0, h)], [2, v.slice(h) + ' a2' + nl]], b: [[2, 'b1 ' + v.slice(0, h)], [1, v.slice(h) + ' b2' + nl]],
    c: [[1, 'c1 ' + v.slice(0, h)], [2, '[the other pipe]' + nl], [1, v.slice(h) + ' c2' + nl]], d: [[2, 'd1 ' + v.slice(0, h)], [1, '[the other pipe]' + nl], [2, v.slice(h) + ' d2' + nl]],
    // round w3aprsv38 (a): a QUIET (900 ms, past the 400 ms settle) between the value's halves — on one pipe (e); with the other pipe's
    // line written during that quiet (f); the value split between the pipes across the quiet (g)
    e: [[1, 'e1 ' + v.slice(0, h), 900], [1, v.slice(h) + ' e2' + nl]], f: [[1, 'f1 ' + v.slice(0, h), 900], [2, '[the other pipe]' + nl, 900], [1, v.slice(h) + ' f2' + nl]],
    g: [[1, 'g1 ' + v.slice(0, h), 900], [2, v.slice(h) + ' g2' + nl]] }[k];
  // r3732: PIPES_END_NOW — the job ends right after its last word (no still after it), INSIDE the masker's quiet: the drain's scan
  // then meets a masker that still holds (the window a hosted runner's load opened, placed)
  const endNow = !!process.env.PIPES_END_NOW;
  // r3942 (5): PIPES_LAST_CHILD — the LAST piece is a CHILD's of the job's group, written when the end's drain signals the group: after
  // that drain's scan said its notice (the scan is read before the group's signal) — a PLACED order, never a race of the pipes
  const lastChild = !!process.env.PIPES_LAST_CHILD;
  if (lastChild) {
    const [lp, ls] = steps.pop(), lf = path.join(out, 'last-' + process.pid), ready = lf + '-ready';
    fs.writeFileSync(lf, ls);
    const src = 'const fs = require("fs"); const s = fs.readFileSync(process.argv[2], "utf8"); const say = () => { try { fs.writeSync(Number(process.argv[1]), s); } catch { } process.exit(0); }; process.on("SIGTERM", say); fs.writeFileSync(process.argv[3], "1"); setTimeout(say, 4000);';
    require('child_process').spawn(process.execPath, ['-e', src, String(lp), lf, ready], { stdio: ['ignore', 'inherit', 'inherit'] });
    for (let i = 0; i < 500 && !fs.existsSync(ready); i++) still(10);
  }
  steps.forEach(([p, s, ms], i) => { fs.writeSync(p, s); if (!((endNow || lastChild) && i === steps.length - 1)) still(ms || 150); });
  if (!endNow && !lastChild) still(700);
  process.exit(0);
}
if (process.env.QUIETSPLIT) {   // round wtlm3ig4w: a marker written in TWO pieces of one line with a quiet between them (the until scan's carry)
  process.stdout.write(process.env.QUIETSPLIT);
  for (let i = 0; i < 600 && !fs.existsSync(path.join(out, 'more')); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15);
  process.stdout.write(process.env.QUIETREST + String.fromCharCode(10));
  for (let i = 0; i < 600 && !fs.existsSync(path.join(out, 'release')); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15);
  process.exit(0);
}
if (process.env.ROADS) {   // r4321: while the job's line stands OPEN (a value's first half held by its masker), ONE own line comes by a road — (a) the wrapper's own road (a stop's line: the job hears the stop, the leg's go writes the rest), (b) the engine's run log line, (c) the notice of a failed mask (a chunk the leg's copy fails on) — then the job's line goes on
  const k = process.env.ROADS, h = Math.floor(v.length / 2), nl = String.fromCharCode(10), still = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms), hold = (f) => { for (let i = 0; i < 800 && !fs.existsSync(path.join(out, f)); i++) still(15); };
  const rest = () => { fs.writeSync(1, v.slice(h) + ' ' + k + '2' + nl); still(300); process.exit(0); };
  if (k === 'a') process.on('SIGTERM', () => fs.writeFileSync(path.join(out, 'roads-sig-a'), '1'));   // (a): the stop's signal is HEARD — its handler marks it
  fs.writeSync(1, k + '1 ' + v.slice(0, h));   // the line OPEN: the value's first half (its masker holds it)
  fs.writeFileSync(path.join(out, 'roads-open-' + k), '1');
  if (k === 'a') {   // the loop stays alive for the handler; the leg's go comes after its mark
    const iv = setInterval(() => { if (fs.existsSync(path.join(out, 'roads-go-a'))) { clearInterval(iv); rest(); } }, 15);
    return;   // (a CommonJS program: its top level ends here, the interval keeps it alive — never a fall-through into the modes below)
  }
  hold('roads-go-' + k);   // the leg's go — (b): after its placed line stands in the log; (c): it starts the chunk the copy fails on
  if (k === 'c') { fs.writeSync(1, 'MASK-FAILS-HERE'); still(150); }
  rest();
}
if (process.env.CRONMARK) {   // round w3aprsv38's MUST (r2890 / r3108): a task's two runs (a cron's fires, or a start by hand) — run 1 prints its marker on an UNTERMINATED line; run 2 works first (a first line longer than run 1's log), its marker only when the leg says. Its files are its marker's
  const nl = String.fromCharCode(10), mk = process.env.CRONMARK, cnt = path.join(out, 'runs-' + mk), hold = (f) => { for (let i = 0; i < 600 && !fs.existsSync(path.join(out, f + '-' + mk)); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15); };
  let n = 0; try { n = Number(fs.readFileSync(cnt, 'utf8')) || 0; } catch { n = 0; }
  fs.writeFileSync(cnt, String(n + 1));
  if (n === 0) { process.stdout.write('run one ' + mk); hold('go1'); process.exit(0); }
  process.stdout.write('run two working ' + 'x'.repeat(200) + nl); hold('mark2'); process.stdout.write(mk + nl); hold('go2'); process.exit(0);
}
if (process.env.QUIETLINE) {   // r2600's MUST: ONE short line (a service's «listening on …», a task's until-marker), then a quiet — round wtlm3ig4w: unterminated (QUIETNL=0), or ending in the value's own first character (QUIETHEAD)
  process.stdout.write(process.env.QUIETLINE + (process.env.QUIETHEAD ? v[0] : '') + (process.env.QUIETNL === '0' ? '' : String.fromCharCode(10)));
  for (let i = 0; i < 600 && !fs.existsSync(path.join(out, 'release')); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15);
  process.exit(0);
}
if (process.env.CHILDHALF) {   // F11 (stage L3, 主开发 r2552): the main writes a long lead and the value's first half and ENDS 100 ms later; a child of its group writes the second half when the end's drain signals it
  const half = Math.floor(v.length / 2), h2 = path.join(out, 'half2'), ready = path.join(out, 'child-ready');
  fs.writeFileSync(h2, v.slice(half));
  const src = 'const fs = require("fs"); const h = fs.readFileSync(process.argv[1], "utf8"); const say = () => { fs.writeSync(1, h + " rest" + String.fromCharCode(10) + "y".repeat(4000) + String.fromCharCode(10)); process.exit(0); }; process.on("SIGTERM", say); fs.writeFileSync(process.argv[2], "1"); setTimeout(say, 4000);';
  require('child_process').spawn(process.execPath, ['-e', src, h2, ready], { stdio: ['ignore', 'inherit', 'inherit'] });
  for (let i = 0; i < 500 && !fs.existsSync(ready); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  process.stdout.write('lead ' + 'x'.repeat(4000) + ' ' + v.slice(0, half));
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  process.exit(0);
}
if (process.env.PIECES) {   // F10 (stage L3, 主开发 r2524): a long lead, then the value in TWO pieces — the leg holds the quiet between them
  const sp = process.env.PIECES === 'b64' ? Buffer.from(v).toString('base64') : v;   // round wtlm3ig4w: an ENCODED spelling split by the quiet too
  const half = Math.floor(sp.length / 2) + (process.env.PIECES === 'b64' ? 1 : 0), waitFor = (f) => { for (let i = 0; i < 600 && !fs.existsSync(path.join(out, f)); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15); };
  process.stdout.write('lead ' + 'x'.repeat(4000) + ' ' + sp.slice(0, half));
  waitFor('piece2');
  process.stdout.write(sp.slice(half) + ' rest\\n' + 'y'.repeat(4000) + '\\nbegins ' + sp.slice(0, half));   // a window's worth after it (the masker reads a window at a time); at the pipe's end, a text that only BEGINS like it
  waitFor('release');
  process.exit(0);
}
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
async function world(tag, { jobs = null, wrap = WRAP_SRC, masker = true, dataDir = null, vault = null, doorSrc = null, grants: grants0 = null, held = false, srcMut = null } = {}) {
  const root = dataDir ? path.dirname(dataDir) : fs.mkdtempSync(path.join(os.tmpdir(), `${PREFIX}${tag}-`));
  ROOTS.add(root);
  const dd = dataDir || path.join(root, 'data');
  if (!dataDir) {
    if (masker && !srcMut) fs.symlinkSync(path.join(REPO, 'src'), path.join(root, 'src'));
    if (masker && srcMut) {   // the src the wrapper finds beside it: the repo's, entry by entry, but the named modules as their copies
      fs.mkdirSync(path.join(root, 'src'));
      for (const n of fs.readdirSync(path.join(REPO, 'src'))) { if (srcMut[n] != null) fs.writeFileSync(path.join(root, 'src', n), srcMut[n]); else fs.symlinkSync(path.join(REPO, 'src', n), path.join(root, 'src', n)); }
    }
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
  // stage L3's F1: a press carries the card's revision the page drew — here, unless a leg names one, the card as it is NOW (the
  // legs of an earlier revision name it)
  const ans = door.answer; door.answer = (id, o = {}) => ans(id, o.rev === undefined ? { ...o, rev: ((((todos.snapshot() || {}).open || []).find((i) => i.action && i.action.askId === id) || {}).action || {}).rev } : o);
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
  const walk1 = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk1(p, out); else if (e.isFile()) out.push(fs.readFileSync(p, 'latin1')); } return out; };
  // B-91aa's remainder (its gate 4): a store's temp renamed away between the listing and its read (the engine's paced save) — the walk walks
  // AGAIN (its whole check, unchanged), at most three times; any other error is the walk's own
  const walk = (d) => { for (let i = 0; ; i++) { try { return walk1(d); } catch (e) { if (!(e && e.code === 'ENOENT') || i >= 2) throw e; } } };
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
// F10 (stage L3, lane bl-proposals; 主开发 r2524): A VALUE IN TWO PIECES WITH A QUIET BETWEEN THEM never lands — the wrapper keeps
// each pipe's tail (the window a value could still begin in) until the next piece or the pipe's end; a quiet releases text, never
// that tail. The scene: a 4 000-character lead and the value's first half, a quiet the leg holds (past the release's 400 ms flush
// and a margin), then the second half; at the pipe's end a text that only BEGINS like the value. RED: the release's quiet flush
async function legPieces(wrap = null) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world(wrap ? 'piecem' : 'piece', wrap ? { wrap } : {}), S = SENT('piece'), half = Math.floor(S.length / 2);
  W.put(S);
  const job = W.jm.jobs.get(W.create({ env: { PIECES: '1' } }).job.id);
  await W.until(() => W.got().length === 1);
  const logOf = () => { try { return fs.readFileSync(job.runs[job.runs.length - 1].log, 'utf8'); } catch { return ''; } };
  const written1 = 'lead ' + 'x'.repeat(4000) + ' ' + S.slice(0, half);
  const released = await W.untilMs(() => logOf().includes('lead x'), 4000);   // what is decided is released at once (the lead's head)
  await nap(900);   // THE QUIET (its claim): past the release's 400 ms flush, with a margin for that flush to have landed
  const atQuiet = logOf(), mine = atQuiet.slice(Math.max(0, atQuiet.indexOf('lead ')));
  rows.quietHalf = atQuiet.includes(S.slice(0, half));
  const lag = written1.length - mine.length;
  row(released.ok && written1.startsWith(mine) && !rows.quietHalf && lag === half,
    'F10 + r2600 — AT A QUIET the masker SETTLES: everything certain is in the log — the whole lead and its space — and ONLY the value\'s first piece (the run that could begin a value) is kept back', { released, lag, half, logged: mine.length, written: written1.length });
  fs.writeFileSync(path.join(W.root, 'out', 'piece2'), '1');
  const second = await W.untilMs(() => logOf().includes(' rest'), 4000);
  const afterTwo = logOf();
  rows.whole = afterTwo.includes(S);
  row(second.ok && !rows.whole && formsAbsent(afterTwo, S) && afterTwo.includes(' [vault:TOK] rest'), 'F10 — THE SECOND PIECE: the value is masked WHOLE across the quiet ([vault:TOK]) — no spelling of it in the log', afterTwo.slice(Math.max(0, afterTwo.indexOf(' rest') - 60), afterTwo.indexOf(' rest') + 8));
  W.release();
  await W.until(() => job.state === 'done');
  const atEnd = logOf();
  rows.wholeAtEnd = atEnd.includes(S);
  row(!rows.wholeAtEnd && formsAbsent(atEnd, S) && atEnd.includes('begins ' + S.slice(0, half)), 'F10 — AT THE PIPE\'S END the masker ends: a trailing text that only BEGINS like the value is the job\'s own words (written as it came), and the log holds no spelling of the value', atEnd.slice(Math.max(0, atEnd.indexOf('begins ')), atEnd.indexOf('begins ') + 7 + half));
  W.end();
  return rows;
}
// F11 (stage L3, lane bl-proposals; 主开发 r2552): ONE MASKER FOR THE PIPES' WHOLE LIFE — the release ended it at the MAIN's exit
// event and a fresh one took what the job's group wrote during the drain. The scene: the main writes a 4 000-character lead and the
// value's first half, ends 100 ms later (under the 400 ms quiet); its child writes the second half when the end's drain signals it.
// RED: the release's flush at the exit event put back
async function legChildHalf(wrap = null) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world(wrap ? 'chalfm' : 'chalf', wrap ? { wrap } : {}), S = SENT('chalf');
  W.put(S);
  const job = W.jm.jobs.get(W.create({ env: { CHILDHALF: '1' } }).job.id);
  const ended = await W.untilMs(() => ['done', 'failed', 'interrupted'].includes(job.state), 12000);
  let log = ''; try { log = fs.readFileSync(job.runs[job.runs.length - 1].log, 'utf8'); } catch { }
  let wrote = false; try { wrote = fs.existsSync(path.join(W.root, 'out', 'half2')); } catch { }
  rows.whole = log.includes(S);
  row(ended.ok && wrote && !rows.whole && formsAbsent(log, S) && log.includes(' [vault:TOK] rest'), 'F11 — a value whose second half the job\'s CHILD writes AFTER THE MAIN ENDED (at the end\'s drain, under the old 400 ms quiet) is masked WHOLE: one masker for the pipes\' whole life, ended at their end', { ended, state: job.state, rest: log.includes(' rest'), placeholder: log.includes('[vault:TOK]') });
  W.end();
  return rows;
}
// round wi8mtvm6c's MUST (主开发 r2600): A QUIET RELEASES TEXT — a short last line before a quiet is in the log within the quiet's
// second (a service's «listening on …»), and a task's until-marker before a quiet FIRES (the until scan reads the log). RED: the
// quiet that releases nothing (the settle cut)
async function legQuietLine(wrap = null) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world(wrap ? 'qlinem' : 'qline', wrap ? { wrap } : {}), S = SENT('qline');
  W.put(S);
  const svc = W.jm.jobs.get(W.create({ kind: 'service', restart: 'never', name: 'listens', env: { QUIETLINE: 'listening on the service socket' } }).job.id);
  const task = W.jm.jobs.get(W.create({ name: 'marks', untilOutput: 'UNTIL-READY-MARK', env: { QUIETLINE: 'UNTIL-READY-MARK' } }).job.id);
  await W.until(() => W.got().length === 2);
  const logOf = (j) => { try { return fs.readFileSync(j.runs[j.runs.length - 1].log, 'utf8'); } catch { return ''; } };
  const t0 = Date.now();
  const line = await W.untilMs(() => logOf(svc).includes('listening on the service socket'), 1600);
  const heldThen = svc.state === 'up' && !fs.existsSync(path.join(W.root, 'out', 'release'));   // a service that runs is «up»   // seen while the job still holds its quiet: never its end's flush (an event, no clock judged)
  const hit = await W.untilMs(() => task._untilHit === true, 2600 - (Date.now() - t0));
  rows.line = line.ok; rows.hit = hit.ok;
  if (wrap) { W.release(); W.end(); return rows; }
  row(line.ok && heldThen, 'r2600 — a short last line before a QUIET is in the log DURING the quiet, the job still running and still held (a service\'s «listening on …» — never missing for its whole life)', { line, heldThen, state: svc.state });
  row(hit.ok, 'r2600 — a task\'s until-marker before a quiet FIRES (the until scan reads the log: the task ends as it did in 2.369.415)', { hit, untilHit: task._untilHit });
  W.release(); W.end();
  return rows;
}
// round wtlm3ig4w's two MUSTS (主开发 r2600's rulings): AT A SETTLE A COMPLETED LINE IS CERTAIN and a view piece is uncertain only
// while UNFINISHED — a coloured last line, a line with an ampersand pair near its end and a line ending in the value's own first
// character are in the log within the quiet's second; a marker written in two pieces of a line fires (the until scan carries its
// unterminated last line). REDs: 7e1674a83's settle (the whole held text read, every view's first trigger an end); the scan without
// its carry
async function legSettleLines({ srcMut = null, jobs = null } = {}) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world(srcMut || jobs ? 'slinem' : 'sline', { srcMut, jobs }), S = SENT('sline');
  W.put(S);
  const mk = (name, env, extra = {}) => W.jm.jobs.get(W.create({ kind: 'service', restart: 'never', name, env, ...extra }).job.id);
  const colour = mk('coloured', { QUIETLINE: '\u001b[32mlistening on the colour socket\u001b[0m', QUIETNL: '0' });
  const amp = mk('ampersand', { QUIETLINE: 'serving: run a && b', QUIETNL: '0' });
  const head = W.jm.jobs.get(W.create({ name: 'head-mark', untilOutput: 'MARK-ENDS-' + S[0], env: { QUIETLINE: 'MARK-ENDS-', QUIETHEAD: '1' } }).job.id);
  const split = W.jm.jobs.get(W.create({ name: 'split-mark', untilOutput: 'SPLIT-MARK-READY', env: { QUIETSPLIT: 'SPLIT-MARK-', QUIETREST: 'READY' } }).job.id);
  await W.until(() => W.got().length === 4);
  const logOf = (j) => { try { return fs.readFileSync(j.runs[j.runs.length - 1].log, 'utf8'); } catch { return ''; } };
  const t0 = Date.now();
  const a = await W.untilMs(() => logOf(colour).includes('listening on the colour socket\u001b[0m'), 1600);
  const b = await W.untilMs(() => logOf(amp).includes('serving: run a && b'), Math.max(0, 1600 - (Date.now() - t0)));
  const c = await W.untilMs(() => head._untilHit === true, Math.max(0, 2600 - (Date.now() - t0)));
  const half = await W.untilMs(() => logOf(split).includes('SPLIT-MARK-'), 1600);   // its first piece released at the quiet — and read by the until scan
  for (let i = 0; i < 4; i++) { try { await W.jm._sweep(); } catch { } await nap(15); }
  fs.writeFileSync(path.join(W.root, 'out', 'more'), '1');
  const d = await W.untilMs(() => split._untilHit === true, 2600);
  Object.assign(rows, { a: a.ok, b: b.ok, c: c.ok, half: half.ok, d: d.ok });
  if (srcMut || jobs) { W.release(); W.end(); return rows; }
  row(a.ok, 'round wtlm3ig4w MUST ONE — a COLOURED last line (its reset code a finished piece) is in the log whole within the quiet\'s second', a);
  row(b.ok, '…and a line with an ampersand pair near its end (no entity can begin there) — whole in the log', b);
  row(c.ok && logOf(head).includes('MARK-ENDS-' + S[0] + '\n'), 'MUST TWO — a line that ENDS in the value\'s own first character is a completed line: certain, whole in the log, and its until-marker fires', { c, line: logOf(head).includes('MARK-ENDS-') });
  row(half.ok && d.ok, 'the until scan carries an unterminated last line into its next read: a marker written in two pieces of one line, a quiet between them, FIRES when its line completes', { half, d });
  W.release(); W.end();
  return rows;
}
// round wtlm3ig4w: an ENCODED spelling (base64) split by a quiet is still masked WHOLE. RED: the release's quiet flush
async function legPiecesEncoded(wrap = null) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world(wrap ? 'p64m' : 'p64', wrap ? { wrap } : {}), S = SENT('p64');
  W.put(S);
  const job = W.jm.jobs.get(W.create({ env: { PIECES: 'b64' } }).job.id);
  await W.until(() => W.got().length === 1);
  const logOf = () => { try { return fs.readFileSync(job.runs[job.runs.length - 1].log, 'utf8'); } catch { return ''; } };
  await W.untilMs(() => logOf().includes('lead x'), 4000);
  await nap(900);   // THE QUIET (its claim): a settle stands between the two pieces
  fs.writeFileSync(path.join(W.root, 'out', 'piece2'), '1');
  await W.untilMs(() => logOf().includes(' rest'), 4000);
  rows.masked = formsAbsent(logOf(), S) && logOf().includes(' [vault:TOK] rest');
  if (wrap) { W.release(); W.end(); return rows; }
  row(rows.masked, 'round wtlm3ig4w — the value\'s BASE64 spelling written in two pieces with a quiet between them is masked whole (the settle keeps the encoded piece back too)', logOf().slice(Math.max(0, logOf().indexOf(' rest') - 40), logOf().indexOf(' rest') + 6));
  W.release(); W.end();
  return rows;
}
// 主开发 r2773 (1): THE MASKER MAY HIDE A VALUE; IT NEVER LOSES A BYTE OF THE JOB'S OWN WORDS — every scene of the settle through
// the REAL wrapper: what the job wrote, with only the value replaced, comes out — every byte counted (the log's job text, its
// placeholders taken out, against the job's own words), every word in its pipe's order. RED: a settle that drops the run it keeps
// round w3aprsv38's MUST (主开发 r2890 / r3108): THE UNTIL SCAN'S CARRY IS ITS RUN'S — a task's run that hit its marker on an
// UNTERMINATED line left the marker in the carry, and the next run's first read joined it in front: that run was «completing» at its
// first output. Cleared at the run's judged end. Two roads: a cron's next fire (①h) and a start by hand (①i). RED: the end without the clear
// A START BY HAND keeps its last run's cursor (the release's): the carry would join only when the new run's log has passed the old
// cursor at its first read (else the rotated branch clears it) — the leg sweeps only after the long first line is in, and a scene an
// engine tick scanned first (the cursor moved before the leg's own sweep) is tried once more with a fresh job
async function legHandCarry({ jobs = null } = {}) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world(jobs ? 'hcarrym' : 'hcarry', { jobs });
  const logOf = (j) => { try { return fs.readFileSync(j.runs[j.runs.length - 1].log, 'utf8'); } catch { return ''; } };
  const tries = [];
  for (let k = 1; k <= 2; k++) {
    const mk = 'HAND-RUN-MARK-' + k, put = (f) => fs.writeFileSync(path.join(W.root, 'out', f + '-' + mk), '1');
    const r = W.jm.create({ kind: 'task', name: 'hand-mark-' + k, cmd: { argv: [process.execPath, path.join(W.root, 'prog.js'), path.join(W.root, 'out')], cwd: W.root, env: { CRONMARK: mk } }, untilOutput: mk, owner: { conversation: { id: 'conv-a' }, sessionId: 'w-a', createdBy: 'agent', groupsSnapshot: [] } }, { conversationId: 'conv-a', groups: new Set(), isUser: true });
    const job = W.jm.jobs.get(r.job && r.job.id);
    const t = { k, hit1: false, carried: false, end1: false, started: null, working: false, scene: false, early: null, hit2: false };
    tries.push(t);
    if (!job) break;
    t.hit1 = (await W.untilMs(() => job._untilHit === true, 8000)).ok;
    t.carried = String(job._untilCarry || '').includes(mk);   // run 1 hit on its UNTERMINATED line: its marker in the carry
    put('go1');
    t.end1 = (await W.untilMs(() => !['up', 'starting'].includes(job.state), 8000)).ok;
    const c0 = job._untilCursor, n1 = job.runs.length;
    const st = W.jm.start(job);   // BY HAND — the release keeps the cursor; the end's clear has taken the carry
    t.started = !!(st && st.ok);
    for (let i = 0; i < 400 && !(job.runs.length > n1 && logOf(job).includes('run two working')); i++) await nap(15);   // NO sweep of the leg's own until the long first line is in
    t.working = job.runs.length > n1 && logOf(job).includes('run two working');
    t.scene = t.hit1 && t.carried && t.end1 && t.started && t.working && job._untilCursor === c0 && fs.statSync(job.runs[job.runs.length - 1].log).size >= (c0 || 0);
    for (let i = 0; i < 4; i++) { try { await W.jm._sweep(); } catch { } await nap(15); }   // the scan has read the second run's first line
    t.early = job._untilHit === true;
    put('mark2');
    t.hit2 = (await W.untilMs(() => job._untilHit === true, 8000)).ok;
    put('go2');
    if (t.scene) break;   // a scene an engine tick scanned first: once more, a fresh job
  }
  const last = tries[tries.length - 1] || {};
  Object.assign(rows, { scene: !!last.scene, early: last.early, tries: tries.length });
  if (jobs) { W.end(); return rows; }
  row(!!last.scene && last.early === false && last.hit2 === true, 'round w3aprsv38 MUST (r3108) — a task whose run hit its marker on an UNTERMINATED line, STARTED AGAIN BY HAND (its new log past the old cursor at the first read): not «completing» at its first output, and it hits when it prints the marker itself', { tries });
  W.end();
  return rows;
}
async function legCronCarry({ jobs = null } = {}) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world(jobs ? 'ccarrym' : 'ccarry', { jobs });
  const task = { cmd: { argv: [process.execPath, path.join(W.root, 'prog.js'), path.join(W.root, 'out')], cwd: W.root, env: { CRONMARK: 'CRON-RUN-MARK' } }, untilOutput: 'CRON-RUN-MARK' };
  const r = W.jm.create({ kind: 'cron', name: 'cron-mark', schedule: { everyMs: 3600e3 }, action: { type: 'spawn-task', task }, owner: { conversation: { id: 'conv-a' }, sessionId: 'w-a', createdBy: 'agent', groupsSnapshot: [] } }, { conversationId: 'conv-a', groups: new Set(), isUser: true });
  const cron = W.jm.jobs.get(r.job && r.job.id);
  const kid = () => [...W.jm.jobs.values()].find((j) => j.cronParent === (cron && cron.id));
  const logOf = (j) => { try { return fs.readFileSync(j.runs[j.runs.length - 1].log, 'utf8'); } catch { return ''; } };
  if (cron) W.jm._fireCron(cron, 'test');
  const hit1 = await W.untilMs(() => !!kid() && kid()._untilHit === true, 8000);
  const carried = !!kid() && String(kid()._untilCarry || '').includes('CRON-RUN-MARK');   // the scene: run 1 hit on its UNTERMINATED line (its marker in the carry)
  fs.writeFileSync(path.join(W.root, 'out', 'go1-CRON-RUN-MARK'), '1');
  const end1 = await W.untilMs(() => !!kid() && !['up', 'starting'].includes(kid().state), 8000);
  const k = kid(), n1 = k ? k.runs.length : 0;
  if (cron) W.jm._fireCron(cron, 'test');
  const working = await W.untilMs(() => !!k && k.runs.length > n1 && logOf(k).includes('run two working'), 8000);
  for (let i = 0; i < 4; i++) { try { await W.jm._sweep(); } catch { } await nap(15); }   // the scan has read the second run's first line
  const early = !!k && k._untilHit === true;
  fs.writeFileSync(path.join(W.root, 'out', 'mark2-CRON-RUN-MARK'), '1');
  const hit2 = await W.untilMs(() => !!k && k._untilHit === true, 8000);
  Object.assign(rows, { scene: hit1.ok && carried && end1.ok && working.ok, early });
  fs.writeFileSync(path.join(W.root, 'out', 'go2-CRON-RUN-MARK'), '1');
  if (jobs) { W.end(); return rows; }
  row(hit1.ok && carried && end1.ok && working.ok && !early && hit2.ok, 'round w3aprsv38 MUST — a scheduled task whose run hit its marker on an UNTERMINATED line (the marker in the carry): its NEXT run is not «completing» at its first output, and hits only when it prints the marker itself', { hit1: hit1.ok, carried, end1: end1.ok, working: working.ok, early, hit2: hit2.ok, state: k && k.state });
  W.end();
  return rows;
}
// r4321 (主开发): THE OWN LINES' ROADS, PLACED — while a job's line stands OPEN across the quiet between a value's halves (scene g's own
// moment), ONE own line is written by EACH road: (a) the wrapper's own road (a stop's line), (b) the engine's run log line, (c) the notice
// of a failed mask (a copy of the masker that fails on one chunk). For each: a line break stands BEFORE the own line, the job's line goes
// on after it (its head and its end in the log, in order), and no part of the value is shown. A red here names the writer (law 3)
async function legOwnRoads({ failMask = null } = {}) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world(failMask ? 'roadsm' : 'roads', failMask ? { srcMut: failMask } : {}), S = SENT('roads'), h = Math.floor(S.length / 2);
  W.put(S);
  const rawOf = (j) => { let t = ''; try { t = fs.readFileSync(j.runs[j.runs.length - 1].log, 'utf8'); } catch { } return t; };
  const marked = (t) => t.split(S).join('<VALUE>').split(S.slice(0, h)).join('<H1>').split(S.slice(h)).join('<H2>');
  const ks = failMask ? ['c'] : ['a', 'b'];
  const jobs = Object.fromEntries(ks.map((k) => [k, W.jm.jobs.get(W.create({ name: 'roads-' + k, env: { ROADS: k } }).job.id)]));
  const opened = {}, heard = {};
  for (const k of ks) {
    const j = jobs[k];
    opened[k] = (await W.untilMs(() => fs.existsSync(path.join(W.root, 'out', 'roads-open-' + k)) && rawOf(j).includes(k + '1 '), 8000)).ok;   // the quiet's settle wrote the line's head; its half held
    // (a): the stop reaches the job's group while its line stands open — the job HEARD it (its own mark), then the leg's go. The
    // wrapper's stop line is never waited for in the log: by the road's law it waits while the masker holds the value's first half
    if (k === 'a') { W.jm.stop(j); heard.a = (await W.untilMs(() => fs.existsSync(path.join(W.root, 'out', 'roads-sig-a')), 8000)).ok; }
    if (k === 'b') { W.jm._runLogLine(W.jm._runLogFile(j), "[jobs] placed: the engine's own line (r4321)"); await W.untilMs(() => rawOf(j).includes('[jobs] placed'), 8000); }
    fs.writeFileSync(path.join(W.root, 'out', 'roads-go-' + k), '1');
  }
  const ended = await W.untilMs(() => ks.every((k) => ['done', 'failed', 'interrupted', 'stopped', 'down'].includes(jobs[k].state)), 15000);
  const ROAD = { a: [/\[job-wrapper\] stop:/, 'the wrapper\'s own road (a stop\'s line)'], b: [/\[jobs\] placed:/, 'the engine\'s run log line'], c: [/\[job-wrapper\] output withheld:/, 'the notice of a failed mask'] };
  for (const k of ks) {
    const t = rawOf(jobs[k]), m = ROAD[k][0].exec(t), at = m ? m.index : -1;
    const x = { opened: opened[k], ...(k === 'a' ? { heard: heard.a } : {}), own: at >= 0, breakBefore: at === 0 || (at > 0 && t[at - 1] === '\n'), lineGoesOn: t.includes(k + '1 ') && t.indexOf(k + '1 ') < t.indexOf(' ' + k + '2'), noValue: !t.includes(S.slice(0, h)) && !t.includes(S.slice(h)), log: marked(t).slice(0, 600) };
    row(ended.ok && x.opened && x.heard !== false && x.own && x.breakBefore && x.lineGoesOn && x.noValue, `r4321 (${k}) — ${ROAD[k][1]}, written while the job's line stands OPEN (its value's first half held): a line break stands before it, the job's line goes on after it, no part of the value shown`, x);
  }
  W.end();
  return rows;
}
async function legBytes({ srcMut = null } = {}) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world(srcMut ? 'bytesm' : 'bytes', { srcMut }), S = SENT('bytes'), h = Math.floor(S.length / 2);
  W.put(S);
  // each scene's own words BY PIPE, in the order the pipe wrote them (1 stdout, 2 stderr)
  const own = { a: [[1, 'a1 '], [2, ' a2\n']], b: [[2, 'b1 '], [1, ' b2\n']], c: [[1, 'c1 '], [2, '[the other pipe]\n'], [1, ' c2\n']], d: [[2, 'd1 '], [1, '[the other pipe]\n'], [2, ' d2\n']],
    e: [[1, 'e1 '], [1, ' e2\n']], f: [[1, 'f1 '], [2, '[the other pipe]\n'], [1, ' f2\n']], g: [[1, 'g1 '], [2, ' g2\n']] };
  // a pipe's own ORDER, by position: each of its words found after the one before it (the other pipe's words may fall between)
  const inOrder = (t, ws) => [1, 2].every((p) => { let at = 0; for (const [q, w] of ws) { if (q !== p) continue; const x = w.trimEnd(), i = t.indexOf(x, at); if (i < 0) return false; at = i + x.length; } return true; });
  const jobs = Object.fromEntries(Object.keys(own).map((k) => [k, W.jm.jobs.get(W.create({ name: 'pipes-' + k, env: { PIPES: k } }).job.id)]));
  const ended = await W.untilMs(() => Object.values(jobs).every((j) => ['done', 'failed', 'interrupted'].includes(j.state)), 15000);
  const rawOf = (j) => { let t = ''; try { t = fs.readFileSync(j.runs[j.runs.length - 1].log, 'utf8'); } catch { } return t; };
  const textOf = (j) => rawOf(j).split('\n').filter((l) => !l.startsWith('[job-wrapper]')).join('\n');
  // r4321 FENCE 1: a print never holds the value or a half of it — each is replaced by its own mark first
  const marked = (t) => t.split(S).join('<VALUE>').split(S.slice(0, h)).join('<H1>').split(S.slice(h)).join('<H2>');
  const gotAll = W.got(), handed = { jobs: gotAll.length, equal: gotAll.filter((g) => g.v === S).length };   // r4321: every job was handed its value (equal or not, never the value)
  const out = {};
  for (const [k, j] of Object.entries(jobs)) {
    const t = textOf(j), bare = t.replace(/\[vault:[^\]]*\]/g, '');
    const want = own[k].map(([, w]) => w).join('');
    out[k] = { words: inOrder(t, own[k]), bytes: Buffer.byteLength(bare.replace(/\n+$/, '')) === Buffer.byteLength(want.replace(/\n+$/, '')), noValue: !t.includes(S.slice(0, h)) && !t.includes(S.slice(h)), log: t.replace(S.slice(0, h), '<H1>').replace(S.slice(h), '<H2>').slice(0, 200) };
  }
  rows.scenes = out;
  if (srcMut) { W.end(); return rows; }
  const allOk = ended.ok && Object.values(out).every((x) => x.words && x.bytes && x.noValue) && handed.jobs >= Object.keys(own).length && handed.equal === handed.jobs;
  // r4321: a failing scene is printed WHOLE (its raw log, the wrapper's lines in it; the value and its halves as marks) — the next
  // sighting names what wrote inside the job's line
  if (!allOk) for (const [k, x] of Object.entries(out)) if (!(x.words && x.bytes && x.noValue)) console.log(`      ①f WHOLE PRINT of scene ${k} (r4321; <VALUE> / <H1> / <H2> are marks, never the value): raw log ${JSON.stringify(marked(rawOf(jobs[k])))} · its own words by pipe ${JSON.stringify(own[k])} · handed its value: ${handed.equal} of ${handed.jobs} jobs`);
  row(allOk, 'r2773 (1) — NO BYTE OF THE JOB\'S OWN WORDS IS LOST: a value split between the pipes (a, b), whole on one with the other\'s bytes between its pieces (c, d), a QUIET between its halves (e), the other pipe\'s line written during that quiet (f), split between the pipes across a quiet (g) — each pipe\'s words in its own order, every byte counted, neither half of the value in the log — and every job was handed its value (its own got-file: equal or not, never the value)', { ...out, handed });
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
  row(st.ok && st.state === 'waiting' && st.waitFor === 'approval' && job.runs.length === 0 && /ONE card naming its entries asks the user in their For-you tray/.test(words) && /starts by itself once they allow it/.test(words) && /vibespace-vault put/.test(words) && !/later VibeSpace update/.test(words), 'round 2 + lane vault-job-approval: start() of the waiting task answers its wait in the words of now — the card in the user\'s tray, what each answer does, and the door that needs none (an entry the agent puts)', st);   // stale-pins: kept (an absence check: L1a's words must be gone)
  W.grants.set('vault-job', 'secrets:agent:conv-a/tok#secret', { to: [{ kind: 'conversation', key: 'conv-a', jobs: [job.id] }] }, 'test');
  await W.until(() => W.got().length === 1 && job.state === 'done');
  const minted = W.vault.secretGet('agent:conv-a/tok').value.toString();
  const log = fs.readFileSync(job.runs[0].log, 'utf8');
  row((W.got()[0] || {}).v === minted && formsAbsent(log, minted) && job.runs.length === 1, 'a vault-job row naming THIS job starts it (the grants store\'s change): the job read the minted value, its log holds none of it');
  W.end();
  return rows;
}
// ── ⑨ THE APPROVAL CARD (lane vault-job-approval, design-vault-service-secret L1b — the owner's decisions ① ②) ──────────────
// stage L3's F1: ONE card a job — its entries are the action's e0…e7; `entry` here = its first (a one-entry job's only one)
const cards = (W, st = 'open') => ((W.todos.snapshot() || {})[st] || []).filter((i) => i.action && i.action.type === 'vault-job-ask').map((i) => ({ ...i, action: { ...i.action, entry: i.action.e0 } }));
const entriesOf = (a) => Array.from({ length: 8 }, (_, i) => a[`e${i}`]).filter(Boolean);
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
  row(job.state === 'waiting' && job.waitFor === 'approval' && c0.length === 1 && VJ.ASK_ID_RE.test(String(a.askId)) && a.jobId === job.id && a.e0 === 'secrets:agent:conv-a/tok#secret' && entriesOf(a).length === 1 && a.rev === 1 && a.conv === 'conv-a' && it.sessionKey === 'claude:conv-a' && !it.expiresAt && it.sessionName === 'Chat A' && it.jobId === job.id,
    'a value the hub MINTED waits for approval — and ONE card is filed: vault-job-ask (the job, its entries\' ids, the card\'s revision, the owner conversation), under that conversation, NO expiry', { state: job.state, n: c0.length, action: a, key: it.sessionKey, exp: it.expiresAt });
  row(f.v === 2 && f.job && f.job.name && !('id' in f.job) && f.job.kind === 'task' && Array.isArray(f.entries) && f.entries.length === 1 && f.entries[0].var === 'TOK_FD' && !JSON.stringify(f).includes(job.id) && !JSON.stringify(f).includes('vault://') && !it.text.includes(job.id) && !it.detail.includes(job.id) && !it.detail.includes('vault://') && it.text.startsWith(`Background job «${f.job.name}»`) && f.program && f.program.path === fs.realpathSync(process.execPath) && f.program.writable === !rootChain(fs.realpathSync(process.execPath)) && f.script && f.script.path === fs.realpathSync(path.join(W.root, 'prog.js')) && f.script.writable === true && f.folder === W.root && f.dest === 'unknown' && /prog\.js/.test(f.command) && /— an agent can change this script\./.test(it.detail) && /Where it sends the secrets: unknown/.test(it.detail),
    'its facts (v 2, stage L3\'s F1): the job\'s NAME first and its kind — no job id, no vault reference anywhere on the card —, the fd it reads ($TOK_FD), the program\'s and the script\'s real paths and that an agent can change them (plain facts), the folder, the command, the destination unknown', f);
  row(!JSON.stringify(W.todos.snapshot()).includes(minted) && formsAbsent(JSON.stringify(W.todos.snapshot()), minted) && W.walk(W.dd).every((t) => !t.includes(minted)), 'the card, the For-you store and every file of the data dir hold no spelling of the value (the card is an accident road)');
  W.jm.vaultChanged('vault-approved'); W.jm.start(job); W.jm.vaultChanged('vault-unlocked');
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  rows.rejudge = cards(W).length;
  row(cards(W).length === 1 && job.state === 'waiting', 'every re-judge of the waiting job (an approval change, a start, an unlock) files NO second card — one per job', cards(W).length);
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
// B-f276 family unit 2 (the census's J2, 主开发 r3115): jobs.json HELD — the engine's memory is EMPTY because it is unread: a press on
// a job's approval card is REFUSED BY NAME (records-unread) and the card stays open; read again, the same press answers as ever
async function legHeldPress(doorSrc = null) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world('heldpress', { doorSrc });
  W.vault.agentMint('agent:conv-a/tok', { length: 32 }); W.release();
  const job = W.jm.jobs.get(W.create({ kind: 'service', restart: 'never' }).job.id);
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  const a = (cards(W)[0] || {}).action || {};
  const keep = new Map(W.jm.jobs), was = W.jm._unread.store;
  W.jm.jobs.clear(); W.jm._unread.store = { code: 'EIO', why: 'the read failed (placed)', at: Date.now() };
  const h = W.door.answer(a.askId, { answer: 'deny', by: 'user', person: true });
  await W.door.factsLanded();
  rows.held = h; rows.open = cards(W).length;
  row(!!h && h.ok === false && h.code === 'records-unread' && cards(W).length === 1, 'jobs.json HELD (its memory empty because unread): a press on a job\'s approval card is REFUSED BY NAME (records-unread) — the card stays open, never closed as over', { h, open: cards(W).length });
  const rv = W.door.revokeAll(job.id, { by: 'user' });
  row(!!rv && rv.ok === false && rv.code === 'records-unread' && cards(W).length === 1, 'round wgbjnr750: the job card\'s ✕ while held is refused BY NAME (records-unread), never «bad_revoke» — nothing taken back', rv);
  { const VR = fs.readFileSync(path.join(REPO, 'src/routes/vault.js'), 'utf8');
    row(VR.includes("'records-unread': 503,") && VR.includes("(code === 'records-unread' && r && r.words)"), 'round wgbjnr750 (pin): the route answers a held refusal 503 with the hold\'s words — never the bare code with 400'); }
  // the reader table (r3230): AFTER A TORN LIFT (the list read, the job no longer in it) a job a kept copy still names is UNKNOWN, never
  // «over»: the press is refused by name and the card stays (the stand-in answers the production name: a kept copy names the job)
  { W.jm._unread.store = was; const nb = W.jm.namedByCopy; W.jm.namedByCopy = () => true;
    const tn = W.door.answer(a.askId, { answer: 'deny', by: 'user', person: true });
    await W.door.factsLanded();
    rows.torn = tn; rows.tornOpen = cards(W).length;
    row(!!tn && tn.ok === false && tn.code === 'records-unread' && /kept copy still names it/.test(String(tn.words)) && cards(W).length === 1, 'the reader table: after a torn lift a press for a job a kept copy names is refused by name — the card stays, never «the job that asked is gone»', tn);
    W.jm.namedByCopy = nb; }
  W.jm.jobs.clear(); for (const [k, v] of keep) W.jm.jobs.set(k, v); W.jm._unread.store = was;
  const d = W.door.answer(a.askId, { answer: 'deny', by: 'user', person: true });
  await W.door.factsLanded();
  row(!!d && d.ok && d.outcome === 'denied' && job.state === 'failed', 'read again, the same press answers as ever (denied — the job refused by name)', d);
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
  const fiveCards = cards(W).filter((i) => i.action.jobId === five.id);
  row(five.state === 'waiting' && five.waitFor === 'approval' && fiveCards.length === 1 && entriesOf(fiveCards[0].action).length === 5 && fiveCards[0].facts.entries.length === 5, 'a job with FIVE entries to approve WAITS on ONE card naming all five (stage L3\'s F1) — the cap counts JOBS (four per conversation), so a job with many values can still start', { state: five.state, n: fiveCards.length, entries: fiveCards[0] && entriesOf(fiveCards[0].action).length });
  const two = W.jm.jobs.get(W.create({ name: 'two', vault: ['A=vault://agent:conv-a/tok', 'B=vault://agent:conv-a/tok'] }).job.id);
  await W.door.factsLanded();   // the card is filed when its file facts land (off the loop)
  row(two.state === 'waiting' && cards(W).filter((i) => i.action.jobId === two.id).length === 1, 'two NAMEs on ONE entry: one card naming it once', cards(W).filter((i) => i.action.jobId === two.id).length);
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
// ── ⑨d ONE CARD A JOB (stage L3's F1, lane bl-proposals' finding; 主开发 r2524 / r2528 — the owner's decided ①: «每个用 key 的后台工作一张
// 卡，你批一次»): one card names every entry the job waits for; one Allow (one 验证是你) covers them, all or nothing; one Deny covers
// them; what stands is said; a set that grows is the SAME card drawn again, a press of the earlier set refused; the job card's ✕ takes
// back all of them ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
const E_TOK = 'secrets:agent:conv-a/tok#secret', E_T2 = 'secrets:agent:conv-a/t2#secret';
const TWO = ['TOK=vault://agent:conv-a/tok', 'T2=vault://agent:conv-a/t2'];
const memberOf = (W, e) => (((W.grants.rowsFor('vault-job', e)[0] || {}).to || [])[0] || {});
async function legOneCard() {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world('onec');
  W.vault.agentMint('agent:conv-a/tok', { length: 32 }); W.vault.agentMint('agent:conv-a/t2', { length: 32 }); W.release();
  const v1 = W.vault.secretGet('agent:conv-a/tok').value.toString(), v2 = W.vault.secretGet('agent:conv-a/t2').value.toString();
  const job = W.jm.jobs.get(W.create({ name: 'two-keys', vault: TWO }).job.id);
  await W.door.factsLanded();
  const mine = cards(W).filter((i) => i.action.jobId === job.id), it = mine[0] || {}, a = it.action || {}, f = it.facts || {};
  row(job.state === 'waiting' && job.waitFor === 'approval' && mine.length === 1 && JSON.stringify(entriesOf(a).sort()) === JSON.stringify([E_TOK, E_T2].sort()) && (f.entries || []).length === 2 && (f.entries || []).every((e) => !e.new) && !f.standing && String(it.text).startsWith('Background job «two-keys» asks to use «') && (String(it.text).match(/«/g) || []).length === 3,
    'F1 — a job with TWO minted entries files ONE card naming BOTH (one card a job) — the job\'s own name first, then what it will use', { n: mine.length, entries: entriesOf(a), text: it.text });
  const yes = W.door.answer(a.askId, { answer: 'allow', reauthed: true, by: 'user', person: true });
  await W.until(() => W.got().length === 1 && job.state === 'done');
  const m1 = memberOf(W, E_TOK), m2 = memberOf(W, E_T2);
  row(yes.ok && yes.outcome === 'allowed' && JSON.stringify(m1.jobs) === JSON.stringify([job.id]) && JSON.stringify(m2.jobs) === JSON.stringify([job.id]) && Number((m1.since || {})[job.id]) > 0 && Number((m2.since || {})[job.id]) > 0 && resolvedOf(W, a.askId).resolvedBy === 'allowed' && (W.got()[0] || {}).v === v1 && job.runs.length === 1,
    'F1 — ONE Allow (one 验证是你: once a card, never once an entry) writes the job into BOTH rows (each with when it was allowed), closes the one card, and the job starts with its values', { yes, m1, m2, runs: job.runs.length });
  const au = jobLines(W).filter((l) => l.includes(`"askId":"${a.askId}"`));
  row(au.filter((l) => l.includes('"op":"ask"')).length === 2 && au.filter((l) => l.includes('"op":"allow"')).length === 2 && formsAbsent(jobLines(W).join('\n'), v1) && formsAbsent(jobLines(W).join('\n'), v2),
    'F1 (f) — the audit keeps its keys: ONE ask and ONE allow line per entry, all with the card\'s ONE askId — no value', au);
  rows[rows.length - 1].push(au);   // the lines it judged — printed green or red (2.369.413 lesson b)
  W.end();
  return rows;
}
async function legOneDeny() {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world('oned');
  W.vault.agentMint('agent:conv-a/tok', { length: 32 }); W.vault.agentMint('agent:conv-a/t2', { length: 32 }); W.release();
  const job = W.jm.jobs.get(W.create({ kind: 'service', restart: 'never', name: 'two-deny', vault: TWO }).job.id);
  await W.door.factsLanded();
  const a = ((cards(W).find((i) => i.action.jobId === job.id)) || {}).action || {};
  const d = W.door.answer(a.askId, { answer: 'deny', by: 'user', person: true });
  await W.door.factsLanded();
  const later = W.create({ name: 'one-of-them', vault: ['T2=vault://agent:conv-a/t2'] });
  await W.door.factsLanded();
  row(d.ok && d.outcome === 'denied' && job.state === 'failed' && job.desiredUp === false && W.grants.rowsFor('vault-job', E_TOK).length === 0 && W.grants.rowsFor('vault-job', E_T2).length === 0 && jobLines(W).filter((l) => l.includes('"op":"deny"') && l.includes(a.askId)).length === 2
    && !!later.error && /less than 10 minutes ago/.test(String(later.error)) && cards(W).length === 0,
    'F1 (c) — ONE Deny covers the card: the job is refused, nothing written, a deny line per entry — and the conversation × EACH entry is quiet ten minutes (a job naming the second alone is refused, no card)', { d, state: job.state, later: later.error });
  W.end();
  return rows;
}
async function legRedraw() {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world('redraw');
  W.vault.agentMint('agent:conv-a/tok', { length: 32 }); W.vault.agentPut('agent:conv-a/t2', SENT('t2')); W.release();
  const job = W.jm.jobs.get(W.create({ name: 'grows', vault: TWO }).job.id);
  await W.door.factsLanded();
  const c1 = cards(W).filter((i) => i.action.jobId === job.id), a1 = (c1[0] || {}).action || {};
  rows.first = { n: c1.length, entries: entriesOf(a1), rev: a1.rev };
  // the second entry is no longer the conversation's own PUT value (deleted, then minted by the hub under the same name): the job now
  // waits for it too — its re-judge (the engine's, after a vault change) meets the open card
  W.vault.secretDrop('agent:conv-a/t2'); W.vault.agentMint('agent:conv-a/t2', { length: 32 });
  W.jm.vaultChanged('vault-approved');
  await W.door.factsLanded();
  const c2 = cards(W).filter((i) => i.action.jobId === job.id), it2 = c2[0] || {}, a2 = it2.action || {}, f2 = it2.facts || {};
  const isNew = (e) => !!e && e.new === true;
  row(c1.length === 1 && JSON.stringify(entriesOf(a1)) === JSON.stringify([E_TOK]) && a1.rev === 1 && c2.length === 1 && a2.askId === a1.askId && a2.rev === 2 && JSON.stringify(entriesOf(a2).sort()) === JSON.stringify([E_TOK, E_T2].sort())
    && (f2.entries || []).filter(isNew).length === 1 && (f2.entries || []).length === 2 && /New on this card since it was last drawn/.test(String(it2.detail)),
    'F1 (e) — a job whose set GROWS while its card is open: the SAME card drawn again (its ask id kept, its revision 2), naming both — what is NEW marked', { first: rows.first, second: { n: c2.length, entries: entriesOf(a2), rev: a2.rev, fresh: (f2.entries || []).filter(isNew).length } });
  const stale = W.door.answer(a1.askId, { answer: 'allow', reauthed: true, by: 'user', person: true, rev: 1 });
  const staleDeny = W.door.answer(a1.askId, { answer: 'deny', by: 'user', person: true, rev: 1 });
  const none = W.door.answer(a1.askId, { answer: 'allow', reauthed: true, by: 'user', person: true, rev: null });   // a press that carries no revision at all
  rows.stale = { stale, staleDeny, none };
  row(!stale.ok && stale.code === 'ask_changed' && !staleDeny.ok && staleDeny.code === 'ask_changed' && !none.ok && none.code === 'ask_changed' && W.grants.rowsFor('vault-job', E_TOK).length === 0 && W.grants.rowsFor('vault-job', E_T2).length === 0 && cards(W).filter((i) => i.action.jobId === job.id).length === 1 && job.state === 'waiting',
    'F1 (e) — a press carrying the EARLIER set (revision 1) — or none — is refused by name (ask_changed), Allow or Deny — NOTHING written, the card open, the job waiting', rows.stale);
  const yes = W.door.answer(a1.askId, { answer: 'allow', reauthed: true, by: 'user', person: true, rev: 2 });
  await W.until(() => W.got().length === 1);
  row(yes.ok && JSON.stringify(memberOf(W, E_TOK).jobs) === JSON.stringify([job.id]) && JSON.stringify(memberOf(W, E_T2).jobs) === JSON.stringify([job.id]) && W.got().length === 1,
    '…and the press of the card as it is NOW (revision 2) approves both and the job starts', { yes });
  W.end();
  return rows;
}
async function legStanding() {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world('stand');
  W.vault.agentMint('agent:conv-a/tok', { length: 32 }); W.vault.agentMint('agent:conv-a/t2', { length: 32 });
  const job = W.jm.jobs.get(W.create({ kind: 'service', restart: 'never', name: 'stands', vault: TWO }).job.id);
  await W.door.factsLanded();
  const a = ((cards(W).find((i) => i.action.jobId === job.id)) || {}).action || {};
  W.door.answer(a.askId, { answer: 'allow', reauthed: true, by: 'user', person: true });
  const up = await W.untilMs(() => W.got().length >= 1 && job.state === 'up', 4000);
  const since2 = Number((memberOf(W, E_T2).since || {})[job.id]);
  const rv = W.door.revoke(E_TOK, job.id, { by: 'user' });   // ONE entry's own ✕ (its Vault row): that entry only, the job stopped
  await W.untilMs(() => (job.state !== 'up' && job.state !== 'starting') || job.desiredUp !== false, 3000);   // the stop landed (or none is meant)
  const kept = JSON.stringify(memberOf(W, E_T2).jobs) === JSON.stringify([job.id]);
  W.jm.start(job);
  await W.door.factsLanded();
  const it = cards(W).find((i) => i.action.jobId === job.id) || {}, f = it.facts || {};
  row(up.ok && rv.ok && rv.stopped === true && kept && W.grants.rowsFor('vault-job', E_TOK).length === 0 && JSON.stringify(entriesOf(it.action || {})) === JSON.stringify([E_TOK]) && Array.isArray(f.standing) && f.standing.length === 1 && f.standing[0].since === since2 && since2 > 0
    && /Already allowed for this job \(they stand\): «.+» \(\d{4}-\d\d-\d\d \d\d:\d\d UTC\)/.test(String(it.detail)),
    'F1 (a, d) — ONE entry\'s own ✕ takes back THAT entry only (the other row keeps the job) and stops it; its next card names the entry it waits for and SAYS the other stands — which, since when', { up, rv, kept, entries: entriesOf(it.action || {}), standing: f.standing });
  W.release(); W.end();
  return rows;
}
async function legFullRow(doorSrc = null) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world(doorSrc ? 'fullm' : 'full', { doorSrc });
  W.vault.agentMint('agent:conv-a/tok', { length: 32 }); W.vault.agentMint('agent:conv-a/t2', { length: 32 }); W.release();
  const job = W.jm.jobs.get(W.create({ name: 'all-or-nothing', vault: TWO }).job.id);
  await W.door.factsLanded();
  const a = ((cards(W).find((i) => i.action.jobId === job.id)) || {}).action || {};
  // (b) A FULL ROW: the second entry's row already names 64 jobs of this conversation (records that exist — the writer prunes the gone)
  const fakes = Array.from({ length: VJ.ASKS_MAX }, (_, i) => `jb-${(0x20000000 + i).toString(16)}`);
  W.grants.set('vault-job', E_T2, { to: [{ kind: 'conversation', key: 'conv-a', jobs: fakes }] }, 'test');
  for (const id of fakes) W.jm.jobs.set(id, { id, kind: 'task', state: 'done' });
  const full = W.door.answer(a.askId, { answer: 'allow', reauthed: true, by: 'user', person: true });
  for (const id of fakes) W.jm.jobs.delete(id);
  rows.full = { ok: full.ok, code: full.code, words: full.words, tok: W.grants.rowsFor('vault-job', E_TOK).length };
  W.grants.remove('vault-job', E_T2, 'test');
  // A WRITE THAT FAILS on the second row: the first one, written by this press, is taken back
  const g = W.grants, real = g.set; let n = 0;
  g.set = function (...x) { return x[0] === 'vault-job' && ++n === 2 ? { ok: false, code: 'not_written', error: 'planted: the second row\'s write failed' } : real.apply(this, x); };
  const half = W.door.answer(a.askId, { answer: 'allow', reauthed: true, by: 'user', person: true });
  g.set = real;
  rows.half = { ok: half.ok, code: half.code, tok: W.grants.rowsFor('vault-job', E_TOK).length, t2: W.grants.rowsFor('vault-job', E_T2).length };
  if (doorSrc) { W.end(); return rows; }
  row(!full.ok && full.code === 'too_many_jobs' && /«t2»|t2/.test(String(full.words)) && /take one back \(✕ on its row in the Vault window\), then press Allow again/.test(String(full.words)) && rows.full.tok === 0 && cards(W).filter((i) => i.action.jobId === job.id).length >= 1,
    'F1 (b) — ALL OR NOTHING: a full row refuses the press NAMING its entry and what to do in the same sentence (the recipe) — and the other entry\'s row is NOT written', rows.full);
  row(!half.ok && rows.half.tok === 0 && rows.half.t2 === 0 && job.state === 'waiting' && cards(W).filter((i) => i.action.jobId === job.id).length === 1,
    'F1 (b) — a write that fails on the second row: the first row this press wrote is TAKEN BACK — nothing stays half-approved; the card open, the job waiting', rows.half);
  W.end();
  return rows;
}
async function legTakeAll() {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world('takeall');
  W.vault.agentMint('agent:conv-a/tok', { length: 32 }); W.vault.agentMint('agent:conv-a/t2', { length: 32 });
  const job = W.jm.jobs.get(W.create({ kind: 'service', restart: 'never', name: 'take-all', vault: TWO }).job.id);
  await W.door.factsLanded();
  const a = ((cards(W).find((i) => i.action.jobId === job.id)) || {}).action || {};
  W.door.answer(a.askId, { answer: 'allow', reauthed: true, by: 'user', person: true });
  const up = await W.untilMs(() => W.got().length >= 1 && job.state === 'up', 4000);
  const t0 = W.told.length;
  const rv = W.door.revokeAll(job.id, { by: 'user' });
  await W.untilMs(() => (job.state !== 'up' && job.state !== 'starting') || job.desiredUp !== false, 3000);   // the stop landed (or none is meant)
  const notes = W.told.slice(t0).filter((x) => /took back its vault entry/.test(x.text));
  row(up.ok && rv.ok && rv.entries === 2 && rv.stopped === true && W.grants.rowsFor('vault-job', E_TOK).length === 0 && W.grants.rowsFor('vault-job', E_T2).length === 0 && job.desiredUp === false && notes.length === 1 && jobLines(W).filter((l) => l.includes('"op":"revoke"') && l.includes(job.id)).length === 2,
    'F1 (d) — THE JOB CARD\'S ✕ takes back ALL of the job\'s approvals (both rows), ONE stop, ONE notice, a revoke line per entry', { up, rv, notes: notes.length });
  const again = W.door.revokeAll(job.id, { by: 'user' });
  row(!again.ok && again.code === 'not_approved', '…and again ⇒ not_approved, nothing written', again);
  W.release(); W.end();
  return rows;
}
// 主开发 r2666 (1): ANY change of the set draws the card again — a SHRINK («B gone») and a SWAP («C instead of B», a growth then a
// shrink) — and a press of an earlier revision writes nothing. RED: the card drawn again on a growth only (the early return when
// nothing is new)
const E_T3 = 'secrets:agent:conv-a/t3#secret';
async function legSetMoves(doorSrc = null) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world(doorSrc ? 'setmvm' : 'setmv', { doorSrc });
  W.vault.agentMint('agent:conv-a/tok', { length: 32 }); W.vault.agentMint('agent:conv-a/t2', { length: 32 }); W.vault.agentPut('agent:conv-a/t3', SENT('t3')); W.release();
  const cardOf = (job) => (cards(W).find((i) => i.action.jobId === job.id) || {});
  const judge = async () => { W.jm.vaultChanged('vault-approved'); await W.door.factsLanded(); };
  // «B gone»: the second entry becomes the conversation's own PUT value — the job no longer waits for it
  const gone = W.jm.jobs.get(W.create({ name: 'b-gone', vault: TWO }).job.id);
  await W.door.factsLanded();
  const g1 = cardOf(gone).action || {};
  W.vault.secretDrop('agent:conv-a/t2'); W.vault.agentPut('agent:conv-a/t2', SENT('t2p'));
  await judge();
  const g2 = cardOf(gone).action || {};
  rows.gone = { first: entriesOf(g1), rev1: g1.rev, now: entriesOf(g2), rev: g2.rev };
  const goneStale = W.door.answer(g1.askId, { answer: 'allow', reauthed: true, by: 'user', person: true, rev: 1 });
  rows.gone.staleWrote = W.grants.rowsFor('vault-job', E_TOK).length + W.grants.rowsFor('vault-job', E_T2).length;
  W.jm.stop(gone); await W.door.factsLanded();
  // «C instead of B»: a third entry becomes hub-minted (the job waits for it too), then the second becomes the conversation's own
  W.vault.secretDrop('agent:conv-a/t2'); W.vault.agentMint('agent:conv-a/t2', { length: 32 });
  const swap = W.jm.jobs.get(W.create({ name: 'c-for-b', vault: [...TWO, 'T3=vault://agent:conv-a/t3'] }).job.id);
  await W.door.factsLanded();
  const s1 = cardOf(swap).action || {};
  W.vault.secretDrop('agent:conv-a/t3'); W.vault.agentMint('agent:conv-a/t3', { length: 32 });
  await judge();
  const s2 = cardOf(swap).action || {};
  W.vault.secretDrop('agent:conv-a/t2'); W.vault.agentPut('agent:conv-a/t2', SENT('t2q'));
  await judge();
  const s3 = cardOf(swap).action || {}, f3 = cardOf(swap).facts || {};
  rows.swap = { first: entriesOf(s1), second: entriesOf(s2), now: entriesOf(s3), revs: [s1.rev, s2.rev, s3.rev] };
  const swapStale = W.door.answer(s1.askId, { answer: 'allow', reauthed: true, by: 'user', person: true, rev: s2.rev });
  rows.swap.staleWrote = W.grants.rowsFor('vault-job', E_T2).length;
  if (doorSrc) { W.end(); return rows; }
  row(JSON.stringify(entriesOf(g1).sort()) === JSON.stringify([E_TOK, E_T2].sort()) && g2.askId === g1.askId && g2.rev === 2 && JSON.stringify(entriesOf(g2)) === JSON.stringify([E_TOK]) && !goneStale.ok && goneStale.code === 'ask_changed' && rows.gone.staleWrote === 0,
    'r2666 (1) «B GONE» — the job no longer waits for an entry its card names: the SAME card drawn again without it (rev 2), and a press of the earlier set writes NOTHING', rows.gone);
  row(JSON.stringify(entriesOf(s1).sort()) === JSON.stringify([E_TOK, E_T2].sort()) && JSON.stringify(entriesOf(s3).sort()) === JSON.stringify([E_TOK, E_T3].sort()) && s3.askId === s1.askId && s3.rev === 3 && (f3.entries || []).length === 2
    && !swapStale.ok && swapStale.code === 'ask_changed' && rows.swap.staleWrote === 0,
    'r2666 (1) «C INSTEAD OF B» — the set grows (C) then shrinks (B leaves): the same card drawn again each time (rev 3) naming exactly C and A, and a press of an earlier revision writes nothing', rows.swap);
  W.end();
  return rows;
}
// 主开发 r2666 (2): THE JOB CARD'S TAKE-BACK takes back EVERY vault-job row that names the job — an approval of an entry the job no
// longer declares never outlives it. RED: the take-back of the declared entries only
async function legTakeAllRows(doorSrc = null) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world(doorSrc ? 'tkrowm' : 'tkrow', { doorSrc });
  W.vault.agentMint('agent:conv-a/tok', { length: 32 }); W.vault.agentMint('agent:conv-a/t2', { length: 32 });
  const job = W.jm.jobs.get(W.create({ kind: 'service', restart: 'never', name: 'drops-one', vault: TWO }).job.id);
  await W.door.factsLanded();
  const a = ((cards(W).find((i) => i.action.jobId === job.id)) || {}).action || {};
  W.door.answer(a.askId, { answer: 'allow', reauthed: true, by: 'user', person: true });
  const up = await W.untilMs(() => W.got().length >= 1 && job.state === 'up', 4000);
  W.grants.set('vault-job', E_T3, { to: [{ kind: 'conversation', key: 'conv-a', jobs: [job.id] }] }, 'test');   // an approval of an entry the job no longer declares (its third, dropped)
  const rv = W.door.revokeAll(job.id, { by: 'user' });
  rows.left = [E_TOK, E_T2, E_T3].filter((e) => W.grants.rowsFor('vault-job', e).length > 0);
  if (doorSrc) { W.release(); W.end(); return rows; }
  row(up.ok && rv.ok && rv.entries === 3 && rows.left.length === 0, 'r2666 (2) — the job card\'s ✕ takes back EVERY vault-job row that names the job — the one of an entry it no longer declares too', { up, rv, left: rows.left });
  W.release(); W.end();
  return rows;
}
// ── ⑨e THE WAIT'S AUDIT LINE (stage L3's F3; design D9: «批准、拒绝、撤销、等待各记一条 vault-job 审计行») — once a wait, never a sweep ─
async function legWaitLine({ jobs = null, doorSrc = null } = {}) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world(jobs || doorSrc ? 'wlinem' : 'wline', { jobs, doorSrc });
  W.put(SENT('wl')); W.release(); W.vault.lock('door');
  const job = W.jm.jobs.get(W.create({ kind: 'service', restart: 'never', name: 'waits' }).job.id);
  for (let i = 0; i < 3; i++) { W.jm.vaultChanged('vault-approved'); W.jm.start(job); try { await W.jm._sweep(); } catch { } }
  const lines = () => jobLines(W).filter((l) => l.includes('"op":"wait"') && l.includes(job.id));
  rows.first = lines().length;
  await W.vault.unlock(PW);
  const ran = await W.untilMs(() => W.got().length === 1, 4000);
  W.jm.stop(job); await W.untilMs(() => !['up', 'starting'].includes(job.state), 4000);
  W.vault.lock('door'); W.jm.start(job); W.jm.start(job);
  rows.second = lines().length;
  if (jobs || doorSrc) { W.end(); return rows; }
  const l0 = lines()[0] || '';
  row(job.state === 'waiting' && job.waitFor === 'vault' && ran.ok && rows.first === 1 && /"waitFor":"vault"/.test(l0) && l0.includes('vault://agent:conv-a/tok') && rows.second === 2,
    'F3 — a start that WAITS for a locked vault writes ONE vault-job `wait` line (the job, its references, waitFor vault) — three re-judges, starts and sweeps while it waits write none; the next wait (after a run) its own one', { first: rows.first, second: rows.second, line: l0 });
  rows[rows.length - 1].push(lines());   // the lines it judged — printed green or red (2.369.413 lesson b)
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
// B-7e49 (the fast tier's time): a take-back's stop is waited for while its INTENT says one comes (desiredUp false), bounded as
// before; a copy that never stops its job (the controls) ends the wait at once — it waited out the program's own exit (~3 s), a
// time its verdict (desiredUp: the stop's intent, no clock) never read
const stopLanded = (W, job) => W.untilMs(() => (job.state !== 'up' && job.state !== 'starting') || job.desiredUp !== false, 3000);
async function legRevoke(doorSrc = null) {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const W = await world('revk', { doorSrc });
  W.vault.agentMint('agent:conv-a/tok', { length: 32 });
  const { job, a, ok: up } = await approvedService(W, 'revk');
  const t0 = W.told.length;
  const rv = W.door.revoke(a.entry, job.id, { by: 'user' });
  await stopLanded(W, job);
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
  await stopLanded(W, job);
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
  await stopLanded(W, job);
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
  const stopped = await stopLanded(W, job);
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
  let sync = 0, answered = 0, begin = null;
  const began = new Promise((r) => { begin = r; });   // the FIRST stalled read has begun (its deadline is met — it reads)
  const fake = { uid: 0, mode: 0o40755, isFile: () => true };
  const later = (v) => { begin(); return new Promise((r) => setTimeout(() => { answered++; r(v); }, STALL_MS)); };   // `answered`: how many stalled reads have answered (an event, never a clock)
  const hold = () => { sync++; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, HOLD_MS); };
  return { fsp: { stat: () => later(fake), realpath: (p) => later(p), statSync: () => { hold(); return fake; }, realpathSync: (p) => { hold(); return p; } }, syncCalls: () => sync, answered: () => answered, began };
};
async function legFactsOffLoop(doorSrc = null, st = stallFs()) {
  const D = doorOf(doorSrc);
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
  // r3408 (placed): this leg judges the wrapper GRAMMAR, never the read's bound (legFactsCard's): on a two-core hosted runner, inside this
  // group of ~40 legs that spawn jobs, the first cold read of node's binary missed the card's 2 s and the row said «unread» — the grammar's
  // reads get a bound no load reaches
  const GRAMMAR_BOUND = { ms: 60e3 };
  for (const pre of understood) { const p = await D.programFacts({ argv: [...pre, process.execPath, script, '--poll', '60'], cwd: dir }, GRAMMAR_BOUND); got.push({ pre: pre.join(' ') || '(none)', program: p.program.path, script: p.script && p.script.path, command: p.command, unread: !!p.program.unread }); }
  for (const pre of notUnderstood) { const p = await D.programFacts({ argv: [...pre, process.execPath, script], cwd: dir }, GRAMMAR_BOUND); wrap.push({ pre: pre.join(' '), program: p.program.path, want: onPath(pre[0]), script: p.script && p.script.path, command: p.command, unparsed: p.program.unparsed === true, writable: p.program.writable === true }); }
  const ends = [];
  for (const [pre, want] of operandEnds) { const p = await D.programFacts({ argv: [...pre, process.execPath, script], cwd: dir }, GRAMMAR_BOUND); ends.push({ pre: pre.join(' '), program: p.program.path, want }); }
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
// stage L3's word findings (主开发 r2570): every refusal and waiting sentence of the road names the vault (F4); the card says what the
// program writes to its own files is not protected (F12 — design §4 T6, «卡上写»); the manual promises no more than the design (F5)
// and says who else starts a job with its values (F8)
async function legWords() {
  const rows = [], row = (c, n, e) => rows.push([c, n, e]);
  const ROAD = ['wait_vault', 'wait_approval', 'vault_denied', 'ask_quiet', 'too_many_asks', 'too_many_asks_hub', 'ask_unfiled', 'ask_closed', 'ask_changed', 'no_owner_conversation'];
  const silent = ROAD.filter((c) => !/vault/i.test(String(VJ.WORDS[c] || '')));
  row(silent.length === 0 && /vault/i.test(VJ.fullRowWords('k1')), 'F4 — every refusal and waiting sentence of the road names the vault (the asks\' caps, the unfiled card, the changed card, the full row)', silent);
  const W = await world('words');
  W.vault.agentMint('agent:conv-a/tok', { length: 32 }); W.release();
  const job = W.jm.jobs.get(W.create({ name: 'words' }).job.id);
  await W.door.factsLanded();
  const it = cards(W).find((i) => i.action.jobId === job.id) || {};
  const FA = R('src/foryou-actions.js');   // PURE, CJS (the card model a client draws)
  const card = FA.runCardOf(it, { t: (x, p) => (p ? x.replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? String(p[k]) : m)) : x) });
  const hosts = ((card && card.rows) || []).find((r) => r.key === 'hosts');
  const said = (hosts && hosts.lines.map((l) => l.map((x) => x.text || '').join('')).join(' ')) || '';
  row(/What the program writes to its own files, config, databases and caches is not protected/.test(said) && /What the program writes to its own files, config, databases and caches is not protected\./.test(String(it.detail)),
    'F12 — the approval card SAYS what stays open (design §4 T6, the owner\'s condition): what the program writes to its own files, config, databases and caches is not protected — on the drawn card and in its prose', said);
  W.end();
  const manual = fs.readFileSync(path.join(REPO, 'docs/agent/vault-manual.md'), 'utf8');
  const never = manual.split('\n').find((l) => l.includes('**Where it never is:**')) || '';
  const part = manual.slice(manual.indexOf('## A Background Work job that needs a secret'), manual.indexOf('\n## ', manual.indexOf('## A Background Work job that needs a secret') + 4));
  row(never !== '' && !never.includes('data/') && /a sieve, not a wall/.test(never) && /\*\*Who else can start it:\*\* a conversation that holds CONTROL of the job/.test(part) && /hands the approved values to the program/.test(part),
    'F5 + F8 — the manual promises no more than the design (the job\'s log lives in the data folder, its masker a sieve) and says who else starts a job with its values (a conversation that holds control)', { never: never.slice(0, 160) });
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
  // r4225 (a sighting beside 175 suites: starts 0, the tally empty): the rows read the USE LINE (the vault audit, written when the
  // hub READS the wrapper's ack on fd 3); the wait above ends on the program's own file, which under load stands on disk before
  // the hub's loop has read that ack — the leg waits for the line itself (a fact, bounded), the rows' law unchanged
  const tallied = await W.untilMs(() => ((((W.vault.useCounts()['agent:conv-a/tok'] || {}).jobs) || {})[job.id] || 0) >= 1, 4000);
  const f1 = W.door.rowFacts({ id: a.entry }) || [];
  const u1 = W.door.usesOf(job), lbl = W.jm.labelOf(job);
  rows.starts = (f1[0] || {}).starts;
  if (doorSrc) { W.release(); W.end(); return rows; }
  row(up && f1.length === 1 && f1[0].id === job.id && f1[0].name === lbl && f1[0].kind === 'service' && f1[0].state === 'running' && f1[0].starts === 1,
    'the Vault row\'s job facts (door rowFacts → the contents list\'s `jobs`): the approved job, its BELTED name (labelOf), a state CODE (running) and its starts counted from the audit (1) — never a value',{ facts: f1, tallied });
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
    const chips = box.children.filter((c) => /\bvw-job-chip\b/.test(c.className)), words = chips.map((c) => c.children[0].textContent), xs = chips.map((c) => c.children[1]);
    const note = box.children.find((c) => /\bvw-job-note\b/.test(c.className));
    row(!!note && note.textContent === 'A running job keeps the old value until its next start — after you change this key, restart the job to hand it the new one.' && box.children.length === chips.length + 1 && VJR.jobExtras({ id: 'secrets:secret:k2#secret', jobs: [] }, { refresh: noop }).box.children.length === 0,
      'stage L3\'s F2 (design D8): the row of an approved job SAYS a running job keeps the old value until its next start — once, under its chips; a row with no job says nothing', note && note.textContent);
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
  // approved on one entry (its row written — stage L3's F1: the job's ONE card names both, so one Allow covers both; the scene's half
  // approval is the row's own), still waiting on the other: its one card (rev 1) still open
  const first = { entry: 'secrets:agent:conv-a/tok#secret' };
  W.grants.set('vault-job', first.entry, { to: [{ kind: 'conversation', key: 'conv-a', jobs: [job.id] }] }, 'test');
  await W.door.factsLanded();
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
// F11's control: THE RELEASE'S FLUSH AT THE MAIN'S EXIT EVENT — the masker ended there, a fresh one takes what the drain brings
const EXIT_FLUSH = (() => { try { return swap(WRAP_SRC, '  // protocol 3: the value masker does NOT end at the exit event', '  if (VAL) { const f = flushMask(); if (f.length) writeLog(f); }\n  // protocol 3: the value masker does NOT end at the exit event'); } catch { return null; } })();
// F10's control: THE RELEASE'S QUIET FLUSH — every 400 ms quiet ends the masker (its tail passed out) and a fresh one takes the rest
const QUIET_FLUSH = (() => { try { return swap(WRAP_SRC, '  if (vmask.over) { const f = flushMask(); if (f.length) writeLog(f); return; }', '  if (true) { const f = flushMask(); if (f.length) writeLog(f); return; }'); } catch { return null; } })();
// r2600's control: THE QUIET THAT RELEASES NOTHING (942cb0908's form — the settle cut): the short line and the marker stay held
// round wtlm3ig4w's controls: 7e1674a83's settle (a copy of src/vault-scrubber.js) · the until scan without its carry (a copy of jobs.js)
// the masker lives in src/vault-scrubber.js (0d378fd32): a patched scrubber goes in with a plain COPY of vault-run.js beside it — a
// symlinked vault-run.js resolves to the repo's file, and its require would load the repo's own scrubber
const VR_SRC = fs.readFileSync(path.join(REPO, 'src/vault-run.js'), 'utf8'), VS_SRC = fs.readFileSync(path.join(REPO, 'src/vault-scrubber.js'), 'utf8');
const scrubMut = (from, to) => ({ 'vault-scrubber.js': swap(VS_SRC, from, to), 'vault-run.js': VR_SRC });
const SETTLE_OLD = (() => { try { return scrubMut("    const lastLine = (x) => { const ln = x.lastIndexOf('\\n') + 1; return ln + cutTailStart(x.slice(ln), { unfinished: true }); };", '    const lastLine = (x) => cutTailStart(x);'); } catch { return null; } })();
const UNTIL_NOCARRY = (() => { try { return swap(JOBS_SRC, "      const lines = ((job._untilCarry || '') + buf.toString('utf-8')).split('\\n');", "      const lines = buf.toString('utf-8').split('\\n');"); } catch { return null; } })();
// r2773 (1)'s control: a settle that DROPS the run it keeps (its kept tails forgotten) — a copy of src/vault-run.js
// round w3aprsv38 (c): each settle cure's OWN red over ①e's three lines — MUST ONE cut alone (the last line still searched alone,
// every view's first trigger an end: a and b) · MUST TWO cut alone (the whole held text searched, the unfinished-piece rule kept: c) ·
// the MUST: the fire's reset without the clear
const SETTLE_NOFLAG = (() => { try { return scrubMut("    const lastLine = (x) => { const ln = x.lastIndexOf('\\n') + 1; return ln + cutTailStart(x.slice(ln), { unfinished: true }); };", "    const lastLine = (x) => { const ln = x.lastIndexOf('\\n') + 1; return ln + cutTailStart(x.slice(ln)); };"); } catch { return null; } })();
const SETTLE_NOLINE = (() => { try { return scrubMut("    const lastLine = (x) => { const ln = x.lastIndexOf('\\n') + 1; return ln + cutTailStart(x.slice(ln), { unfinished: true }); };", '    const lastLine = (x) => cutTailStart(x, { unfinished: true });'); } catch { return null; } })();
const CARRY_NOEND = (() => { try { return swap(JOBS_SRC, "\n    delete job._untilCarry;   // THE CARRY IS ITS RUN'S", '\n    void 0;   // (the control: the end without the carry\'s clear) —'); } catch { return null; } })();
const ROAD_FAILMASK = (() => { try { return scrubMut("      const t = String(chunk == null ? '' : chunk);\n", "      const t = String(chunk == null ? '' : chunk);\n      if (t.includes('MASK-FAILS-HERE')) throw new Error('a placed failure (the leg\\'s copy, r4321)');\n"); } catch { return null; } })();   // r4321 road (c): the masker fails on one chunk
const SETTLE_DROPS = (() => { try { return scrubMut('    held = kept;   // the uncertain tails stay held — the masker lives on', '    held = [];   // (the control: the kept run dropped)'); } catch { return null; } })();
const QUIET_NONE = (() => { try { return swap(WRAP_SRC, '  try { o = vmask.settle(); } catch { o = null; }', '  o = null;'); } catch { return null; } })();
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
const MUT_DEDUPE = (() => { try { return swap(swap(swap(DOOR_SRC, 'const fresh = need.filter((r) => !(mineOpen && mineOpen.entries.includes(r.id)));', 'const fresh = need;'), '    if (!need.length || sameSet) return { ok: true, filed: 0 };', '    if (!need.length) return { ok: true, filed: 0 };'), '    const open = [...asks.values()].find((q) => q.jobId === jobId) || null;\n', '    const open = null;\n'); } catch { return null; } })();   // every open-card check cut (the ask\'s two — r2666's same-set return with them — and the landing\'s)
// F1's and F3's controls: the half-written press not taken back · the door that writes no wait line · a wait line every judge
const MUT_HALF = dmut('          for (const d of done.reverse()) {', '          for (const d of [].reverse()) {');
const MUT_NOWAIT = dmut("    if (why !== 'vault') return;\n    const entries", "    return;\n    const entries");
const MUT_EVERYWAIT = (() => { try { return swap(JOBS_SRC, "if (!again && typeof door.waited === 'function') door.waited(job, why);", "if (typeof door.waited === 'function') door.waited(job, why);"); } catch { return null; } })();
// r2666's controls: a card drawn again on a growth only · the take-back of the declared entries only
const MUT_GROWONLY = dmut('    if (!need.length || sameSet) return { ok: true, filed: 0 };', '    if (!need.length || !fresh.length) return { ok: true, filed: 0 };');
const MUT_DECLARED = dmut('const ids = [...new Set([...named0, ...VJ.refsOf(job)', 'const ids = [...new Set([...VJ.refsOf(job)');
const MUT_DENY = dmut("try { jm.vaultRefused(q.jobId, named('vault_denied', { key: keysOf(q) })); }", 'try { void q; }');
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
// ⑫'s two timed reads start ALONE, each until its first stalled read has begun: the legs after them set up synchronously (a world's
// src copies) and held the loop past BOUND_MS before the no-bound copy read anything — its deadline gone first (red at 8d05e0a7c)
const stOff = stallFs(), stNoBound = stallFs();
const offRuns = [legFactsOffLoop(null, stOff), MUT_NOBOUND ? legFactsOffLoop(MUT_NOBOUND, stNoBound) : null];
let tBegan = null;
await Promise.race([Promise.all([stOff.began, MUT_NOBOUND ? stNoBound.began : null]), new Promise((r) => { tBegan = setTimeout(r, 3000); })]);
clearTimeout(tBegan);
// ⑫b's card is judged AT ITS BOUND (never the stall's end) — it runs to its end beside the two timed reads, before the other legs set
// up: the same legs' synchronous setups held the loop past the bound and its stalled read answered first (red in UTC at 35c84a98a)
const factsCardEarly = await legFactsCard();
const [offLoop, offNoBound, offSync, factsCard, wrapSkip, closedElse, closedMut, restartRevoke, smalls, words, setMoves, setMovesMut, takeRows, takeRowsMut, oneCard, oneDeny, redraw, standing, fullRow, fullHalfMut, takeAll, waitLine, noWaitMut, everyWaitMut, pieces, piecesMut, childHalf, childHalfMut, quietLine, quietNoneMut, settleLines, settleOldMut, noCarryMut, pieces64, pieces64Mut, bytesRows, bytesMut, bytesOldMut, noFlagMut, noLineMut, carryRows, carryMut, handRows, handMut, roadsRows, roadsFailRows] = await Promise.all([...offRuns, MUT_SYNCREAD ? legFactsOffLoop(MUT_SYNCREAD) : null,
  factsCardEarly, legWrapperSkip(), legClosedElsewhere(), MUT_ONSTATUS ? legClosedElsewhere(MUT_ONSTATUS) : {}, legRestartRevoke(), legSmalls(),
  legWords(), legSetMoves(), MUT_GROWONLY ? legSetMoves(MUT_GROWONLY) : {}, legTakeAllRows(), MUT_DECLARED ? legTakeAllRows(MUT_DECLARED) : {}, legOneCard(), legOneDeny(), legRedraw(), legStanding(), legFullRow(), MUT_HALF ? legFullRow(MUT_HALF) : {}, legTakeAll(), legWaitLine(), MUT_NOWAIT ? legWaitLine({ doorSrc: MUT_NOWAIT }) : {}, MUT_EVERYWAIT ? legWaitLine({ jobs: MUT_EVERYWAIT }) : {},
  legPieces(), QUIET_FLUSH ? legPieces(QUIET_FLUSH) : {}, legChildHalf(), EXIT_FLUSH ? legChildHalf(EXIT_FLUSH) : {},
  legQuietLine(), QUIET_NONE ? legQuietLine(QUIET_NONE) : {},
  legSettleLines(), SETTLE_OLD ? legSettleLines({ srcMut: SETTLE_OLD }) : {}, UNTIL_NOCARRY ? legSettleLines({ jobs: UNTIL_NOCARRY }) : {}, legPiecesEncoded(), QUIET_FLUSH ? legPiecesEncoded(QUIET_FLUSH) : {},
  legBytes(), SETTLE_DROPS ? legBytes({ srcMut: SETTLE_DROPS }) : {}, SETTLE_OLD ? legBytes({ srcMut: SETTLE_OLD }) : {},
  SETTLE_NOFLAG ? legSettleLines({ srcMut: SETTLE_NOFLAG }) : {}, SETTLE_NOLINE ? legSettleLines({ srcMut: SETTLE_NOLINE }) : {}, legCronCarry(), CARRY_NOEND ? legCronCarry({ jobs: CARRY_NOEND }) : {}, legHandCarry(), CARRY_NOEND ? legHandCarry({ jobs: CARRY_NOEND }) : {}, legOwnRoads(), ROAD_FAILMASK ? legOwnRoads({ failMask: ROAD_FAILMASK }) : [['__nocopy__']]]);
const MUT_STARTS = dmut('return n + (k === j || (c && c.cronParent === j) ? Number(v) || 0 : 0);', 'return n;');   // ⑪'s control: the starts never counted
const [cronRevoke, rmNoRefile, archivePrune] = await Promise.all([legCronRevoke(), legRmNoRefile(), legArchivePrune()]);   // ⑩c
const [surfaces, chips, surfacesMut] = await Promise.all([legSurfaces(), legChips(), MUT_STARTS ? legSurfaces(MUT_STARTS) : {}]);   // ⑪ (lane vault-job-approval L2)
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };
const print = (title, rows) => { console.log(title); for (const [c, n, e, judged] of rows) { ok(verdictOf(c), n, e); if (Array.isArray(judged)) { console.log(`      judged (${judged.length} line(s)):`); for (const l of judged.slice(0, 12)) console.log('        ' + String(l).slice(0, 240)); } } };   // a leg that judges journal / audit lines prints them
print('① HANDED, NEVER LEFT LYING', handed);
print('①b A VALUE IN TWO PIECES WITH A QUIET BETWEEN THEM (F10 of stage L3, 主开发 r2524)', pieces);
ok(!!QUIET_FLUSH && piecesMut.quietHalf === true && piecesMut.whole === true, 'CONTROL — the release\'s quiet flush (every 400 ms quiet ends the masker): the first piece is written at the quiet and the value lands WHOLE in the log — RED on the copy', QUIET_FLUSH ? { quietHalf: piecesMut.quietHalf, whole: piecesMut.whole } : 'the copy could not be built (its anchor is missing)');
print('①c A VALUE WHOSE SECOND HALF THE JOB\'S CHILD WRITES AFTER THE MAIN ENDED (F11 of stage L3, 主开发 r2552)', childHalf);
ok(!!EXIT_FLUSH && childHalfMut.whole === true, 'CONTROL — the release\'s flush at the MAIN\'s exit event (the masker ended there, a fresh one for the drain): the value lands WHOLE in the log — RED on the copy', EXIT_FLUSH ? { whole: childHalfMut.whole } : 'the copy could not be built (its anchor is missing)');
print('①d A QUIET RELEASES TEXT (round wi8mtvm6c\'s MUST, 主开发 r2600) — the settle turn', quietLine);
ok(!!QUIET_NONE && quietNoneMut.line === false && quietNoneMut.hit === false, 'CONTROL — the quiet that releases nothing (the settle cut, 942cb0908\'s form): the short line is NOT in the log and the until-marker never fires — RED on the copy', QUIET_NONE ? { line: quietNoneMut.line, hit: quietNoneMut.hit } : 'the copy could not be built (its anchor is missing)');
print('①e A COMPLETED LINE IS CERTAIN, A VIEW PIECE UNCERTAIN ONLY UNFINISHED (round wtlm3ig4w, 主开发 r2600)', [...settleLines, ...pieces64]);
ok(!!SETTLE_OLD && settleOldMut.a === false && settleOldMut.b === false && settleOldMut.c === false, 'CONTROL — 7e1674a83\'s settle (the whole held text read, every view\'s first trigger an end): the coloured line, the ampersand line and the line ending in the value\'s first character are NOT whole in the log in time — RED on the copy', SETTLE_OLD ? { a: settleOldMut.a, b: settleOldMut.b, c: settleOldMut.c } : 'the copy could not be built (its anchor is missing)');
ok(!!UNTIL_NOCARRY && noCarryMut.half === true && noCarryMut.d === false, 'CONTROL — the until scan without its carry: a marker in two pieces of one line never fires — RED on the copy', UNTIL_NOCARRY ? { half: noCarryMut.half, d: noCarryMut.d } : 'the copy could not be built (its anchor is missing)');
ok(!!QUIET_FLUSH && pieces64Mut.masked === false, 'CONTROL — the release\'s quiet flush: the base64 spelling split by the quiet lands whole — RED on the copy', QUIET_FLUSH ? { masked: pieces64Mut.masked } : 'the copy could not be built');
print('①f NO BYTE OF THE JOB\'S OWN WORDS IS LOST (主开发 r2773 (1))', bytesRows);
ok(!!SETTLE_DROPS && !!bytesMut.scenes && verdictOf(Object.values(bytesMut.scenes).some((x) => !x.words || !x.bytes)), 'CONTROL — a settle that DROPS the run it keeps: a job\'s own words go missing from its log — RED on the copy', SETTLE_DROPS ? bytesMut.scenes : 'the copy could not be built (its anchor is missing)');
// r3732 / r3735 law 3: THE WRAPPER's OWN LINES never stand inside a line of the job, never between the pieces of a value the masker holds.
// PLACED, never load: a copy of the REAL wrapper whose escapee scan starts past its 250 ms (the cut said at once), and scenes a, b whose job
// ends right after its last word (the drain's scan meets a masker that still holds). The job's words whole and in order (judged as ①f
// does: the wrapper's lines apart), each wrapper line on a line of its own, the cut's notice AFTER the job's words. RED: today's direct write
const OWN_CUT = "    if (Date.now() - t0 > 250) { out.cut = true; break; }";
const OWN_ROAD = "function sayOwn(text) { ownQ.push(String(text).replace(/^\\n+|\\n+$/g, '')); drainOwn(); }";
const WRAP_CUT = WRAP_SRC.split(OWN_CUT).length === 2 ? WRAP_SRC.split(OWN_CUT).join("    if (true) { out.cut = true; break; }   /* PLACED: the scan's window passed at once */") : null;
const WRAP_DIRECT = WRAP_CUT && WRAP_CUT.split(OWN_ROAD).length === 2 ? WRAP_CUT.split(OWN_ROAD).join("function sayOwn(text) { try { fs.writeSync(logOpen(), Buffer.from(String(text).replace(/^\\n+|\\n+$/g, '') + '\\n')); } catch { } }   /* MUTANT: today's direct write */") : null;
async function legOwnLines(wrap, tag) {
  const W = await world(tag, { wrap }), S = SENT(tag), h = Math.floor(S.length / 2);
  W.put(S);
  const want = { a: [[1, 'a1 '], [2, ' a2\n']], b: [[2, 'b1 '], [1, ' b2\n']] };
  // r3942 (5): ac / bc — scenes a and b whose LAST piece a child of the job's group writes at the drain's signal: after the cut's notice, placed
  const scenes = { a: { PIPES: 'a', PIPES_END_NOW: '1' }, b: { PIPES: 'b', PIPES_END_NOW: '1' }, ac: { PIPES: 'a', PIPES_LAST_CHILD: '1' }, bc: { PIPES: 'b', PIPES_LAST_CHILD: '1' } };
  const jobs = Object.fromEntries(Object.entries(scenes).map(([k, env]) => [k, W.jm.jobs.get(W.create({ name: 'own-' + k, env }).job.id)]));
  const ended = await W.untilMs(() => Object.values(jobs).every((j) => ['done', 'failed', 'interrupted'].includes(j.state)), 15000);
  const out = {};
  for (const [k, j] of Object.entries(jobs)) {
    let raw = ''; try { raw = fs.readFileSync(j.runs[j.runs.length - 1].log, 'utf8'); } catch { }
    const job = raw.split('\n').filter((l) => !l.startsWith('[job-wrapper]')).join('\n'), bare = job.replace(/\[vault:[^\]]*\]/g, '');
    const wk = want[scenes[k].PIPES], wantText = wk.map(([, w]) => w).join(''), last = wk[wk.length - 1][1].trim();
    const cutAt = raw.indexOf('[job-wrapper] stop: its scan for what left its group read only part'), lastAt = raw.lastIndexOf(last);
    out[k] = { cutSaid: cutAt >= 0, ownApart: !/[^\n]\[job-wrapper\]/.test(raw), after: lastAt >= 0 && cutAt > lastAt,
      // the job's bytes, every one: counted without line ends — a pipe's piece that the other pipe's line overtook (each pipe in its own
      // order, r2773) ends with no line end, and the wrapper's own line then starts on a line of its own (that line end is the wrapper's)
      bytes: Buffer.byteLength(bare.replace(/\n/g, '')) === Buffer.byteLength(wantText.replace(/\n/g, '')) && (bare.match(/\n/g) || []).length >= (wantText.match(/\n/g) || []).length, noValue: !raw.includes(S.slice(0, h)) && !raw.includes(S.slice(h)),
      log: raw.replace(S.slice(0, h), '<H1>').replace(S.slice(h), '<H2>').slice(0, 500) };
  }
  W.end();
  return { ended: ended.ok, out };
}
// r3942 (5): THE ROAD'S FAST PIN — the wrapper's OWN definitions (its log's open, the own lines' queue, its job write, maskOut) read from
// its text and run in a scope of stand-ins: a log that keeps its writes, a masker whose `holding` the pin sets, a hand clock for the
// timers. DEFINITIONS ONLY are evaluated: a range holding any other top-level line is refused, so nothing of the wrapper runs by being
// loaded. Each rule has its RED: the same pin over a copy with that rule cut
const ROAD_A = "/** the job's log descriptor:", ROAD_Z = '// lane agent-output-sinks', MASK_A = 'function maskOut(k, b) {', MASK_Z = "process.on('exit', () => { drainOwn('end');";
const RECORD_SAY = "recordSay = (l) => sayOwn(`[job-wrapper] ${l}`);";   // line 1017's one statement in that range (above: taken out by its text)
function roadScope(src) {
  const i = src.indexOf(ROAD_A), j = src.indexOf(ROAD_Z), m = src.indexOf(MASK_A), n = src.indexOf(MASK_Z);
  if (i < 0 || j < i || m < 0 || n < m) return null;
  // line 1017 (B-bcb8 unit B) put ONE statement inside this range: the records' say moved onto the own lines' road (`recordSay = …`, an
  // assignment to a name declared OUTSIDE the range) — no definition of the road under test: taken out by its EXACT text; every other line
  // is still a definition, and a changed spelling of that one fails the scope by name
  const text = (src.slice(i, j) + src.slice(m, n)).split('\n').filter((l) => !l.startsWith(RECORD_SAY)).join('\n');
  if (text.split('\n').some((l) => l && !/^(function \w+\(.*\) \{|let [^(]*;|\/\/|\/\*\*| |\}$)/.test(l))) return null;
  return (S) => {
    const clock = { now: 0, timers: [] }, log = [];
    const fsx = { writeSync: (fd, b) => { log.push({ at: clock.now, text: String(b) }); return b.length; }, openSync: () => 9, fstatSync: () => ({ size: 0 }), renameSync: () => { } };
    const st = (fn, ms) => { const h = { fn, due: clock.now + ms, dead: false, unref() { } }; clock.timers.push(h); return h; }, ct = (h) => { if (h) h.dead = true; };
    const R = new Function('fs', 'setTimeout', 'clearTimeout', 'S',   // eslint-disable-line no-new-func
      "let logFd = 5, logSize = 0, logOwed = null, held = null, logCap = 1e12, logPath = '/the-pin-opens-no-file', VAL = [1], vEnded = false, vquiet = null;\n" +
      'const vmask = S, vdec = { out: { write: (b) => String(b) } }, closeWritten = () => null, maskChunk = (b) => b, shaped = (s) => Buffer.from(s), quietTurn = () => { };\n' +
      "const vaultMasker = () => { if (S.maskThrows) throw new Error('placed'); return { push: (k, s) => ({ out: s }) }; };\n" +
      text + '\nreturn { sayOwn, drainOwn, writeLog, maskOut, owe: (l) => { logOwed = l; logFd = null; }, queued: () => ownQ.length };')(fsx, st, ct, S);
    const advance = (t) => { clock.now = t; for (let k = 0; k < 100; k++) { const h = clock.timers.find((x) => !x.dead && x.due <= t); if (!h) break; h.dead = true; h.fn(); } };
    return { ...R, log, advance, clock, all: () => log.map((w) => w.text).join('') };
  };
}
function roadPin(src) {
  const mk = src && roadScope(src);
  if (!mk) return null;
  const out = {};
  try {
    // ① a masker that HOLDS: nothing is written — not at once, not at the quiet, not at a turn of the job — until the end
    { const R = mk({ holding: 3 }); R.sayOwn('[job-wrapper] stop: a pin'); const now = R.log.length; R.advance(500); R.drainOwn(''); const before = R.log.length; R.drainOwn('end');
      out.holds = { now, before, end: R.log.length, line: R.all().includes('[job-wrapper] stop: a pin\n') }; }
    // ② nothing held, the job's line ended: at once (no pin of a road that never writes)
    { const R = mk({ holding: 0 }); R.sayOwn('[job-wrapper] stop: a pin'); out.free = { now: R.log.length, text: R.all() }; }
    // ③ THE QUIET counts from the job's LAST open-line write: queued at 0 ms behind an open line, the job writes on at 400 ms — at 450 ms
    // nothing (50 ms after that write), at 900 ms the line, on a line of its own
    { const R = mk({ holding: 0 }); R.writeLog(Buffer.from('progress 1')); R.sayOwn('[job-wrapper] stop: a pin'); R.clock.now = 400; R.writeLog(Buffer.from(' 2')); R.advance(450);
      const at450 = R.all().includes('[job-wrapper]'); R.advance(900); const own = R.log.find((w) => w.text.includes('[job-wrapper]'));
      out.quiet = { at450, at900: !!own, apart: !!own && own.text.startsWith('\n[job-wrapper] stop: a pin'), log: R.all() }; }
    // ④ a failed close's OWED sentence and the exit line: one write, the owed sentence first
    { const R = mk({ holding: 0 }); R.owe("the job's log (its rotation): the file could not be closed (EIO)"); R.sayOwn('[job-wrapper] exit code=0 signal='); R.drainOwn('end');
      const first = R.log.length ? R.log[0].text : '', o = first.indexOf('could not be closed');
      out.owed = { writes: R.log.length, first: o >= 0 && o < first.indexOf('exit code='), left: R.queued(), log: R.all() }; }
    // ⑤ the masker-failed sentence behind an open line of the job: on a line of its own after the quiet
    { const S = { holding: 0 }, R = mk(S); R.writeLog(Buffer.from('half a line')); S.maskThrows = true; R.writeLog(R.maskOut('out', Buffer.from('more'))); R.advance(500);
      const all = R.all(); out.masker = { said: all.includes('[job-wrapper] output withheld: the value masker failed on it'), apart: !/[^\n]\[job-wrapper\]/.test(all), log: all }; }
  } catch (e) { out.threw = String(e && e.message || e); }
  return out;
}
const roadCut = (re, to) => { const s = WRAP_SRC.replace(re, to); return s !== WRAP_SRC ? s : null; };
const ROAD = roadPin(WRAP_SRC), roadM = {
  hold: roadPin(roadCut(/^function maskHolds\(\) \{.*$/m, 'function maskHolds() { return false; }   /* MUTANT: the getter never read */')),
  quiet: roadPin(roadCut(/^  if \(ownQ\.length\) \{ if \(ownT && buf\.length && !lastNl\).*$/m, '  if (ownQ.length) drainOwn();   /* MUTANT: the release\'s one arm */')),
  open: roadPin((() => { const s = roadCut(/^  let fd; try \{ fd = logOpen\(\); \} catch \{ return; \}.*\n/m, ''); return s && s.includes('fs.writeSync(fd, b)') ? s.replace('fs.writeSync(fd, b)', 'fs.writeSync(logOpen(), b)') : null; })()),
  mask: roadPin(roadCut(/^  catch \{ sayOwn\('\[job-wrapper\] output withheld: the value masker failed on it'\); return Buffer\.alloc\(0\); \}.*$/m, "  catch { return Buffer.from('[job-wrapper] output withheld: the value masker failed on it\\n'); }   /* MUTANT: the release's job bytes */")) };
const NO_ROAD = 'the scope could not be built (its anchors, or a line in its range that is no definition)', NO_COPY = 'the copy could not be built (its anchor is missing)';
const roadRows = [
  [!!ROAD && !ROAD.threw && ROAD.holds.now === 0 && ROAD.holds.before === 0 && ROAD.holds.end === 1 && ROAD.holds.line, 'a masker that HOLDS (its holding above 0): the wrapper\'s line is written neither at once, nor at the quiet, nor at a turn of the job — at the end, once', ROAD ? (ROAD.threw || ROAD.holds) : NO_ROAD],
  [!!roadM.hold && !!roadM.hold.holds && roadM.hold.holds.now > 0, 'CONTROL — the getter never read (in a copy): the line is written at once, while the masker holds — RED on the copy', roadM.hold ? (roadM.hold.threw || roadM.hold.holds) : NO_COPY],
  [!!ROAD && !ROAD.threw && ROAD.free.now === 1 && ROAD.free.text === '[job-wrapper] stop: a pin\n', 'nothing held, the job\'s line ended: written at once, alone on its line (the pin reads a road that writes)', ROAD ? (ROAD.threw || ROAD.free) : NO_ROAD],
  [!!ROAD && !ROAD.threw && !ROAD.quiet.at450 && ROAD.quiet.at900 && ROAD.quiet.apart, 'r3942 (2) THE QUIET counts from the job\'s LAST write that left its line open: queued behind an open line, the job writing on at 400 ms — nothing at 450 ms, the line at 900 ms on a line of its own', ROAD ? (ROAD.threw || ROAD.quiet) : NO_ROAD],
  [!!roadM.quiet && !!roadM.quiet.quiet && roadM.quiet.quiet.at450, 'CONTROL — the release\'s one arm (in a copy): at 450 ms the line cuts into the job\'s open line 50 ms after its write — RED on the copy', roadM.quiet ? (roadM.quiet.threw || roadM.quiet.quiet) : NO_COPY],
  [!!ROAD && !ROAD.threw && ROAD.owed.writes === 1 && ROAD.owed.first && ROAD.owed.left === 0, 'r3942 (1) a failed close\'s OWED sentence and the exit line: ONE write, the owed sentence first, nothing left queued', ROAD ? (ROAD.threw || ROAD.owed) : NO_ROAD],
  [!!roadM.open && !!roadM.open.owed && !roadM.open.owed.first, 'CONTROL — the log opened after the lines were built (in a copy): the owed sentence lands after the exit line — RED on the copy', roadM.open ? (roadM.open.threw || roadM.open.owed) : NO_COPY],
  [!!ROAD && !ROAD.threw && ROAD.masker.said && ROAD.masker.apart, 'r3942 (3) the masker-failed sentence on the own road: behind the job\'s open line, said on a line of its own after the quiet', ROAD ? (ROAD.threw || ROAD.masker) : NO_ROAD],
  [!!roadM.mask && !!roadM.mask.masker && roadM.mask.masker.said && !roadM.mask.masker.apart, 'CONTROL — the release\'s return of it as the job\'s bytes (in a copy): inside the job\'s open line — RED on the copy', roadM.mask ? (roadM.mask.threw || roadM.mask.masker) : NO_COPY],
];
const [ownLines, ownLinesMut] = await Promise.all([WRAP_CUT ? legOwnLines(WRAP_CUT, 'ownlines') : null, WRAP_DIRECT ? legOwnLines(WRAP_DIRECT, 'ownlinesm') : null]);
ok(!!ownLines && gateOf(ownLines.ended) && gateOf(['a', 'b', 'ac', 'bc'].every((k) => ownLines.out[k])) && verdictOf(Object.values(ownLines.out).every((x) => x.cutSaid && x.ownApart && x.after && x.bytes && x.noValue)), 'r3732 — THE WRAPPER\'S OWN LINES: the scan\'s cut placed in scenes a and b (the job ends while the masker still holds) and in ac and bc (r3942: their LAST piece a child\'s of the group, written at the drain\'s signal) — the job\'s words whole and in order, each wrapper line on a line of its own, the cut\'s notice AFTER the job\'s words, no value', ownLines ? ownLines.out : 'the copy could not be built (its anchor is missing)');
ok(!!ownLinesMut && verdictOf(['ac', 'bc'].every((k) => ownLinesMut.out[k] && ownLinesMut.out[k].cutSaid && !ownLinesMut.out[k].after)), 'CONTROL (r3942: by a PLACED seam, never the pipes\' race) — today\'s direct write (in a copy): in ac and bc the cut\'s notice stands BEFORE the job\'s last piece, written after it at the drain\'s signal — RED on the copy', ownLinesMut ? ownLinesMut.out : 'the copy could not be built (its anchor is missing)');
print('r3942 — THE OWN LINES\' ROAD, IN-PROCESS (the wrapper\'s own definitions in a scope of stand-ins: a counted log, a masker whose holding the pin sets, a hand clock)', roadRows);
console.log(`      7e1674a83's settle (a copy) over the same scenes: ${JSON.stringify(SETTLE_OLD ? Object.fromEntries(Object.entries(bytesOldMut.scenes || {}).map(([k, x]) => [k, { words: x.words, bytes: x.bytes, log: x.log }])) : 'no copy')}`);
ok(!!SETTLE_NOFLAG && noFlagMut.a === false && noFlagMut.b === false && noFlagMut.c === true, 'CONTROL — MUST ONE cut ALONE (the last line still searched alone, every view\'s first trigger an end): the coloured and the ampersand last lines are NOT whole in the log in time, the completed line still is — RED on the copy', SETTLE_NOFLAG ? { a: noFlagMut.a, b: noFlagMut.b, c: noFlagMut.c } : 'the copy could not be built (its anchor is missing)');
ok(!!SETTLE_NOLINE && noLineMut.a === true && noLineMut.b === true && noLineMut.c === false, 'CONTROL — MUST TWO cut ALONE (the whole held text searched, the unfinished-piece rule kept): the line that ENDS in the value\'s own first character is NOT whole in the log in time, the coloured and the ampersand lines still are — RED on the copy', SETTLE_NOLINE ? { a: noLineMut.a, b: noLineMut.b, c: noLineMut.c } : 'the copy could not be built (its anchor is missing)');
print('①h THE UNTIL SCAN\'S CARRY ENDS WITH ITS RUN (round w3aprsv38\'s MUST)', carryRows);
ok(!!CARRY_NOEND && carryMut.scene === true && carryMut.early === true, 'CONTROL — the run\'s end WITHOUT the carry\'s clear: the cron\'s next run is «completing» at its first output — RED on the copy', CARRY_NOEND ? { scene: carryMut.scene, early: carryMut.early } : 'the copy could not be built (its anchor is missing)');
print('①i THE CARRY IS ITS RUN\'S: A START BY HAND (round w3aprsv38\'s MUST, r3108)', handRows);
ok(!!CARRY_NOEND && handMut.scene === true && handMut.early === true, 'CONTROL — the run\'s end WITHOUT the carry\'s clear: the task started again by hand is «completing» at its first output — RED on the copy', CARRY_NOEND ? { scene: handMut.scene, early: handMut.early, tries: handMut.tries } : 'the copy could not be built (its anchor is missing)');
print('①j THE OWN LINES\' ROADS WHILE A JOB\'S LINE IS OPEN (r4321, placed)', roadsRows);
if (roadsFailRows.length === 1 && roadsFailRows[0][0] === '__nocopy__') ok(false, 'r4321 (c): the copy of the masker that fails on one chunk could not be built (its anchor is missing)'); else print('①j (c) the notice of a failed mask', roadsFailRows);
print('② LOCKED = WAIT', locked);
print('③ THE CRASH LOOP', crash);
console.log('④ A LOCKED BOOT WAITS (the frp class)');
ok(verdictOf(boot.waited), 'a service whose run ended, a new engine over its data dir, the vault locked: the boot replay starts NOTHING (waiting for the vault)');
ok(verdictOf(boot.after), 'the unlock starts it — with its value');
print('⑤ AN APPROVAL', approval);
print('⑥ NO MASKER, NO START', noMasker);
print('⑥b A STOPPED SCHEDULE STARTS NOTHING', cronStopped);
print('⑥c AN UPDATE WINDOW\'S WRAPPER (round 2)', windowRows);
print('⑥d A DEFERRED START · A STOP WHILE IT DRAINS (round 2, the review)', [...deferred, ...stopDrain]);
print('⑨ THE APPROVAL CARD (lane vault-job-approval — one card per job × entry, 允许 = 验证是你 + the grant row, 拒绝 = refused)', [...card, ...deny, ...caps, ...cardRestart]);
print('⑨d ONE CARD A JOB (stage L3\'s F1, 主开发 r2528) — its entries named, one Allow and one Deny cover them, all or nothing, what stands said, the same card drawn again, the job card\'s ✕ takes back all', [...oneCard, ...oneDeny, ...redraw, ...standing, ...fullRow, ...takeAll]);
ok(!!MUT_HALF && !!fullHalfMut.half && fullHalfMut.half.tok === 1, 'CONTROL — the half-written press NOT taken back (the door\'s rollback cut): the first row stays written while the press is refused — RED on the copy', MUT_HALF ? fullHalfMut.half : 'the copy could not be built (its anchor is missing)');
print('⑨d2 ANY CHANGE OF THE SET, AND THE TAKE-BACK OF EVERY ROW (主开发 r2666)', [...setMoves, ...takeRows]);
ok(!!MUT_GROWONLY && !!setMovesMut.gone && setMovesMut.gone.rev === 1 && !!setMovesMut.swap && setMovesMut.swap.revs[2] === 2, 'CONTROL — the card drawn again on a GROWTH only (the early return when nothing is new): «B gone» keeps its rev 1 naming B, «C instead of B» stops at rev 2 naming B — RED on the copy', MUT_GROWONLY ? { gone: setMovesMut.gone, swap: setMovesMut.swap } : 'the copy could not be built (its anchor is missing)');
ok(!!MUT_DECLARED && gateOf(Array.isArray(takeRowsMut.left)) && verdictOf(takeRowsMut.left.includes(E_T3)), 'CONTROL — the take-back of the DECLARED entries only: the row of the entry the job dropped still names it — RED on the copy', MUT_DECLARED ? takeRowsMut.left : 'the copy could not be built (its anchor is missing)');
print('⑨e THE WAIT\'S AUDIT LINE (stage L3\'s F3)', waitLine);
print('⑨f THE ROAD\'S WORDS (stage L3\'s F4, F12, F5, F8 — 主开发 r2570)', words);
ok(!!MUT_NOWAIT && noWaitMut.first === 0, 'CONTROL — the door that writes no wait line: a start waiting for the locked vault leaves NO line — RED on the copy', MUT_NOWAIT ? { first: noWaitMut.first } : 'the copy could not be built (its anchor is missing)');
ok(!!MUT_EVERYWAIT && everyWaitMut.first > 1, 'CONTROL — a wait line at every judge (the engine\'s «again» cut): the re-judges while it waits write one each — RED on the copy', MUT_EVERYWAIT ? { first: everyWaitMut.first } : 'the copy could not be built (its anchor is missing)');
print('⑨c THE ADVERSARIAL READ\'S CURES — a cron\'s card, a Deny after a locked boot, the cap counts jobs, one card a job, an own value, a deleted entry', [...cronCard, ...denyWait, ...capJobs, ...ownGone]);
console.log('⑨b MUTANTS of the card (each a copy of the door — RED)');
ok(!!MUT_DENYWAIT && denyWaitMut.state === 'waiting', 'CONTROL — a Deny that refuses only an APPROVAL wait (r1): the job still waits after the locked boot\'s re-judge — RED on the copy', MUT_DENYWAIT ? denyWaitMut.state : 'the copy could not be built (its anchor is missing)');
ok(!!MUT_CAPCARDS && capJobsMut.state === 'failed', 'CONTROL — the cap counting CARDS (r1): a five-entry job is refused for ever — RED on the copy', MUT_CAPCARDS ? capJobsMut.state : 'the copy could not be built (its anchor is missing)');
ok(!!MUT_REAUTH && !!cardMutReauth.unauthed && cardMutReauth.unauthed.ok === true, 'CONTROL — 允许 without 验证是你 (the door\'s reauth check removed): the row is WRITTEN — RED on the copy', MUT_REAUTH ? cardMutReauth.unauthed : 'the copy could not be built (its anchor is missing)');
ok(!!MUT_DEDUPE && cardMutDedupe.rejudge > 1, 'CONTROL — a card per re-judge (the open-card check removed): a second card — RED on the copy', MUT_DEDUPE ? cardMutDedupe.rejudge : 'the copy could not be built (its anchor is missing)');
ok(!!MUT_DENY && denyMut.state === 'waiting', 'CONTROL — a Deny that leaves its job (the refusal removed): the job still waits — RED on the copy', MUT_DENY ? denyMut.state : 'the copy could not be built (its anchor is missing)');
const MUT_HELDPRESS = dmut("    if (!job && jm && jm._unread && jm._unread.store) return { ok: false, code: 'records-unread', words: typeof jm.unreadWords === 'function' ? jm.unreadWords() : 'the Background Work records cannot be read right now' };\n", '');
const MUT_TORNPRESS = dmut("    if (!job && jm && typeof jm.namedByCopy === 'function' && jm.namedByCopy(String(q.jobId))) return { ok: false, code: 'records-unread', words: 'the job that asked is no longer listed (its records were damaged and a kept copy still names it) — this card stays until that copy is put back or cleared' };\n", '');
const [heldPress, heldPressMut, tornPressMut] = await Promise.all([legHeldPress(), MUT_HELDPRESS ? legHeldPress(MUT_HELDPRESS) : {}, MUT_TORNPRESS ? legHeldPress(MUT_TORNPRESS) : {}]);
print('⑨g THE JOBS STORE HELD (B-f276 family unit 2, the census\'s J2 — 主开发 r3115)', heldPress);
ok(!!MUT_HELDPRESS && heldPressMut.open === 0, 'CONTROL — the hold not asked (the release\'s road): the press closes the card as over — RED on the copy', MUT_HELDPRESS ? { held: heldPressMut.held, open: heldPressMut.open } : 'the copy could not be built (its anchor is missing)');
ok(!!MUT_TORNPRESS && tornPressMut.tornOpen === 0, 'CONTROL — the kept copy not asked (the reader table, r3230): after a torn lift the press closes the card as over — RED on the copy', MUT_TORNPRESS ? { torn: tornPressMut.torn, open: tornPressMut.tornOpen } : 'the copy could not be built (its anchor is missing)');
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
  ok(gateOf(p.program) && p.program.unread === true && gateOf(p.script) && p.script.unread === true && o.sync === 0 && o.answeredThen === 0,
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
ok(verdictOf(mutLock[0]), mutLock[1]);
ok(!!cronMut.started, 'CONTROL — a stopped schedule\'s waiting run is still started at the unlock (its two guards removed): RED on the copy');
for (const [c, n, e] of muts) ok(verdictOf(c), n, e);
ok(noMaskerMut.okLines > 0, 'CONTROL — r1\'s use line (written as the frame was queued): an `ok` line for the run the wrapper refused — RED on the copy', QUEUED ? { okLines: noMaskerMut.okLines } : 'the copy could not be built (its anchor is missing)');
ok(verdictOf(startMut[0]), startMut[1], startMut[2]);
ok(stopDrainMut.okLines > 0, 'CONTROL — a wrapper that ACKs before it reads the stop: an `ok` line for a job that never ran — RED on the copy', EARLY_ACK ? { okLines: stopDrainMut.okLines } : 'the copy could not be built (its anchor is missing)');
// THE SCRATCH: the jobs this suite started have ended (each leg waits for its end or stops it); a wrapper still booting could make
// its run dir again — swept twice, 300 ms apart, and what is left is counted
let left = sweepRoots(); await nap(300); left = sweepRoots();
ok(left === 0, `every scratch root this run made (${ROOTS.size} registered; ${PREFIX}* counted in the tmp dir, registered or not) is removed`, { left });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
console.log(`scratch roots left: ${left}`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';

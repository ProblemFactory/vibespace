#!/usr/bin/env node
// STOPPING ENDS WHAT THE TURN STARTED (lane turn-never-silent, law L3 — pick 4), through the REAL data/bin/agy-wrapper.js over the
// stub's REAL processes: ① Stop ends agy's group AND what left it (a setsid'd grandchild, by its birth), ② «End the command» ends
// the command's processes and leaves agy — its step ends and the turn goes on, ③ the BY-ITSELF ending through the REAL turn
// watch (only the clock moved): a command stuck for the second bound is ended with a sentence in its own output, a busy one never,
// «Keep waiting» at 29 keeps it a full bound more, «silent» never, ④ RED CONTROL: a mutant that ends on the written silence alone
// ends a WORKING command, ⑤ a restart whose old process never exits is said, with «Start it again anyway», ⑥ a spawn that fails
// is the exit. RED on pick 3: Stop signals agy's pid only, `end-command` is an unknown verb, nothing ends a command by itself.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIN = 60e3;
const TL = require(path.join(REPO, 'src/turn-liveness.js'));
const { createProcTree } = require(path.join(REPO, 'src/server/proc-tree.js'));
const TWatch = require(path.join(REPO, 'src/server/turn-watch.js'));
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
const { createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-turn-end-'));
const every = new Set();
process.on('exit', () => { for (const p of every) { try { process.kill(p, 'SIGKILL'); } catch { } } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const birth = (pid) => { try { return TL.parseStat(fs.readFileSync(`/proc/${pid}/stat`, 'utf8')); } catch { return null; } };
const aliveAs = (p) => { const s = birth(p.pid); return !!s && s.startTicks === p.startTicks && s.state !== 'Z'; };
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(20); } return fn(); };

function startAgy(env = {}, { cmd = path.join(REPO, 'scripts/fixtures/antigravity-agy') } = {}) {
  const dir = fs.mkdtempSync(path.join(ROOT, 'a-')); const log = path.join(dir, 'stub.log');
  const child = spawn(process.execPath, [path.join(REPO, 'data/bin/agy-wrapper.js'), path.join(dir, 'x.buf'), path.join(dir, 'x.json'), cmd],
    { env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C.UTF-8', AGY_WEBUI_CWD: dir, AGY_WEBUI_BACKEND: 'antigravity', AGY_STUB_LOG: log, AGY_WEBUI_AUTH_GRACE_MS: '400', AGY_WEBUI_END_GRACE_MS: '600', VIBESPACE_CLI_WROTE_PACE_MS: '100', VS_NO_REAL_CLI: '1', ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  every.add(child.pid);
  const h = { child, dir, log, recs: [], mm: createMessageManager('antigravity', 'x'), exited: null, own: new Set() };
  let lb = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => { lb += d; let i; while ((i = lb.indexOf('\n')) !== -1) { const l = lb.slice(0, i).trim(); lb = lb.slice(i + 1); try { const r = JSON.parse(l); h.recs.push(r); h.mm.processLive(r); } catch { } } });
  child.stderr.on('data', () => { });
  child.on('exit', (code) => { h.exited = { code, at: Date.now() }; });
  h.send = (o) => { try { child.stdin.write(JSON.stringify(o) + '\n'); } catch { } };
  h.meta = () => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'x.json'), 'utf8')); } catch { return {}; } };
  h.stub = () => { try { return fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  h.has = (kind, pred = () => true) => h.recs.some((r) => r.type === 'acp' && r.kind === kind && pred(r));
  h.count = (kind, pred = () => true) => h.recs.filter((r) => r.type === 'acp' && r.kind === kind && pred(r)).length;
  h.tree = async () => { const m = h.meta(); const r = await createProcTree().readBelow(Number(m.childPid), { parent: Number(m.pid) }); for (const p of r.list) { every.add(p.pid); h.own.add(p.pid); } return r.list; };
  h.run = async (text) => { await until(() => h.has('session'), 8000); h.send({ type: 'chat-input', text, msgId: 'm' + Math.random() }); };
  h.stop = async () => { try { child.kill('SIGTERM'); } catch { } await sleep(200); try { child.kill('SIGKILL'); } catch { } for (const p of h.own) { try { process.kill(p, 'SIGKILL'); } catch { } } };
  return h;
}
const commandUp = (h) => until(() => h.stub().find((x) => x.commandPid), 8000);

const jobs = [];
const job = (title, fn) => { const R = []; const ck = (c, n, e) => R.push([c, n, e]); jobs.push({ title, R, p: fn(ck).catch((e) => ck(false, `${title}: ${e.stack || e.message}`)) }); };

job('— ① Stop ends agy\'s whole group AND what left it (a setsid\'d grandchild, by its birth)', async (ok) => {
  const h = startAgy();
  try {
    await h.run('run the hang-command escape now');
    await commandUp(h); await sleep(600);
    const m0 = h.meta(), list = await h.tree();
    ok(list.length >= 3 && list.some((p) => p.comm === 'sleep'), 'the command, its group\'s grandchild and the one in a session of its own are below agy', list.map((p) => `${p.pid}<${p.ppid} ${p.comm}`));
    const st = birth(Number(m0.childPid));
    ok(st && Number(st.ppid) === Number(m0.pid) && (() => { const r = fs.readFileSync(`/proc/${m0.childPid}/stat`, 'utf8'); const f = r.slice(r.lastIndexOf(')') + 2).split(' '); return Number(f[2]) === Number(m0.childPid); })(), 'agy runs in a process group of its OWN (its pgid is its pid — spawned detached)');
    h.send({ type: 'interrupt' });
    const gone = await until(() => list.every((p) => !aliveAs(p)), 9000);
    ok(gone, 'after Stop: every process the turn started has ended — the group by its signal, the setsid\'d one by its pid (its birth checked)', list.filter(aliveAs).map((p) => p.comm));
    const m1 = await until(() => { const m = h.meta(); return Number(m.childPid) && Number(m.childPid) !== Number(m0.childPid) ? m : null; }, 9000);
    ok(!!m1, 'and agy was started again on the same conversation (a new pid)');
    ok(!h.has('notice', (r) => r.noticeKind === 'stop-survivors'), 'nothing survived, so nothing is said about survivors');
  } finally { await h.stop(); }
});

job('— ② «End the command»: its processes end, agy stays, the step ends and the turn goes on', async (ok) => {
  const h = startAgy();
  try {
    await h.run('run the hang-command now');
    await commandUp(h); await sleep(600);
    const m0 = h.meta(), list = await h.tree();
    const ends = h.count('prompt_end');
    h.send({ type: 'end-command', by: 'person' });
    const done = await until(() => h.recs.find((r) => r.type === 'acp' && r.kind === 'command_ended'), 8000);
    ok(done && done.ok === true && done.by === 'person' && done.ended.length >= 2 && done.survivors.length === 0, 'command_ended: ok, by the person, its processes named, no survivor', done);
    ok(list.every((p) => !aliveAs(p)), 'every process below agy has ended');
    ok(Number(h.meta().childPid) === Number(m0.childPid) && !!birth(Number(m0.childPid)), 'agy itself is the SAME process, still running (not restarted)');
    ok(await until(() => h.count('prompt_end') > ends, 8000), 'the step ended and the turn went on to its end (the same turn — no new one)');
    ok(await until(() => h.has('notice', (r) => r.noticeKind === 'command-ended' && /The command was ended \(/.test(r.text)), 4000), 'the conversation says so, naming what was ended');
    h.send({ type: 'end-command', by: 'person' });
    ok(await until(() => h.recs.some((r) => r.type === 'acp' && r.kind === 'command_ended' && r.ok === false && r.code === 'no-turn'), 4000), 'with no turn running: refused by name (no-turn), nothing signalled');
  } finally { await h.stop(); }
});

/** the REAL watch over a live wrapper; only the clock moves (`skew`) */
function watched(h, { setting = () => undefined } = {}) {
  const sessions = new Map([['x', { mode: 'chat', backend: 'antigravity', name: 'live', _isStreaming: true, _normalizer: h.mm, pty: { write: (l) => h.child.stdin.write(l) } }]]);
  const ut = new UserTodoManager({ dataDir: fs.mkdtempSync(path.join(h.dir, 'd-')), onChange: () => { } });
  const W = { skew: 0, ut, sessions };
  W.w = TWatch.create({ activeSessions: sessions, buffersDir: h.dir, getUserTodos: () => ut, sessionKeyOf: () => 'key:x', serverSetting: setting, adapterOf: () => ({ formatInterrupt: () => '{"type":"interrupt"}', postInterrupt: () => { } }), now: () => Date.now() + W.skew, log: { log: () => { } } });
  W.at = async (m) => { W.skew = m * MIN; await W.w.sweep(); };
  W.items = () => { const sn = ut.snapshot(); return [...(sn.open || []), ...(sn.resolved || [])].filter((i) => i.action && i.action.type === 'turn-stuck'); };
  return W;
}
const stepOut = (h) => { const r = [...h.recs].reverse().find((x) => x.type === 'acp' && x.kind === 'update' && x.update?.sessionUpdate === 'tool_call_update'); return r ? JSON.stringify(r.update) : ''; };

job('— ③a the by-itself ending: a command stuck for the second bound is ended, a sentence in its own output', async (ok) => {
  const h = startAgy();
  try {
    await h.run('run the hang-command piped now');   // its output through a real pipe (a Go CLI's exec gives one)
    await commandUp(h); await sleep(700);
    const list = await h.tree(); const W = watched(h);
    await W.at(0); await sleep(300); await W.at(11);
    ok(W.items().length === 1 && W.items()[0].status === 'open' && W.items()[0].action.endable === true && /ended by itself at/.test(W.items()[0].detail), 'at 11 min: said, with when it would be ended by itself', W.items().map((i) => i.detail));
    await W.at(29);
    ok(list.every(aliveAs) && !h.recs.some((r) => r.kind === 'command_ended'), 'at 29 min: not ended');
    await W.at(31);
    const done = await until(() => h.recs.find((r) => r.type === 'acp' && r.kind === 'command_ended'), 8000);
    ok(done && done.ok && done.by === 'by-itself' && done.told === true, 'at 31 min: ended BY ITSELF — the same act as the door (command_ended by-itself; the sentence written to its output)', done);
    ok(await until(() => /VibeSpace ended this command after 30 minutes with no output and nothing it started working\./.test(stepOut(h)), 8000), 'the agent\'s step output carries WHY: «VibeSpace ended this command after 30 minutes with no output and nothing it started working.»', stepOut(h).slice(0, 300));
    ok(W.items()[0].status !== 'open' && W.items()[0].resolvedBy === 'ended-by-itself', 'the For-you item ends «the command was ended by itself»', W.items()[0].resolvedBy);
    ok(await until(() => h.has('prompt_end'), 8000) && await until(() => h.has('notice', (r) => r.noticeKind === 'command-ended' && /ended by itself/.test(r.text)), 4000) && h.count('notice', (r) => r.noticeKind === 'command-ended') === 1, 'the turn goes on to its end, and the conversation says it once («The command was ended by itself …»)');
  } finally { await h.stop(); }
});

job('— ③b a BUSY command is never ended; «Keep waiting» at 29 keeps a hung one a full bound more', async (ok) => {
  const b = startAgy({ AGY_STUB_BUSY_MS: '9000' }), k = startAgy();
  try {
    await b.run('run the busy-command now'); await k.run('run the hang-command now');
    await commandUp(b); await commandUp(k); await sleep(700);
    const bl = await b.tree(), kl = await k.tree();
    const WB = watched(b), WK = watched(k);
    for (const [m, gap] of [[0, 400], [11, 400], [29, 400], [31, 400], [45, 400], [61, 0]]) { await WB.at(m); if (gap) await sleep(gap); }
    ok(bl.every(aliveAs) && !b.recs.some((r) => r.kind === 'command_ended') && WB.items().length === 0, 'busy-command (its CPU moving every reading) for 61 min: never said, never ended');
    await WK.at(0); await sleep(300); await WK.at(11);
    WK.skew = 29 * MIN; WK.w.keepWaiting('x');
    await WK.at(31); await WK.at(45);
    ok(kl.every(aliveAs) && !k.recs.some((r) => r.kind === 'command_ended'), '«Keep waiting» pressed at 29: not ended at 31, nor at 45');
    await WK.at(60);
    ok(await until(() => k.recs.some((r) => r.type === 'acp' && r.kind === 'command_ended' && r.by === 'by-itself'), 8000), '…ended a FULL thirty minutes after the press (at 60)');
  } finally { await b.stop(); await k.stop(); }
});

job('— ③c «silent» (no command open) is never ended by itself; 0 = never', async (ok) => {
  const writes = [];
  const sessions = new Map([['s', { mode: 'chat', backend: 'antigravity', _isStreaming: true, _normalizer: { openTool: () => null }, pty: { write: (l) => writes.push(l) } }]]);
  const dir = fs.mkdtempSync(path.join(ROOT, 's-')); const T0 = 1_800_000_000_000;
  fs.writeFileSync(path.join(dir, 's.json'), JSON.stringify({ pid: 9, childPid: 10, cliWroteAt: T0, turnOpenedAt: T0, caps: { endCommand: true } }));
  const ut = new UserTodoManager({ dataDir: fs.mkdtempSync(path.join(dir, 'd-')), onChange: () => { } });
  let clock = T0; const reader = { readBelow: async () => ({ readable: true, alive: true, at: clock, cut: false, list: [] }) };
  const w = TWatch.create({ activeSessions: sessions, buffersDir: dir, getUserTodos: () => ut, sessionKeyOf: () => 'k', procTree: reader, now: () => clock, log: { log: () => { } } });
  for (let m = 0; m <= 600; m += 5) { clock = T0 + m * MIN; await w.sweep(); }
  ok(!writes.some((l) => /end-command/.test(l)), 'ten hours of «silent» (no tool step open): never an end-command');
  const s2 = new Map([['s', { ...sessions.get('s'), _normalizer: { openTool: () => ({ name: 'run_command' }) } }]]);
  const w2 = TWatch.create({ activeSessions: s2, buffersDir: dir, getUserTodos: () => ut, sessionKeyOf: () => 'k', procTree: reader, serverSetting: (k) => (k === TWatch.END_SETTING ? 0 : undefined), now: () => clock, log: { log: () => { } } });
  for (let m = 600; m <= 700; m += 5) { clock = T0 + m * MIN; await w2.sweep(); }
  ok(!s2.get('s').pty.write.calls && !writes.some((l) => /end-command/.test(l)), 'the setting at 0: a stuck command is said, never ended by itself');
});

job('— ⑤ a restart whose old agy never exits is SAID, with «Start it again anyway»', async (ok) => {
  const h = startAgy({ AGY_WEBUI_RESTART_BOUND_MS: '400', AGY_WEBUI_KILL_MS: '1500', AGY_STUB_EXIT_DELAY_MS: '20000' });
  try {
    await h.run('run the hang-command now'); await until(() => h.mm.openTool(), 8000);   // its child keeps the old agy alive (a «stuck» stub with nothing open exits on stdin end)
    await until(() => Number(h.meta().childPid), 4000);
    const old = Number(h.meta().childPid);
    h.send({ type: 'interrupt' });
    const said = await until(() => h.recs.find((r) => r.type === 'acp' && r.kind === 'notice' && r.noticeKind === 'restart-stuck'), 4000);
    await until(() => h.meta().restartStuck, 2000);
    ok(said && /has not exited/.test(said.text) && Number(h.meta().restartStuck && h.meta().restartStuck.pid) === old, 'the old agy has not exited within the bound: said, and the sidecar names it (restartStuck)', said && said.text);
    const W = watched(h); W.sessions.get('x')._isStreaming = false;
    await W.at(0);
    const it = W.items().find((i) => i.action.restartStuck);
    const F = require(path.join(REPO, 'src/foryou-actions.js'));
    ok(it && it.status === 'open' && F.buttonsFor(it).map((b) => b.answer).join() === 'restart-anyway', 'the watch files its item, whose ONE door is «Start it again anyway»', it && F.buttonsFor(it).map((b) => b.answer));
    const r = W.w.restartAnyway('x');
    const fresh = await until(() => { const m = h.meta(); return Number(m.childPid) && Number(m.childPid) !== old ? m : null; }, 4000);
    ok(r.ok && !!fresh && !!birth(old), 'the press starts a NEW agy while the old one still has not exited', { old, fresh: fresh && fresh.childPid });
    await sleep(1700);   // the old one's SIGKILL lands at 1.5 s (AGY_WEBUI_KILL_MS)
    const starts = h.stub().filter((x) => x.argv && x.argv.includes('--input-format')).length;
    ok(!birth(old) && starts === 2, 'when the old one finally exits, no third agy is started', { starts });
    await W.at(1);
    ok(W.items().find((i) => i.action.restartStuck).status !== 'open', 'the item ends («started again»)');
  } finally { await h.stop(); }
});

job('— ⑥ a spawn that fails is the exit (the binary gone): said, and the wrapper ends', async (ok) => {
  // the «binary»: a script that execs the stub (its fixtures stay beside it) — removed after the first start, as a self-update would
  const bin = path.join(ROOT, 'agy-copy'); fs.writeFileSync(bin, `#!/bin/sh\nexec "${process.execPath}" "${path.join(REPO, 'scripts/fixtures/antigravity-agy')}" "$@"\n`, { mode: 0o755 });
  const h = startAgy({}, { cmd: bin });
  try {
    await h.run('hello'); await until(() => h.has('prompt_end'), 8000);
    fs.rmSync(bin);
    h.send({ type: 'set-model', model: 'gemini-x' });   // a restart onto a binary that is no longer there
    ok(await until(() => h.exited, 9000), 'the wrapper ended (it did not keep a dead process as its CLI)', h.exited);
    const buf = (() => { try { return fs.readFileSync(path.join(h.dir, 'x.buf'), 'utf8'); } catch { return ''; } })();
    if (process.env.TE_DEBUG) console.log('DEBUG6', JSON.stringify(h.recs.slice(-6).map((r) => [r.kind, r.noticeKind, (r.text || '').slice(0, 90)])), buf.slice(-600), (() => { try { return fs.readFileSync(path.join(h.dir, 'agy-wrapper.log'), 'utf8').slice(-700); } catch (e) { return e.message; } })());
    ok(h.has('notice', (r) => r.noticeKind === 'child-error' || r.noticeKind === 'spawn-failed') || /"noticeKind":"(child-error|spawn-failed)"/.test(buf), 'and the conversation says why (the process error — in its own buffer, which a person\'s window replays)');
  } finally { await h.stop(); }
});

for (const j of jobs) { await j.p; console.log(j.title); for (const [c, n, e] of j.R) ok(c, n, e); }

console.log('— ④ RED CONTROL: a mutant that ends on the WRITTEN silence alone ends a WORKING command');
{
  const orig = TL.livenessVerdict;
  TL.livenessVerdict = (f) => { const v = orig(f); return { ...v, state: v.state === 'busy' && f.openTool ? 'stuck-on-command' : v.state, stillSince: v.stillSince || v.since, endDue: !!f.openTool && f.now - Math.max(f.lastWroteAt || 0, f.openedAt || 0, f.keptAt || 0) >= 30 * MIN }; };
  const b = startAgy({ AGY_STUB_BUSY_MS: '9000' });
  try {
    await b.run('run the busy-command now'); await commandUp(b); await sleep(700);
    const W = watched(b); await W.at(0); await sleep(400); await W.at(31);
    ok(await until(() => b.recs.some((r) => r.type === 'acp' && r.kind === 'command_ended' && r.by === 'by-itself'), 8000), 'the mutant ends the busy command at 31 min — ③b\'s leg is what catches it');
  } finally { TL.livenessVerdict = orig; await b.stop(); }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

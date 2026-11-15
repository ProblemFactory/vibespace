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
  const h = { child, dir, log, recs: [], mm: createMessageManager('antigravity', 'x'), exited: null, own: new Set(), taps: [] };
  let lb = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => { for (const f of h.taps) f(d); lb += d; let i; while ((i = lb.indexOf('\n')) !== -1) { const l = lb.slice(0, i).trim(); lb = lb.slice(i + 1); try { const r = JSON.parse(l); h.recs.push(r); h.mm.processLive(r); } catch { } } });
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

/** the REAL watch over a live wrapper; only the clocks move (`skew`, on the wall AND the steady one — the look's law 1: the
 *  watch counts only stillness it OBSERVED, a reading a minute; `walk` reads every minute from..to) */
function watched(h, { setting = () => undefined } = {}) {
  const sessions = new Map([['x', { mode: 'chat', backend: 'antigravity', name: 'live', _isStreaming: true, _normalizer: h.mm, buffer: '', pty: { write: (l) => h.child.stdin.write(l) } }]]);
  // the wrapper's stdout ALSO goes through the hub's REAL acp-events consumer — the one door its command_ended record reaches the watch by
  const ACP = require(path.join(REPO, 'src/server/stdout/acp-events.js'));
  ACP.create({ engine: { noteTurnEnd: () => { }, sessionModelFor: () => null }, noteHarnessModels: () => { }, deliverRef: null, permissionRulesRef: null })
    .attach(sessions.get('x'), 'x', { onData: (cb) => h.taps.push(cb) }, { feedLive: () => { }, broadcastToSession: () => { }, broadcastActiveSessions: () => { }, readSessionMeta: () => null, writeSessionMeta: () => true, updateSessionTodos: () => { } });
  const ut = new UserTodoManager({ dataDir: fs.mkdtempSync(path.join(h.dir, 'd-')), onChange: () => { } });
  const W = { skew: 0, ut, sessions };
  W.w = TWatch.create({ activeSessions: sessions, buffersDir: h.dir, getUserTodos: () => ut, sessionKeyOf: () => 'key:x', serverSetting: setting, adapterOf: () => ({ formatInterrupt: () => '{"type":"interrupt"}', postInterrupt: () => { } }), now: () => Date.now() + W.skew, mono: () => performance.now() + W.skew, log: { log: () => { } } });
  W.at = async (m) => { W.skew = m * MIN; await W.w.sweep(); };
  W.walk = async (from, to, pause = 0) => { for (let m = from; m <= to; m++) { await W.at(m); if (pause) await sleep(pause); } };
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
    await W.at(0); await sleep(300); await W.walk(1, 11);
    ok(W.items().length === 1 && W.items()[0].status === 'open' && W.items()[0].action.endable === true && /ended by itself at/.test(W.items()[0].text), 'at 11 min: said, with when it would be ended by itself — in its headline', W.items().map((i) => i.text));
    await W.walk(12, 29);
    ok(list.every(aliveAs) && !h.recs.some((r) => r.kind === 'command_ended'), 'at 29 min: not ended');
    await W.walk(30, 31);
    const done = await until(() => h.recs.find((r) => r.type === 'acp' && r.kind === 'command_ended'), 8000);
    ok(done && done.ok && done.by === 'by-itself' && done.told === true, 'at 31 min: ended BY ITSELF — the same act as the door (command_ended by-itself; the sentence written to its output)', done);
    ok(await until(() => /VibeSpace ended this command after 30 minutes with no output and nothing it started working\./.test(stepOut(h)), 8000), 'the agent\'s step output carries WHY: «VibeSpace ended this command after 30 minutes with no output and nothing it started working.»', stepOut(h).slice(0, 300));
    ok(W.items()[0].status !== 'open' && W.items()[0].resolvedBy === 'ended-by-itself', 'the For-you item ends «the command was ended by itself»', W.items()[0].resolvedBy);
    ok(await until(() => h.has('prompt_end'), 8000) && await until(() => h.has('notice', (r) => r.noticeKind === 'command-ended' && /ended by itself/.test(r.text)), 4000) && h.count('notice', (r) => r.noticeKind === 'command-ended') === 1, 'the turn goes on to its end, and the conversation says it once («The command was ended by itself …»)');
  } finally { await h.stop(); }
});

job('— ③b a BUSY command is never ended; «Keep waiting» at 29 keeps a hung one a full bound more', async (ok) => {
  const b = startAgy({ AGY_STUB_BUSY_MS: '20000' }), k = startAgy();
  try {
    await b.run('run the busy-command now'); await k.run('run the hang-command now');
    await commandUp(b); await commandUp(k); await sleep(700);
    const bl = await b.tree(), kl = await k.tree();
    const WB = watched(b), WK = watched(k);
    await WB.walk(0, 61, 120);   // a reading a (virtual) minute, 120 ms of real time apart: its CPU moves between every two
    ok(bl.every(aliveAs) && !b.recs.some((r) => r.kind === 'command_ended') && WB.items().length === 0, 'busy-command (its CPU moving every reading) for 61 min: never said, never ended');
    await WK.at(0); await sleep(300); await WK.walk(1, 29);
    WK.skew = 29 * MIN; WK.w.keepWaiting('x');
    await WK.walk(30, 58);
    ok(kl.every(aliveAs) && !k.recs.some((r) => r.kind === 'command_ended'), '«Keep waiting» pressed at 29: not ended at 30, nor up to 58');
    await WK.at(59);
    ok(await until(() => k.recs.some((r) => r.type === 'acp' && r.kind === 'command_ended' && r.by === 'by-itself'), 8000), '…ended a FULL thirty observed minutes after the press (at 59)');
  } finally { await b.stop(); await k.stop(); }
});

job('— ③c «silent» (no command open) is never ended by itself; 0 = never', async (ok) => {
  const writes = [];
  const sessions = new Map([['s', { mode: 'chat', backend: 'antigravity', _isStreaming: true, _normalizer: { openTool: () => null }, pty: { write: (l) => writes.push(l) } }]]);
  const dir = fs.mkdtempSync(path.join(ROOT, 's-')); const T0 = 1_800_000_000_000;
  fs.writeFileSync(path.join(dir, 's.json'), JSON.stringify({ pid: 9, childPid: 10, cliWroteAt: T0, turnOpenedAt: T0, caps: { endCommand: true } }));
  const ut = new UserTodoManager({ dataDir: fs.mkdtempSync(path.join(dir, 'd-')), onChange: () => { } });
  let clock = T0; const reader = { readBelow: async () => ({ readable: true, alive: true, at: clock, cut: false, list: [] }) };
  const w = TWatch.create({ activeSessions: sessions, buffersDir: dir, getUserTodos: () => ut, sessionKeyOf: () => 'k', procTree: reader, now: () => clock, mono: () => clock, log: { log: () => { } } });
  for (let m = 0; m <= 600; m++) { clock = T0 + m * MIN; await w.sweep(); }
  ok(!writes.some((l) => /end-command/.test(l)), 'ten hours of «silent» (no tool step open): never an end-command');
  const s2 = new Map([['s', { ...sessions.get('s'), _normalizer: { openTool: () => ({ name: 'run_command' }) } }]]);
  const w2 = TWatch.create({ activeSessions: s2, buffersDir: dir, getUserTodos: () => ut, sessionKeyOf: () => 'k', procTree: reader, serverSetting: (k) => (k === TWatch.END_SETTING ? 0 : undefined), now: () => clock, mono: () => clock, log: { log: () => { } } });
  for (let m = 600; m <= 700; m++) { clock = T0 + m * MIN; await w2.sweep(); }
  ok(!s2.get('s').pty.write.calls && !writes.some((l) => /end-command/.test(l)), 'the setting at 0: a stuck command is said, never ended by itself');
});

job('— ③d LAW 3 (M5): two end verbs together — ONE runs, the other is answered «already ending»', async (ok) => {
  const h = startAgy();
  try {
    await h.run('run the hang-command now');
    await commandUp(h); await sleep(600);
    const list = await h.tree();
    const v = JSON.stringify({ type: 'end-command', by: 'person' }) + '\n';
    h.child.stdin.write(v + v);   // in ONE write: the wrapper reads both before the first await
    await until(() => h.count('command_ended') >= 2, 8000);
    const recs = h.recs.filter((r) => r.type === 'acp' && r.kind === 'command_ended');
    ok(recs.length === 2 && recs.filter((r) => r.ok === true).length === 1 && recs.some((r) => r.ok === false && r.code === 'already-ending'), 'two records: one ending ran (ok), the other was answered «already ending»', recs.map((r) => [r.ok, r.code || '']));
    ok(list.every((p) => !aliveAs(p)) && await until(() => h.has('notice', (r) => r.noticeKind === 'command-ended'), 4000) && h.count('notice', (r) => r.noticeKind === 'command-ended') === 1, 'its processes ended once, said once');
  } finally { await h.stop(); }
});

job('— ③e LAW 3 (M4): a step open with NOTHING below agy — «nothing to end», the item stays with Stop, never ended by itself', async (ok) => {
  const h = startAgy();
  try {
    await h.run('run the stuck step now');   // the stub opens a run_command step and starts nothing
    await until(() => h.mm.openTool(), 8000); await sleep(600);
    ok((await h.tree()).length === 0, 'nothing runs below agy');
    const W = watched(h);
    await W.at(0); await sleep(200); await W.walk(1, 11);
    const F = require(path.join(REPO, 'src/foryou-actions.js'));
    let it = W.items()[0];
    ok(it && it.status === 'open' && it.action.nothingToEnd === true && /There is nothing to end/.test(it.text) && F.buttonsFor(it).map((b) => b.answer).join() === 'keep-waiting,stop-turn', 'said at 10: «there is nothing to end: Antigravity CLI itself waits on a step with no command running» — Keep waiting and Stop the turn', it && [it.text, F.buttonsFor(it).map((b) => b.answer)]);
    h.send({ type: 'end-command', by: 'person' });   // a press anyway (an old window's door)
    const r = await until(() => h.recs.find((x) => x.type === 'acp' && x.kind === 'command_ended'), 6000);
    ok(r && r.ok === false && r.code === 'no-command', 'the wrapper answers no-command (nothing signalled)', r);
    await W.walk(12, 45);
    it = W.items()[0];
    ok(it.status === 'open' && h.count('command_ended') === 1 && !h.recs.some((x) => x.kind === 'command_ended' && x.by === 'by-itself'), 'forty-five minutes: never ended by itself, the item still open, «ended» never said', [it.status, it.resolvedBy]);
  } finally { await h.stop(); }
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

job('— ⑦ THE KILL PROOFS (the look at 99f65d547): the restart\'s late group SIGKILL is CANCELLED once the old agy has exited', async (ok) => {
  const h = startAgy({ AGY_WEBUI_KILL_MS: '800' });
  try {
    await h.run('run the hang-command now');
    await commandUp(h); await sleep(400);
    const old = Number(h.meta().childPid);
    h.send({ type: 'interrupt' });   // Stop = a restart: the old agy exits at its group's SIGTERM
    const fresh = await until(() => { const m = h.meta(); return Number(m.childPid) && Number(m.childPid) !== old ? m : null; }, 6000);
    await sleep(1400);   // past the old one's KILL_MS
    const wl = (() => { try { return fs.readFileSync(path.join(h.dir, 'agy-wrapper.log'), 'utf8'); } catch { return ''; } })();
    const sigs = wl.split('\n').filter((l) => new RegExp(`group SIG\\w+ → ${old}\\b`).test(l));
    ok(Number.isInteger(old) && old > 1 && !!fresh && !birth(old) && sigs.some((l) => /group SIGTERM/.test(l)), 'Stop restarted agy: the old one got its group\'s SIGTERM and exited', sigs);
    ok(!sigs.some((l) => /group SIGKILL/.test(l)), 'its group\'s late SIGKILL was never sent — cancelled at its exit (a group id may be reused)', sigs);
  } finally { await h.stop(); }
});

job('— ⑨ S6: a wrapper killed past its own handler leaves agy (its own session) and its command — the kill path ends them by agy\'s RECORDED birth', async (ok) => {
  const h = startAgy({ AGY_STUB_EXIT_DELAY_MS: '20000' });   // an agy that outlives its stdin's end (as the kill law must assume)
  try {
    await h.run('run the hang-command now');
    await commandUp(h); await sleep(600);
    const m = h.meta(), agy = Number(m.childPid), list = await h.tree();
    every.add(agy); h.own.add(agy);
    ok(Number.isInteger(m.childStart) && birth(agy) && m.childStart === birth(agy).startTicks, 'the sidecar records agy\'s BIRTH beside its pid (childStart)', [m.childPid, m.childStart]);
    h.child.kill('SIGKILL');   // the wrapper killed past its own exit handler (an OOM kill)
    await sleep(700);
    ok(!!birth(agy) && list.every(aliveAs), 'the wrapper is gone; agy and its command still run (the gap the look named)');
    const PSM = require(path.join(REPO, 'src/server/proc-signal.js'));
    const left = await PSM.recordedChildOf(path.join(h.dir, 'x.json'));
    const said = [];
    const r = await PSM.create().endLeftGroup(left, { graceMs: 100, killMs: 800, say: (l) => said.push(l) });
    ok(left && left.pid === agy && r === 'ended' && !birth(agy) && list.every((p) => !aliveAs(p)) && said.length === 1, 'endLeftGroup: agy\'s group ended by its recorded birth — agy and its command gone, said once', [r, said]);
    const sent = [];
    const c = spawn('sleep', ['30'], { stdio: 'ignore' }); every.add(c.pid); await sleep(150);
    const r2 = await PSM.create({ kill: (pid, sig) => sent.push([pid, sig]) }).endLeftGroup({ pid: c.pid, startTicks: birth(c.pid).startTicks + 1 }, { graceMs: 10, killMs: 10 });
    ok(r2 === 'gone' && sent.length === 0, 'a recorded pid now someone else\'s (another birth): nothing is signalled («gone»)', [r2, sent]);
    try { c.kill('SIGKILL'); } catch { }
    const ws = fs.readFileSync(path.join(REPO, 'src/ws-handler.js'), 'utf8');
    const a = ws.indexOf("const leftAgy = await require('./server/proc-signal.js').recordedChildOf(path.join(BUFFERS_DIR, `${data.sessionId}.json`));"), b = ws.indexOf('removeWrapperFiles(BUFFERS_DIR, data.sessionId);', a);
    ok(a > 0 && b > a && ws.slice(a, b).includes("\n      if (leftAgy) require('./server/proc-signal.js').create().endLeftGroup(leftAgy, { say: "), 'the hub\'s kill path (endSessionBody) reads the recorded agy BEFORE the sidecar goes, and ends it after its grace (a source pin: endSessionBody\'s deps are a whole server\'s)');
  } finally { await h.stop(); }
});

for (const j of jobs) { await j.p; console.log(j.title); for (const [c, n, e] of j.R) ok(c, n, e); }

console.log('— ⑧ THE KILL PROOFS (the look at 99f65d547): src/server/proc-signal.js — the birth comparison, the floors, never our own group');
{
  const PSM = require(path.join(REPO, 'src/server/proc-signal.js'));
  const sent = [], kill = (pid, sig) => { sent.push([pid, sig]); };
  const PS = PSM.create({ kill });
  const c = spawn('sleep', ['30'], { stdio: 'ignore' }); every.add(c.pid);
  await sleep(150);
  const st = birth(c.pid);
  ok(PS.signalOne({ pid: c.pid, startTicks: st.startTicks }, 'SIGCONT') && sent.length === 1 && sent[0][0] === c.pid, 'a process found with its birth: signalled');
  ok(!PS.signalOne({ pid: c.pid, startTicks: st.startTicks + 1 }, 'SIGCONT') && sent.length === 1, 'the SAME pid with another birth (a reused pid): never signalled — the birth comparison', sent);
  const init = birth(1), me = birth(process.pid);
  const floors = [{ pid: 0 }, { pid: 1, startTicks: init && init.startTicks }, { pid: -5, startTicks: 1 }, { pid: process.pid, startTicks: me && me.startTicks }, { pid: 1.5 }, { pid: String(c.pid), startTicks: st.startTicks }];
  ok(floors.every((p) => !PS.signalOne(p, 'SIGTERM')) && sent.length === 1, 'signalOne\'s floor: never 0, 1 (with init\'s own birth), a negative, our own pid (with our own birth), a fraction, a string', sent);
  ok([{ pid: 0 }, { pid: 1 }, { pid: -3 }, { pid: process.pid }, { pid: undefined }, null].every((p) => !PS.killGroup(p, 'SIGTERM')) && sent.length === 1, 'killGroup\'s floor: never group 0 (ours), 1, a negative, our own pid, no pid', sent);
  const G = PSM.create({ kill, readStat: (pid) => (pid === process.pid ? `${pid} (node) S 1 4242 4242 0 -1 4194304` : fs.readFileSync(`/proc/${pid}/stat`, 'utf8')) });
  ok(!G.killGroup({ pid: 4242 }, 'SIGTERM') && sent.length === 1, 'never OUR OWN group (a handle whose pid is our pgid)', sent);
  ok(PS.killGroup({ pid: c.pid }, 'SIGTERM') && sent.length === 2 && sent[1][0] === -c.pid, 'a spawned handle above the floor: its group signalled (-pid)', sent);
  try { c.kill('SIGKILL'); } catch { }
}

console.log('— ④ RED CONTROL: a mutant that counts the WRITTEN silence alone (work below the CLI is not movement) ends a WORKING command');
{
  const orig = TL.stillnessStep;
  TL.stillnessStep = (prev, cur, o) => orig(prev, cur && { ...cur, worked: false }, o);
  const b = startAgy({ AGY_STUB_BUSY_MS: '20000' });
  try {
    await b.run('run the busy-command now'); await commandUp(b); await sleep(700);
    const W = watched(b); await W.walk(0, 31, 60);
    ok(await until(() => b.recs.some((r) => r.type === 'acp' && r.kind === 'command_ended' && r.by === 'by-itself'), 8000), 'the mutant ends the busy command at 30 min — ③b\'s leg is what catches it');
  } finally { TL.stillnessStep = orig; await b.stop(); }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
// THE TURN WATCH (lane turn-never-silent, law L2 — pick 3): a stuck turn says so, ONCE, where the person is — through the REAL
// src/server/turn-watch.js over the REAL For-you store (src/user-todos.js), a fake /proc reader and a virtual clock (①–⑬), the
// route's person verdict (⑭), the client's wiring (⑮), then LIVE (⑯): the REAL agy wrapper over the stub's hang-command /
// busy-command, its records through the REAL message manager, the REAL reader below agy — only the clock is moved.
// RED on pick 2: src/server/turn-watch.js absent.
// THE LOOK AT 99f65d547 (主开发 07:49Z + the GO's three amendments 07:53Z): ⑱–㉓ — the refuters' scenes on TWO fake clocks (the
// wall and the steady one, pulled apart by a clock step or a suspend): law 1 (only stillness observed, inside one life), law 2
// (each stretch its own item; an ending only after its own item stood), a time a card shows = the time it happens, one stuck
// command = one item across a gap, the kept choice survives a gap and a restart, what a restart left is ended (S4).
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
const WATCH = path.join(REPO, 'src/server/turn-watch.js');
if (!fs.existsSync(WATCH)) { console.error('  ✗ src/server/turn-watch.js exists (the hub\'s turn watch)'); console.log('\n0 passed, 1 failed'); process.exit(1); }
const TWatch = require(WATCH);
const TW = require(path.join(REPO, 'src/turn-stuck-words.js'));
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-turn-watch-'));
const own = new Set();
process.on('exit', () => { for (const p of own) { try { process.kill(p, 'SIGKILL'); } catch { } } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const MIN = 60e3;

/** a world: sessions, sidecars on disk, the REAL For-you store, a fake reader whose readings the leg sets, a virtual clock */
function world({ backend = 'antigravity' } = {}) {
  const W = { clock: 1_800_000_000_000, mclock: 5_000_000, wallOff: 0, monoLost: 0, sessions: new Map(), dir: fs.mkdtempSync(path.join(ROOT, 'w-')), trees: new Map(), asks: new Map() };
  W.buf = path.join(W.dir, 'buffers'); fs.mkdirSync(W.buf);
  W.utDir = path.join(W.dir, 'data'); fs.mkdirSync(W.utDir);
  W.ut = new UserTodoManager({ dataDir: W.utDir, onChange: () => { } });
  W.sidecar = (id, o) => fs.writeFileSync(path.join(W.buf, id + '.json'), JSON.stringify({ pid: 4000, childPid: 4001, ...o }));
  W.session = (id, o = {}) => {
    const tools = new Map();
    const s = { mode: 'chat', backend, name: 'lane ' + id, _isStreaming: true, _normalizer: { pendingToolCalls: tools, openTool: () => { let l = null; for (const v of tools.values()) l = v; return l ? { name: l.block.name, cmd: l.block.input ? l.block.input.command : null } : null; } }, ...o };
    W.sessions.set(id, s); return s;
  };
  /** a pty whose wrapper ANSWERS an ending the way agy-wrapper does (its command_ended record, through THE door acp-events
   *  uses): `reply(verb)` → the record, or null (no answer yet) */
  W.answering = (id, reply = () => ({ ok: true, ended: ['node'], survivors: [] }), into = []) => ({ write: (l) => { const v = JSON.parse(String(l)); into.push({ ...v, wall: W.clock }); if (v.type === 'end-command') { const r = reply(v); if (r) TWatch.noteCommandEnded(W.sessions.get(id), { type: 'acp', kind: 'command_ended', by: v.by, ...r }); } } });
  W.tool = (id, name, command) => W.sessions.get(id)._normalizer.pendingToolCalls.set('t-' + name, { msgId: 'm', block: { type: 'tool_use', name, ...(command ? { input: { command } } : {}) } });
  W.reader = { readBelow: async (pid, { now } = {}) => { const t = W.trees.get(pid) || { readable: true, alive: true, list: [] }; return { readable: t.readable !== false, alive: t.alive !== false, why: null, at: now ? now() : W.clock, cut: false, list: (t.list || []).map((p) => ({ ...p })) }; } };
  W.life = () => TWatch.create({ activeSessions: W.sessions, buffersDir: W.buf, getUserTodos: () => W.ut, sessionKeyOf: (s, id) => 'key:' + id, serverSetting: () => undefined,
    procTree: W.reader, asksOf: (s) => W.asks.get(s) || [], now: () => W.clock, mono: () => W.mclock, log: { log: () => { } } });
  W.watch = W.life();
  /** a hub restart: the For-you store read back from its disk, a NEW watch (this life knows nothing of the last one) */
  W.restart = () => { W.ut.flush && W.ut.flush(); W.ut = new UserTodoManager({ dataDir: W.utDir, onChange: () => { } }); W.watch = W.life(); };
  const all = (ut) => { const sn = ut.snapshot(); return [...(sn.open || []), ...(sn.resolved || [])]; };
  W.items = () => all(W.ut).filter((i) => i.action && i.action.type === 'turn-stuck');
  W.open = () => W.items().filter((i) => i.status === 'open');
  // minute m of REAL time: the wall reads it plus any step; the steady clock reads it minus any suspend
  W.to = (m) => { W.clock = 1_800_000_000_000 + m * MIN + W.wallOff; W.mclock = 5_000_000 + m * MIN - W.monoLost; };
  W.at = async (m) => { W.to(m); return W.watch.sweep(); };
  return W;
}
const T0 = 1_800_000_000_000;
const idle = [{ pid: 4100, startTicks: 50, ticks: 3, io: { rchar: 10, wchar: 0 } }];

console.log('— ① a turn stuck on a command is said, ONCE, naming the tool');
let W = world();
{
  W.session('a'); W.tool('a', 'run_command'); W.sidecar('a', { cliWroteAt: T0, turnOpenedAt: T0 }); W.trees.set(4001, { list: idle });
  for (let m = 0; m <= 9; m++) await W.at(m);
  ok(W.items().length === 0, 'nine minutes: nothing said');
  await W.at(10);
  const it = W.open()[0];
  ok(W.open().length === 1 && it.itemKey === `turn-stuck:a:${T0}:${T0}` && it.sessionKey === 'key:a', 'at the bound OBSERVED (ten readings a minute apart): ONE For-you item, keyed per conversation + turn + STRETCH, filed under the conversation', W.items().map((i) => [i.itemKey, i.status]));
  ok(it.i18n.text.key === TW.TEXT.commandAlive && it.i18n.text.params.what === 'run_command' && it.i18n.text.params.since.at === T0 && /run_command/.test(it.text), 'it names the open tool and since when (an instant the viewer reads in its own zone)', it.i18n);
  ok(/ — Antigravity CLI is running\. VibeSpace does not end it by itself\.$/.test(it.text) && it.i18n.text.params.cli === 'Antigravity CLI' && it.i18n.text.params.then.key === TW.THEN.notByItself, 'its HEADLINE says the CLI is running and what happens if nothing is pressed — here: VibeSpace does not end it (its wrapper serves no ending) — never in a fold (P1)', it.text);
  for (let m = 11; m <= 20; m++) await W.at(m);
  ok(W.items().length === 1 && W.open().length === 1, 'ten more readings: still ONE item, never a second beside it');
}

console.log('— ② it is gone when the turn moves or ends');
{
  W.trees.set(4001, { list: idle });
  W.sidecar('a', { cliWroteAt: T0 + 22 * MIN, turnOpenedAt: T0 });
  await W.at(22);
  ok(W.open().length === 0 && W.items()[0].resolvedBy === 'moved', 'the CLI wrote a line: the item ends «it moved on»', W.items().map((i) => i.resolvedBy));
  for (let m = 23; m <= 31; m++) await W.at(m);
  ok(W.open().length === 0, 'after the movement the count starts again: nine minutes, nothing said');
  await W.at(32);
  const two = W.items().find((i) => i.status === 'open');
  ok(W.items().length === 2 && two && two.itemKey === `turn-stuck:a:${T0}:${T0 + 22 * MIN}` && W.items().find((i) => i.itemKey === `turn-stuck:a:${T0}:${T0}`).resolvedBy === 'moved', 'stuck again in the SAME turn: a NEW stretch — its OWN item (the look\'s law 2), the first stays ended «it moved on»', W.items().map((i) => [i.itemKey, i.status, i.resolvedBy]));
  W.sessions.get('a')._isStreaming = false;
  await W.at(33);
  ok(W.open().length === 0 && W.items().find((i) => i.itemKey === two.itemKey).resolvedBy === 'turn-ended', 'the turn ended: «the turn ended»');
}

console.log('— ③ a command that is WORKING is never said');
W = world();
{
  W.session('b'); W.tool('b', 'run_command'); W.sidecar('b', { cliWroteAt: T0, turnOpenedAt: T0 });
  for (let m = 0; m <= 120; m++) { W.trees.set(4001, { list: [{ pid: 4100, startTicks: 50, ticks: 10 + m * 30 }] }); await W.at(m); }
  ok(W.items().length === 0, 'two hours of nothing written, its command using CPU every minute: never an item («busy»)');
}

console.log('— ④ silent, unknown, and a turn waiting on the person');
W = world();
{
  W.session('c'); W.sidecar('c', { cliWroteAt: T0, turnOpenedAt: T0 }); W.trees.set(4001, { list: [] });
  for (let m = 0; m <= 10; m++) await W.at(m);
  const it = W.open()[0];
  ok(it && it.i18n.text.key === TW.TEXT.silentAlive && !('tool' in it.i18n.text.params), 'no tool step open: «no output since …, and no command is open» (silent)', it && it.i18n);
  W.trees.set(4001, { alive: false, list: [] });
  await W.at(10.5);
  const c2 = W.items().filter((i) => i.action.sessionId === 'c');
  ok(c2.length === 1 && c2[0].status === 'open' && c2[0].i18n.text.key === TW.TEXT.silentGone && /is not running\. VibeSpace does not end it by itself\.$/.test(c2[0].text) && c2[0].id === it.id, '…patched IN PLACE when its words change (the CLI gone — the same item, its words redrawn)', c2.map((i) => [i.status, i.text]));
  W.session('d'); W.tool('d', 'run_command'); W.sidecar('d', { cliWroteAt: T0, turnOpenedAt: T0, remote: { state: 'connected' } });
  for (let m = 11; m <= 22; m++) await W.at(m);
  const u = W.open().find((i) => i.action.sessionId === 'd');
  ok(u && u.i18n.text.key === TW.TEXT.unknown, 'a paired machine\'s session (its processes are not here): «unknown» — what is known, never «stuck»', u && u.i18n);
  W.session('e'); W.tool('e', 'run_command'); W.sidecar('e', { cliWroteAt: T0, turnOpenedAt: T0 }); W.trees.set(4001, { list: [] });
  W.asks.set(W.sessions.get('e'), [{ requestId: 'r1' }]);
  for (let m = 23; m <= 60; m++) await W.at(m);
  ok(!W.items().some((i) => i.action.sessionId === 'e'), 'a turn waiting on the PERSON (the chip\'s own fact) is never stuck');
  W.session('f', { _turnState: 'requires_action' }); W.sidecar('f', { cliWroteAt: T0, turnOpenedAt: T0 });
  for (let m = 61; m <= 75; m++) await W.at(m);
  ok(!W.items().some((i) => i.action.sessionId === 'f'), '…nor one whose harness says requires_action');
}

console.log('— ⑤ «Keep waiting»: the item ends; judged again only after another FULL bound; then the SAME key');
W = world();
{
  W.session('g'); W.tool('g', 'run_command'); W.sidecar('g', { cliWroteAt: T0, turnOpenedAt: T0 }); W.trees.set(4001, { list: idle });
  for (let m = 0; m <= 10; m++) await W.at(m);
  W.to(10.5);
  const r = W.watch.keepWaiting('g');
  ok(r.ok && W.open().length === 0 && W.items()[0].resolvedBy === 'kept-waiting', 'the press resolves the item «kept waiting»', W.items()[0].resolvedBy);
  for (let m = 11; m <= 20; m++) await W.at(m);
  ok(W.open().length === 0, 'nine and a half minutes after the press: nothing said again');
  await W.at(21);
  ok(W.items().length === 1 && W.open().length === 1, 'a full bound after the press with nothing: ONE item again — the same key, never a second', W.items().map((i) => [i.itemKey, i.status]));
  ok(W.watch.keepWaiting('nobody').ok === false && W.watch.keepWaiting('nobody').code === 'not-stuck', 'a press for a turn the watch does not hold is refused by name');
}

console.log('— ⑥ a person\'s ✕ stands for that stretch');
{
  const it = W.open()[0];
  W.ut.setStatus(it.id, 'dismissed', 'user');
  for (let m = 22; m <= 40; m++) await W.at(m);
  ok(W.open().length === 0 && W.items().length === 1, 'dismissed by the person: not said again in that stretch');
}

console.log('— ⑦ a restart: the new life ADOPTS what the last one left — or ends it (S4: the turn ended, the CLI wrote, the conversation is gone)');
W = world();
{
  W.session('h'); W.tool('h', 'run_command'); W.sidecar('h', { cliWroteAt: T0, turnOpenedAt: T0 }); W.trees.set(4001, { list: idle });
  for (let m = 0; m <= 10; m++) await W.at(m);
  const key = W.open()[0].itemKey;
  W.restart();
  await W.at(60);
  ok(W.open().length === 1 && W.open()[0].itemKey === key, 'the new life\'s first reading: the left item is ADOPTED as its stretch (nothing judged, nothing filed beside it)');
  for (let m = 61; m <= 75; m++) await W.at(m);
  ok(W.items().length === 1 && W.open().length === 1, 'fifteen readings on: still that ONE item (its count started again; never a second beside it)', W.items().map((i) => [i.itemKey, i.status]));
  W.sessions.delete('h');
  await W.at(76);
  ok(W.open().length === 0 && W.items()[0].resolvedBy === 'gone', 'the conversation gone during this life: «the conversation is gone»', W.items()[0].resolvedBy);
  // the CLI wrote while the hub was down: the stretch the item spoke of is over
  W = world(); W.session('i'); W.tool('i', 'run_command'); W.sidecar('i', { cliWroteAt: T0, turnOpenedAt: T0 }); W.trees.set(4001, { list: idle });
  for (let m = 0; m <= 10; m++) await W.at(m);
  W.restart(); W.sidecar('i', { cliWroteAt: T0 + 20 * MIN, turnOpenedAt: T0 });
  await W.at(30);
  ok(W.open().length === 0 && W.items()[0].resolvedBy === 'moved', 'the CLI wrote while the hub was down (its stamp moved past the item\'s): «it moved on» at the first sight', W.items()[0].resolvedBy);
  // S4: the turn it spoke of ended (a new turn opened) while the hub was down
  W = world(); W.session('j'); W.tool('j', 'run_command'); W.sidecar('j', { cliWroteAt: T0, turnOpenedAt: T0 }); W.trees.set(4001, { list: idle });
  for (let m = 0; m <= 10; m++) await W.at(m);
  W.restart(); W.sidecar('j', { cliWroteAt: T0 + 40 * MIN, turnOpenedAt: T0 + 40 * MIN });
  await W.at(50);
  ok(W.items().length === 1 && W.items()[0].resolvedBy === 'turn-ended', 'S4: a new turn opened while the hub was down (the wrapper\'s own opening stamp): the left item ends «the turn ended»', W.items().map((i) => i.resolvedBy));
  // S4: the conversation is idle at the first sight
  W = world(); W.session('k'); W.tool('k', 'run_command'); W.sidecar('k', { cliWroteAt: T0, turnOpenedAt: T0 }); W.trees.set(4001, { list: idle });
  for (let m = 0; m <= 10; m++) await W.at(m);
  W.restart(); W.sessions.get('k')._isStreaming = false;
  await W.at(30);
  ok(W.items()[0].resolvedBy === 'turn-ended', 'S4: its turn ended while the hub was down (idle at the first sight): «the turn ended»', W.items()[0].resolvedBy);
  // S4: the conversation is not here after the restart — «gone», but only after GONE_AFTER (a boot restores the live set after the first reading)
  W = world(); W.session('l'); W.tool('l', 'run_command'); W.sidecar('l', { cliWroteAt: T0, turnOpenedAt: T0 }); W.trees.set(4001, { list: idle });
  for (let m = 0; m <= 10; m++) await W.at(m);
  W.restart(); const back = W.sessions.get('l'); W.sessions.delete('l');
  await W.at(30); await W.at(31);
  ok(W.open().length === 1, 'not here at the new life\'s first readings: the item stands (the boot may not have restored it yet)');
  W.sessions.set('l', back); await W.at(32);
  ok(W.open().length === 1 && W.items().length === 1, '…restored a moment later: adopted, ONE item');
  W.sessions.delete('l');
  W.restart();
  for (let m = 40; m <= 44; m++) await W.at(m);
  ok(W.open().length === 1, 'absent for four minutes of the new life: still standing');
  await W.at(45);
  ok(W.open().length === 0 && W.items()[0].resolvedBy === 'gone', 'absent for five minutes of the new life: «the conversation is gone» (never left open for ever)', W.items()[0].resolvedBy);
}

console.log('— ⑧ «Stop the turn» is the composer\'s own Stop');
{
  const lines = [], posted = [];
  const sessions = new Map([['s1', { mode: 'chat', backend: 'antigravity', pty: { write: (l) => lines.push(l) } }], ['s2', { mode: 'chat', backend: 'antigravity' }]]);
  const w = TWatch.create({ activeSessions: sessions, buffersDir: ROOT, adapterOf: () => ({ formatInterrupt: () => '{"type":"interrupt"}', postInterrupt: (s, id) => posted.push(id) }), procTree: W.reader, log: { log: () => { } } });
  const r = w.stopTurn('s1');
  ok(r.ok && lines[0] === '{"type":"interrupt"}\n' && posted[0] === 's1', 'the interrupt line is written to the session and its adapter is told (the ws \'interrupt\' recipe)', { lines, posted });
  ok(w.stopTurn('s2').code === 'not-live' && w.stopTurn('nope').code === 'not-live', 'a session not running here: refused by name');
}

console.log('— ⑭ the doors are a PERSON\'s (the route\'s person verdict)');
{
  const routes = {};
  require(path.join(REPO, 'src/routes/turn-stuck.js')).registerTurnStuckRoutes({ post: (p, h) => { routes[p] = h; } }, { turnWatch: { keepWaiting: () => ({ ok: true }), stopTurn: () => ({ ok: true }) } });
  const run = (headers, body) => { let code = 200, json = null; routes['/api/turns/:sessionId/stuck']({ headers, body, params: { sessionId: 'x' }, socket: {} }, { set: () => { }, status: (c) => { code = c; return { json: (j) => { json = j; } }; }, json: (j) => { json = j; } }); return { code, json }; };
  const b = run({ authorization: 'Bearer abc', host: 'h' }, { answer: 'stop-turn' });
  ok(b.code === 403 && b.json.code === 'human_only', 'an agent\'s bearer cannot press it (human_only)', b);
  const F = require(path.join(REPO, 'src/foryou-actions.js'));
  ok(F.buttonsOf('turn-stuck').every((x) => x.route === '/api/turns/{sessionId}/stuck') && !!routes['/api/turns/:sessionId/stuck'], 'the registry row\'s buttons press the route that exists');
  ok(JSON.stringify(F.buttonsOf('turn-stuck').map((x) => x.answer)) === JSON.stringify(require(path.join(REPO, 'src/routes/turn-stuck.js')).ANSWERS), 'every button\'s answer is one the route takes, and the route takes no other');
}

console.log('— ⑮ the client\'s wiring');
{
  const cv = fs.readFileSync(path.join(REPO, 'src/lib/chat-view.js'), 'utf8');
  const i = cv.indexOf("if (verdict === 'give-up-once') {"), j = cv.indexOf("t('no output for {n} min", i);
  ok(i > 0 && j > i && cv.slice(i, j).includes('this._needsCards?.stallSpoken?.()) return;'), 'the chat\'s own «no output for N min» note yields while the hub\'s item stands (one voice)');
  const F = require(path.join(REPO, 'src/foryou-actions.js'));
  ok(F.quietsStallOf('turn-stuck') === true && F.quietsStallOf('messages-waiting') === false, 'read from the registry row (`quietsStall`), never a type branch');
}

console.log('— ⑯ LIVE: the REAL agy wrapper, its records through the REAL message manager, the REAL reader below agy');
{
  const { createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));
  const live = async (shape) => {
    const mine = new Set();   // THIS run's processes (two runs go together: one's cleanup must never end the other's)
    const dir = fs.mkdtempSync(path.join(ROOT, 'live-')); const log = path.join(dir, 'stub.log');
    const child = spawn(process.execPath, [path.join(REPO, 'data/bin/agy-wrapper.js'), path.join(dir, 'x.buf'), path.join(dir, 'x.json'), path.join(REPO, 'scripts/fixtures/antigravity-agy')], { env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C.UTF-8', AGY_WEBUI_CWD: dir, AGY_WEBUI_BACKEND: 'antigravity', AGY_STUB_LOG: log, AGY_WEBUI_AUTH_GRACE_MS: '400', AGY_STUB_BUSY_MS: '8000', VIBESPACE_CLI_WROTE_PACE_MS: '100', VS_NO_REAL_CLI: '1' }, stdio: ['pipe', 'pipe', 'pipe'] });
    const mm = createMessageManager('antigravity', 'x'); let lb = '';
    child.stdout.setEncoding('utf8'); child.stdout.on('data', (d) => { lb += d; let i; while ((i = lb.indexOf('\n')) !== -1) { const l = lb.slice(0, i).trim(); lb = lb.slice(i + 1); try { mm.processLive(JSON.parse(l)); } catch { } } });
    child.stderr.on('data', () => { });
    const sessions = new Map([['x', { mode: 'chat', backend: 'antigravity', name: 'live', _isStreaming: true, _normalizer: mm }]]);
    const ut = new UserTodoManager({ dataDir: fs.mkdtempSync(path.join(dir, 'd-')), onChange: () => { } });
    let skew = 0;
    const w = TWatch.create({ activeSessions: sessions, buffersDir: dir, getUserTodos: () => ut, sessionKeyOf: (s, id) => 'key:' + id, now: () => Date.now() + skew, mono: () => performance.now() + skew, log: { log: () => { } } });
    try {
      await sleep(900);
      child.stdin.write(JSON.stringify({ type: 'chat-input', text: `run the ${shape}-command now`, msgId: 'm1' }) + '\n');
      const t0 = Date.now(); while (Date.now() - t0 < 8000 && !(fs.existsSync(log) && /commandPid/.test(fs.readFileSync(log, 'utf8')))) await sleep(20);
      for (const l of fs.readFileSync(log, 'utf8').split('\n')) { try { const o = JSON.parse(l); if (o.commandPid) { own.add(o.commandPid); mine.add(o.commandPid); } } catch { } }
      await sleep(900);
      await w.sweep();                                   // the first reading (now)
      for (const p of (await require(path.join(REPO, 'src/server/proc-tree.js')).createProcTree().readBelow(JSON.parse(fs.readFileSync(path.join(dir, 'x.json'), 'utf8')).childPid)).list) { own.add(p.pid); mine.add(p.pid); }
      for (let k = 1; k <= 10; k++) { await sleep(k === 1 ? 900 : 60); skew = k * MIN; await w.sweep(); }   // ten more readings, a minute apart on BOTH clocks (only the clocks moved)
      return { items: [...(ut.snapshot().open || []), ...(ut.snapshot().resolved || [])].filter((i) => i.action && i.action.type === 'turn-stuck'), open: mm.openTool() };
    } finally { try { child.kill('SIGKILL'); } catch { } for (const p of mine) { try { process.kill(p, 'SIGKILL'); } catch { } } }
  };
  const [h, b] = await Promise.all([live('hang'), live('busy')]);
  ok(h.open && h.open.name === 'run_command' && h.open.cmd === 'node driver.mjs', 'the REAL ACP message manager answers openTool(): agy\'s open run_command step and its command\'s first line (the conversation\'s own running tool card)', h.open);
  ok(h.items.length === 1 && h.items[0].i18n.text.key === TW.TEXT.commandAlive && /^Stuck on a command: run_command «node driver\.mjs» has shown nothing since .* — Antigravity CLI is running\. If nothing changes, the command is ended by itself at .*\.$/.test(h.items[0].text) && h.items[0].i18n.text.params.then.key === TW.THEN.endAt && h.items[0].i18n.text.params.then.at > 0 && h.items[0].action.endable === true, 'hang-command: ONE item — stuck on run_command «node driver.mjs» (P2), Antigravity running, and IN ITS HEADLINE when it is ended by itself (P1)', h.items.map((i) => i.text));
  ok(b.items.length === 0, 'busy-command: nothing (its command works below agy)', b.items.map((i) => i.text));
}

console.log('— ⑰ P6 (主开发 04:44Z): «Keep waiting» ends the ATTENTION, the card stays in its KEPT state, with its door');
{
  const F = require(path.join(REPO, 'src/foryou-actions.js'));
  // a stuck command on a wrapper that serves end-command (agy): the next act after the press is the by-itself ending
  let Wk = world(); const verbs = [];
  Wk.session('k', { pty: Wk.answering('k', undefined, verbs) }); const writes = { some: (f) => verbs.some((v) => f(JSON.stringify(v))), get length() { return verbs.length; } }; Wk.tool('k', 'run_command'); Wk.sidecar('k', { cliWroteAt: T0, turnOpenedAt: T0, caps: { endCommand: true } }); Wk.trees.set(4001, { list: idle });
  for (let m = 0; m <= 10; m++) await Wk.at(m);
  Wk.to(12);
  const r = Wk.watch.keepWaiting('k');
  let it = Wk.items()[0], k = F.keptOf(it);
  ok(r.ok && it.status !== 'open' && it.resolvedBy === 'kept-waiting', 'the press resolves the item — the tray\'s attention goes (a press is attended)', [it.status, it.resolvedBy]);
  ok(k && k.at === T0 + 12 * MIN && k.act === 'end' && k.nextAt === T0 + 42 * MIN, 'the card\'s KEPT fact: when the person chose, the next bound (thirty minutes on) and its act — ended by itself', k);
  ok(F.buttonsFor({ ...it, status: 'open' }).some((b) => b.answer === 'end-command'), '…and its door «End the command» still applies (the row keeps it: `when` endable)');
  for (let m = 13; m <= 40; m++) await Wk.at(m);
  it = Wk.items()[0];
  ok(Wk.items().length === 1 && it.resolvedBy === 'kept-waiting' && !!F.keptOf(it) && !writes.some((l) => /end-command/.test(l)), 'its next act is the ending: NOT asked again at the told bound (no second item), not ended before 42', [Wk.items().length, it.resolvedBy]);
  await Wk.at(42);
  it = Wk.items()[0];
  ok(writes.some((l) => /"by":"by-itself"/.test(l)) && it.resolvedBy === 'ended-by-itself' && F.keptOf(it) === null, 'at 42 the bound acts: the command is ended by itself, and the card goes quiet («ended by itself»)', [it.resolvedBy, writes.length]);
  // a turn that MOVES after the press: the kept card goes («it moved on»); a «not yet» right after the press never ends it
  Wk = world(); Wk.session('m'); Wk.tool('m', 'run_command'); Wk.sidecar('m', { cliWroteAt: T0, turnOpenedAt: T0, caps: { endCommand: true } }); Wk.trees.set(4001, { list: idle });
  for (let m = 0; m <= 10; m++) await Wk.at(m);
  Wk.to(11); Wk.watch.keepWaiting('m');
  await Wk.at(12); await Wk.at(13);
  ok(!!F.keptOf(Wk.items()[0]), 'readings right after the press («not yet» — the clock restarted on the press): the kept card stays');
  Wk.sidecar('m', { cliWroteAt: T0 + 14 * MIN, turnOpenedAt: T0, caps: { endCommand: true } }); await Wk.at(14.5);
  ok(Wk.items()[0].resolvedBy === 'moved' && F.keptOf(Wk.items()[0]) === null, 'the CLI wrote after the press: the kept card goes («it moved on»)', Wk.items()[0].resolvedBy);
  // a harness where «End the command» does not apply (no end-command served): the next act is to ASK again
  Wk = world(); Wk.session('a'); Wk.tool('a', 'run_command'); Wk.sidecar('a', { cliWroteAt: T0, turnOpenedAt: T0 }); Wk.trees.set(4001, { list: idle });
  for (let m = 0; m <= 10; m++) await Wk.at(m);
  Wk.to(11); Wk.watch.keepWaiting('a');
  k = F.keptOf(Wk.items()[0]);
  ok(k && k.act === 'ask' && k.nextAt === T0 + 21 * MIN && !F.buttonsFor({ ...Wk.items()[0], status: 'open' }).some((b) => b.answer === 'end-command'), 'no end-command served: the kept card says the person is asked again at the next bound, and offers no ending', k);
  for (let m = 12; m <= 20; m++) await Wk.at(m);
  ok(Wk.open().length === 0 && !!F.keptOf(Wk.items()[0]), 'nine readings after the press: still the kept card');
  await Wk.at(21);
  ok(Wk.items().length === 1 && Wk.items()[0].status === 'open' && F.keptOf(Wk.items()[0]) === null, 'at that bound: asked again — the SAME item reopened (no longer kept)');
  // the chat keeps the kept card's tool run open (the fold rule and the run signature read `.cn-stay`)
  const cv = fs.readFileSync(path.join(REPO, 'src/lib/chat-view.js'), 'utf8'), cn = fs.readFileSync(path.join(REPO, 'src/lib/chat-needs-card.js'), 'utf8');
  ok(cv.includes(':is(.cn-card.cn-open, .cn-card.cn-kept, .cn-card.cn-stay)') && cn.includes("if (keptOf(e.item)) {\n        card.classList.add('cn-stay');") && cn.includes(':is(.cn-card.cn-kept, .cn-card.cn-stay)'), 'the chat draws a kept card IN PLACE (`.cn-stay`) and its record never folds into a run while it stands');
  ok(JSON.stringify(F.closersOf({ action: { type: 'turn-stuck', sessionId: 'x' }, status: 'done', resolvedBy: 'kept-waiting', facts: { kept: { at: 1, nextAt: 2, act: 'end' } } })) === '[]' && JSON.stringify(F.closersOf({ action: { type: 'turn-stuck', sessionId: 'x' }, status: 'done', resolvedBy: 'moved' })) === '["reopen"]', 'a KEPT card offers no generic closer (its one door is «End the command now»); once quiet, the record\'s usual ↺');
  ok(F.keptOf({ action: { type: 'messages-waiting' }, status: 'done', resolvedBy: 'kept-waiting', facts: { kept: { at: 1, nextAt: 2, act: 'end' } } }) === null, 'keptOf reads the registry row (`kept`), never a type branch: a row without it is never kept');
}

// ── THE LOOK AT 99f65d547: the refuters' scenes ─────────────────────────────────────────────────────────────────────
/** an agy conversation whose wrapper serves end-command (the by-itself ending applies: its row says «no bound of its own»);
 *  every verb written to it is kept with the wall and the real minute it was written at */
function endWorld(id, o = {}) {
  const X = world();
  if (o.settings) X.watch = TWatch.create({ activeSessions: X.sessions, buffersDir: X.buf, getUserTodos: () => X.ut, sessionKeyOf: (s, i) => 'key:' + i, serverSetting: (k) => o.settings[k], procTree: X.reader, now: () => X.clock, mono: () => X.mclock, log: { log: () => { } } });
  X.verbs = []; X.min = 0; X.reply = () => ({ ok: true, ended: ['node'], survivors: [] });
  X.session(id, { pty: X.answering(id, (v) => X.reply(v), X.verbs) });
  X.tool(id, 'run_command', 'node driver.mjs --watch');
  X.sidecar(id, { cliWroteAt: T0, turnOpenedAt: T0, caps: { endCommand: true } }); X.trees.set(4001, { list: idle });
  const at0 = X.at; X.at = async (m) => { X.min = m; return at0(m); };
  X.ends = () => X.verbs.filter((v) => v.type === 'end-command');
  X.thenAt = () => { const i = X.open()[0]; return i && i.i18n.text.params.then && i.i18n.text.params.then.at; };
  X.keptAt = () => { const k = require(path.join(REPO, 'src/foryou-actions.js')).keptOf(X.items().find((i) => i.resolvedBy === 'kept-waiting') || null); return k && k.nextAt; };
  return X;
}

console.log('— ⑱ LAW 1 (M1): a restart — the count starts again at the new life\'s first reading; what the person chose is ADOPTED; nothing ends before the time the card states, and the card states the time it happens');
{
  // the refuter's scene: Keep waiting at 12, the hub restarts at 20 — the base ended it at 30, twelve minutes before the card's 42
  let X = endWorld('k');
  for (let m = 0; m <= 10; m++) await X.at(m);
  ok(X.thenAt() === T0 + 30 * MIN && /ended by itself at/.test(X.open()[0].text), 'filed at 10 observed minutes, saying it is ended by itself at 10 + 20 more observed = :30', [X.thenAt(), T0 + 30 * MIN]);
  X.to(12); X.watch.keepWaiting('k');
  ok(X.keptAt() === T0 + 42 * MIN, 'Keep waiting at 12: the kept card says :42 (thirty observed minutes from the press)', X.keptAt());
  for (let m = 13; m <= 20; m++) await X.at(m);
  X.restart();
  await X.at(21);
  ok(X.ends().length === 0 && X.open().length === 0 && X.keptAt() === T0 + 51 * MIN, 'the new life\'s first reading (21): the kept card is ADOPTED and stays the kept card — its time PATCHED to 21 + 30 = :51 (the count starts again)', [X.keptAt() && (X.keptAt() - T0) / MIN, X.open().length]);
  for (let m = 22; m <= 50; m++) await X.at(m);
  ok(X.ends().length === 0 && X.open().length === 0, 'nothing ended at 30 (the refuter\'s minute), at 42 (the old card\'s), or up to 50 — and the person was never asked again');
  const said = X.keptAt();
  await X.at(51);
  ok(X.ends().length === 1 && X.ends()[0].by === 'by-itself' && X.ends()[0].wall === said && X.items()[0].resolvedBy === 'ended-by-itself', 'ended at 51 — the minute the card said, by itself', [X.ends().map((v) => v.min), said && (said - T0) / MIN]);
  // the same without a press: the open item is adopted and its «ended by itself at» moves with the count
  X = endWorld('o');
  for (let m = 0; m <= 10; m++) await X.at(m);
  X.restart();
  await X.at(20);
  ok(X.open().length === 1 && X.thenAt() === T0 + 50 * MIN, 'an OPEN item across a restart: adopted (one item), its time patched to 20 + 30 = :50', X.thenAt() && (X.thenAt() - T0) / MIN);
  for (let m = 21; m <= 49; m++) await X.at(m);
  ok(X.ends().length === 0, 'not ended at 30 (the old card\'s minute) nor up to 49');
  const t50 = X.thenAt(); await X.at(50);
  ok(X.ends().length === 1 && X.ends()[0].wall === t50, 'ended at 50 — the time its card showed', X.ends().map((v) => v.min));
}

console.log('— ⑲ LAW 1 (M2): a clock step and a suspend are GAPS — never stillness; the open item is CARRIED (one stuck command, one item) and its time patched');
{
  let X = endWorld('s');
  for (let m = 0; m <= 12; m++) await X.at(m);
  X.wallOff += 40 * MIN;   // the wall clock steps forward forty minutes (an NTP fix) between 12 and 13
  await X.at(13);
  ok(X.ends().length === 0 && X.open().length === 1 && X.items().length === 1, 'the step: nothing ended at once (the base ended a command idle two real minutes), the SAME one item still open');
  ok(X.thenAt() === X.clock + 30 * MIN, 'its «ended by itself at» patched to the step\'s reading + 30 observed minutes (the card\'s time is the time it will happen)', [(X.thenAt() - X.clock) / MIN]);
  for (let m = 14; m <= 42; m++) await X.at(m);
  ok(X.ends().length === 0 && X.items().length === 1, 'twenty-nine observed minutes after the step: not ended, still ONE item');
  let t = X.thenAt(); await X.at(43);
  ok(X.ends().length === 1 && X.ends()[0].wall === t, 'thirty observed minutes after the step: ended — at the wall time its card showed', [X.ends().map((v) => v.min)]);
  X = endWorld('u');
  for (let m = 0; m <= 15; m++) await X.at(m);
  X.monoLost += 60 * MIN;  // the machine sleeps an hour: the steady clock stops, the wall goes on
  await X.at(75);
  ok(X.ends().length === 0 && X.items().length === 1 && X.open().length === 1, 'an hour\'s suspend: nothing ended on waking, the SAME one item', X.items().map((i) => i.status));
  for (let m = 76; m <= 104; m++) await X.at(m);
  ok(X.ends().length === 0, 'twenty-nine observed minutes after waking: not ended');
  t = X.thenAt(); await X.at(105);
  ok(X.ends().length === 1 && X.ends()[0].wall === t && t === T0 + 105 * MIN, 'thirty observed minutes after waking: ended, at its card\'s time', X.ends().map((v) => v.min));
  // a gap BEFORE the bound: the count starts again; ONE item, under the stretch's own key
  X = endWorld('v');
  for (let m = 0; m <= 7; m++) await X.at(m);
  X.monoLost += 20 * MIN; await X.at(27);
  for (let m = 28; m <= 36; m++) await X.at(m);
  ok(X.items().length === 0, 'seven minutes, a suspend, nine more: not said (only observed stillness counts)');
  await X.at(37);
  ok(X.items().length === 1 && X.open()[0].itemKey === `turn-stuck:v:${T0}:${T0}`, 'ten observed minutes after waking: ONE item, the stretch\'s own key (a gap is not a new stretch)', X.items().map((i) => i.itemKey));
}

console.log('— ⑳ LAW 2 (M3): each stuck stretch is its own — its own item, and an ending only after ITS item stood');
{
  // the refuter's scene: after one by-itself ending, the next stuck command was ended at 30 with no item of its own
  let X = endWorld('n');
  for (let m = 0; m <= 30; m++) await X.at(m);
  ok(X.ends().length === 1 && X.items()[0].resolvedBy === 'ended-by-itself', 'the first command: said at 10, ended by itself at 30');
  const k1 = X.items()[0].itemKey;
  // nothing moves after the ending (the CLI writes nothing, the tree reads the same): a NEW stretch all the same
  for (let m = 31; m <= 39; m++) await X.at(m);
  ok(X.open().length === 0 && X.ends().length === 1, 'nine minutes after the ending: nothing said, nothing ended');
  await X.at(40);
  const it2 = X.open()[0];
  ok(it2 && it2.itemKey !== k1 && X.items().length === 2 && X.thenAt() === T0 + 60 * MIN, 'ten minutes after the ending: the next stretch\'s OWN item, saying :60', [it2 && it2.itemKey, X.thenAt() && (X.thenAt() - T0) / MIN]);
  for (let m = 41; m <= 59; m++) await X.at(m);
  ok(X.ends().length === 1, 'not ended before its own time');
  await X.at(60);
  ok(X.ends().length === 2 && X.ends()[1].wall === T0 + 60 * MIN && X.items().find((i) => i.itemKey === it2.itemKey).resolvedBy === 'ended-by-itself', 'ended at 60, after its own notice stood twenty minutes');
  // the command ended and the CLI goes on (it writes, a new command hangs): a new stretch, a new item
  X = endWorld('p');
  for (let m = 0; m <= 30; m++) await X.at(m);
  X.sidecar('p', { cliWroteAt: T0 + 31 * MIN, turnOpenedAt: T0, caps: { endCommand: true } }); X.trees.set(4001, { list: [{ pid: 4200, startTicks: 90, ticks: 1 }] });
  for (let m = 31; m <= 40; m++) await X.at(m);
  ok(X.items().length === 1, 'it moved on: the next command hangs from 31 — nine minutes, nothing said');
  await X.at(41);
  ok(X.open().length === 1 && X.items().length === 2 && X.thenAt() === T0 + 61 * MIN, 'ten observed minutes: its OWN item, saying :61', X.thenAt() && (X.thenAt() - T0) / MIN);
  // its ending waits for its item to have STOOD: with both bounds at ten minutes, the item is filed at 10 and ended a reading later — the time it said
  X = endWorld('q', { settings: { 'turns.stuckAfterMin': 10, 'turns.endStuckCommandMin': 10 } });
  for (let m = 0; m <= 10; m++) await X.at(m);
  ok(X.open().length === 1 && X.ends().length === 0 && X.thenAt() === T0 + 11 * MIN, 'both bounds ten minutes: filed at 10, NOT ended at the reading that filed it; it says :11', X.thenAt() && (X.thenAt() - T0) / MIN);
  await X.at(11);
  ok(X.ends().length === 1 && X.ends()[0].wall === T0 + 11 * MIN, 'ended at 11, after its notice stood one reading — at the time it said');
}

console.log('— ㉑ the KEPT choice survives a gap (amendment 3): not asked again, still the kept card, its time patched');
{
  let X = endWorld('r');
  for (let m = 0; m <= 10; m++) await X.at(m);
  X.to(12); X.watch.keepWaiting('r');
  for (let m = 13; m <= 20; m++) await X.at(m);
  X.monoLost += 30 * MIN; await X.at(50);
  ok(X.open().length === 0 && X.keptAt() === T0 + 80 * MIN && X.items().length === 1, 'a half-hour suspend after the press: the kept card stays kept, its time patched to the waking reading + 30 = :80; not asked again', [X.keptAt() && (X.keptAt() - T0) / MIN, X.open().length]);
  for (let m = 51; m <= 79; m++) await X.at(m);
  ok(X.ends().length === 0 && X.open().length === 0, 'twenty-nine observed minutes on: nothing ended, nothing asked');
  await X.at(80);
  ok(X.ends().length === 1 && X.ends()[0].wall === T0 + 80 * MIN, 'ended at :80 — the kept card\'s patched time');
  // where no ending applies the kept card's act is to ASK again — after a gap, at its patched time, never before
  X = world(); X.session('w'); X.tool('w', 'run_command'); X.sidecar('w', { cliWroteAt: T0, turnOpenedAt: T0 }); X.trees.set(4001, { list: idle });
  for (let m = 0; m <= 10; m++) await X.at(m);
  X.to(11); X.watch.keepWaiting('w');
  for (let m = 12; m <= 15; m++) await X.at(m);
  X.wallOff -= 30 * MIN; await X.at(16);   // the wall steps BACK half an hour
  const F = require(path.join(REPO, 'src/foryou-actions.js'));
  const k = F.keptOf(X.items()[0]);
  ok(k && k.act === 'ask' && k.nextAt === X.clock + 10 * MIN && X.open().length === 0, 'a clock step back after the press: still kept, its «asked again at» patched to the step\'s reading + 10', k);
  for (let m = 17; m <= 25; m++) await X.at(m);
  ok(X.open().length === 0, 'not asked again before that time');
  await X.at(26);
  ok(X.open().length === 1 && X.items().length === 1, 'asked again at it — the SAME item reopened, never a second');
}

console.log('— ㉓ S1: the by-itself ending is gated on the ROW («no bound of its own»), never on the wrapper\'s advert alone');
{
  const X = world({ backend: 'claude' }); const verbs = [];
  X.session('c', { pty: { write: (l) => verbs.push(JSON.parse(String(l))) } }); X.tool('c', 'Bash', 'sleep 9999');
  X.sidecar('c', { cliWroteAt: T0, turnOpenedAt: T0, caps: { endCommand: true } }); X.trees.set(4001, { list: idle });
  for (let m = 0; m <= 45; m++) await X.at(m);
  const it = X.open()[0];
  ok(it && it.action.endable === true && it.i18n.text.params.then.key === TW.THEN.notByItself && !verbs.some((v) => v.type === 'end-command'), 'a harness whose row bounds its own commands (claude: commandBound «cli»), on a wrapper that advertises the verb: the door is drawn, the card says VibeSpace does not end it, and 45 minutes end nothing', [it && it.i18n.text.params.then, verbs.length]);
}

console.log('— ㉔ LAW 3 (M4, M5): «ended» is said only on the wrapper\'s own record that something was ended; «nothing to end» keeps the item, its door Stop; one ending at a time');
{
  const F = require(path.join(REPO, 'src/foryou-actions.js'));
  const doorsOf = (i) => F.buttonsFor(i).map((b) => b.answer).join();
  // M4: a tool step open with NOTHING running below the CLI — said as such from the start, never ended by itself
  let X = endWorld('a'); X.trees.set(4001, { list: [] });
  for (let m = 0; m <= 10; m++) await X.at(m);
  let it = X.open()[0];
  ok(it && it.i18n.text.params.then.key === TW.THEN.nothingToEnd && /There is nothing to end: Antigravity CLI itself waits on a step with no command running\.$/.test(it.text) && it.action.nothingToEnd === true && doorsOf(it) === 'keep-waiting,stop-turn', 'a step open and nothing below the CLI: «there is nothing to end: the CLI itself waits on a step with no command running» — its doors Keep waiting and Stop the turn, no «End the command»', [it && it.text, it && doorsOf(it)]);
  for (let m = 11; m <= 70; m++) await X.at(m);
  ok(X.ends().length === 0 && X.open().length === 1 && X.watch.endCommand('a').code === 'nothing-to-end', 'sixty minutes: never ended by itself, the item STAYS; a press anyway is refused «nothing to end»');
  // the wrapper finds nothing to end (the command left between the reading and the press): the item stays, says so
  X = endWorld('b'); X.reply = () => ({ ok: false, code: 'no-command' });
  for (let m = 0; m <= 12; m++) await X.at(m);
  const r = X.watch.endCommand('b', 'person');
  it = X.open()[0];
  ok(r.ok && r.code === 'ending' && it && it.status === 'open' && it.action.nothingToEnd === true && it.i18n.text.params.then.key === TW.THEN.nothingToEnd && doorsOf(it) === 'keep-waiting,stop-turn', 'the press is ASKED («Ending the command…»); the wrapper answers no-command: the item STAYS open, says there is nothing to end, Stop its door', [r, it && it.resolvedBy, it && doorsOf(it)]);
  for (let m = 13; m <= 60; m++) await X.at(m);
  ok(X.ends().length === 1 && X.items().length === 1 && X.open().length === 1, 'and it is never ended by itself after it (one verb in all — the person\'s)');
  // the wrapper ended NOTHING (gone on their own) or could end nothing (survivors only): never «ended»
  for (const [why, rep] of [['every process had already gone', { ok: true, ended: [], survivors: [] }], ['its processes would not end', { ok: true, ended: [], survivors: ['sleep'] }]]) {
    X = endWorld('c'); X.reply = () => rep;
    for (let m = 0; m <= 12; m++) await X.at(m);
    X.watch.endCommand('c');
    ok(X.open().length === 1 && !X.items().some((i) => /ended/.test(String(i.resolvedBy || ''))), `${why}: the item stays — «ended» is never said`, X.items().map((i) => i.resolvedBy));
  }
  // a KEPT card whose by-itself ending finds nothing to end: the item is OPEN again, «nothing to end», Stop its door
  X = endWorld('k');
  for (let m = 0; m <= 10; m++) await X.at(m);
  X.to(12); X.watch.keepWaiting('k'); X.reply = () => ({ ok: false, code: 'no-command' });
  for (let m = 13; m <= 42; m++) await X.at(m);
  it = X.items()[0];
  ok(X.ends().length === 1 && it.status === 'open' && it.action.nothingToEnd === true && doorsOf(it) === 'keep-waiting,stop-turn', 'a kept card whose ending at :42 found nothing to end: the item is open again, says so, Stop its door', [it.status, it.resolvedBy, doorsOf(it)]);
  // M5: one ending at a time — a second press while one is asked is answered «already ending»; nothing more is written
  X = endWorld('d'); X.reply = () => null;   // the wrapper has not answered yet
  for (let m = 0; m <= 29; m++) await X.at(m);
  X.to(29.5);
  const one = X.watch.endCommand('d', 'person'), two = X.watch.endCommand('d', 'person');
  ok(one.ok && two.ok === false && two.code === 'already-ending' && X.ends().length === 1, 'two presses together: the first is asked, the second answered «already ending» — ONE verb written', [one, two, X.ends().length]);
  await X.at(30); await X.at(31);
  ok(X.ends().length === 1 && X.open().length === 1, 'the by-itself ending\'s time (:30) comes while the person\'s ending is still asked: no second verb; the item stays (nothing said ended yet)', X.ends().map((v) => v.by));
  TWatch.noteCommandEnded(X.sessions.get('d'), { ok: false, code: 'already-ending', by: 'by-itself' });
  ok(X.open().length === 1, 'an «already ending» record (another verb\'s) does not settle it');
  TWatch.noteCommandEnded(X.sessions.get('d'), { ok: true, by: 'person', ended: ['node', 'sleep'], survivors: [] });
  ok(X.open().length === 0 && X.items()[0].resolvedBy === 'command-ended', 'the wrapper\'s record that something was ended: the item ends «the command was ended» AT ONCE');
  // the ending moves the tree BEFORE its record comes (a reading in between): the record speaks, never «it moved on»
  X = endWorld('f'); X.reply = () => null;
  for (let m = 0; m <= 12; m++) await X.at(m);
  X.to(12.5); X.watch.endCommand('f', 'person');
  X.trees.set(4001, { list: [] }); await X.at(13);
  ok(X.open().length === 1, 'a reading between the press and the record sees the processes gone: the item still stands (the movement is the ending\'s own)', X.items().map((i) => i.resolvedBy));
  TWatch.noteCommandEnded(X.sessions.get('f'), { ok: true, by: 'person', ended: ['node'], survivors: [] });
  ok(X.items()[0].resolvedBy === 'command-ended', '…and the record ends it «the command was ended»', X.items()[0].resolvedBy);
  // no answer at all: let go after ENDING_WAIT_MS — the item stays and the door works again
  X = endWorld('e'); X.reply = () => null;
  for (let m = 0; m <= 12; m++) await X.at(m);
  X.watch.endCommand('e', 'person');
  await X.at(13); await X.at(14);
  ok(X.watch.endCommand('e').code === 'already-ending', 'a minute or two later: still asked');
  await X.at(15);
  ok(X.open().length === 1 && X.watch.endCommand('e').ok === true, 'no record after two minutes: let go (said in the log) — the item stays, a press asks again');
  // the door's words: asking, never «ended»
  const row = F.ROW_OF['turn-stuck'];
  ok(row.buttons.find((b) => b.answer === 'end-command').said === 'Ending the command…' && row.refused['already-ending'] && row.refused['nothing-to-end'], 'the press says «Ending the command…» (the item says «ended» when the record comes); «already ending» and «nothing to end» are refused by name');
}

console.log('— ㉒ P2: the command\'s first words, cut and escaped where they are drawn');
{
  const v = { state: 'stuck-on-command', tool: 'run_command', since: T0, cliAlive: true };
  const w1 = TW.stuckWords({ ...v, cmd: 'node driver.mjs --name "<img src=x onerror=alert(1)>"\nsecond line' }, { cli: 'Antigravity CLI' });
  ok(w1.i18n.text.params.what.key === TW.WHAT && w1.i18n.text.params.what.params.cmd === 'node driver.mjs --name "<img src=x onerror=alert(1)>"' && /run_command «node driver\.mjs --name "<img/.test(w1.text), 'its first line only, as a param of its own words', w1.i18n.text.params.what);
  ok(TW.cmdWords('x'.repeat(200)).length === TW.CMD_MAX && TW.cmdWords('x'.repeat(200)).endsWith('…') && TW.cmdWords('a\u0007b\tc') === 'a b c' && TW.cmdWords(['git', 'status']) === 'git status', 'at most 60 characters (the cut said «…»), control characters out, an argv joined');
  const L = await import(path.join(REPO, 'src/lib/user-todos-layout.js')), R = await import(path.join(REPO, 'src/lib/user-todos-row.js'));
  const zh = (k, p) => { const d = { [TW.TEXT.commandAlive]: '卡在一条命令上：{what} 自 {since} 起没有任何输出，它启动的进程也都没在工作——{cli} 仍在运行。{then}', [TW.WHAT]: '{tool}「{cmd}」', [TW.THEN.notByItself]: 'VibeSpace 不会自动结束它。' }; return String(d[k] || k).replace(/\{(\w+)\}/g, (m, x) => (p && x in p ? p[x] : m)); };
  const line = L.saidLine(w1.i18n.text, zh, { now: T0, timeZone: 'UTC' });
  const html = R.wordsHtml(line);
  ok(/^卡在一条命令上：run_command「node driver\.mjs --name "<img src=x onerror=alert\(1\)>"」 自 .* 起没有任何输出，它启动的进程也都没在工作——Antigravity CLI 仍在运行。VibeSpace 不会自动结束它。$/.test(line) && !/<img/.test(html) && /&lt;img/.test(html), 'said in the viewer\'s language — and drawn ESCAPED (THE row renderer\'s words)', [line, html.slice(0, 160)]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

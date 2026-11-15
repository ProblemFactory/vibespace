#!/usr/bin/env node
// THE TURN WATCH (lane turn-never-silent, law L2 — pick 3): a stuck turn says so, ONCE, where the person is — through the REAL
// src/server/turn-watch.js over the REAL For-you store (src/user-todos.js), a fake /proc reader and a virtual clock (①–⑬), the
// route's person verdict (⑭), the client's wiring (⑮), then LIVE (⑯): the REAL agy wrapper over the stub's hang-command /
// busy-command, its records through the REAL message manager, the REAL reader below agy — only the clock is moved.
// RED on pick 2: src/server/turn-watch.js absent.
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
  const W = { clock: 1_800_000_000_000, sessions: new Map(), dir: fs.mkdtempSync(path.join(ROOT, 'w-')), trees: new Map(), asks: new Map() };
  W.buf = path.join(W.dir, 'buffers'); fs.mkdirSync(W.buf);
  W.utDir = path.join(W.dir, 'data'); fs.mkdirSync(W.utDir);
  W.ut = new UserTodoManager({ dataDir: W.utDir, onChange: () => { } });
  W.sidecar = (id, o) => fs.writeFileSync(path.join(W.buf, id + '.json'), JSON.stringify({ pid: 4000, childPid: 4001, ...o }));
  W.session = (id, o = {}) => {
    const tools = new Map();
    const s = { mode: 'chat', backend, name: 'lane ' + id, _isStreaming: true, _normalizer: { pendingToolCalls: tools, openTool: () => { let l = null; for (const v of tools.values()) l = v; return l ? { name: l.block.name } : null; } }, ...o };
    W.sessions.set(id, s); return s;
  };
  W.tool = (id, name) => W.sessions.get(id)._normalizer.pendingToolCalls.set('t-' + name, { msgId: 'm', block: { type: 'tool_use', name } });
  W.reader = { readBelow: async (pid, { now } = {}) => { const t = W.trees.get(pid) || { readable: true, alive: true, list: [] }; return { readable: t.readable !== false, alive: t.alive !== false, why: null, at: now ? now() : W.clock, cut: false, list: (t.list || []).map((p) => ({ ...p })) }; } };
  W.watch = TWatch.create({ activeSessions: W.sessions, buffersDir: W.buf, getUserTodos: () => W.ut, sessionKeyOf: (s, id) => 'key:' + id, serverSetting: () => undefined,
    procTree: W.reader, asksOf: (s) => W.asks.get(s) || [], now: () => W.clock, log: { log: () => { } } });
  const all = (ut) => { const sn = ut.snapshot(); return [...(sn.open || []), ...(sn.resolved || [])]; };
  W.items = () => all(W.ut).filter((i) => i.action && i.action.type === 'turn-stuck');
  W.open = () => W.items().filter((i) => i.status === 'open');
  W.at = async (m) => { W.clock = 1_800_000_000_000 + m * MIN; return W.watch.sweep(); };
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
  ok(W.open().length === 1 && it.itemKey === `turn-stuck:a:${T0}` && it.sessionKey === 'key:a', 'at the bound: ONE For-you item, keyed per conversation + turn, filed under the conversation', W.items().map((i) => [i.itemKey, i.status]));
  ok(it.i18n.text.key === TW.TEXT.commandAlive && it.i18n.text.params.tool === 'run_command' && it.i18n.text.params.since.at === T0 && /run_command/.test(it.text), 'it names the open tool and since when (an instant the viewer reads in its own zone)', it.i18n);
  ok(/ — Antigravity CLI is running$/.test(it.text) && it.i18n.text.params.cli === 'Antigravity CLI', 'its HEADLINE says the CLI is running (the reader\'s fact — never in a fold)', it.text);
  for (let m = 11; m <= 20; m++) await W.at(m);
  ok(W.items().length === 1 && W.open().length === 1, 'ten more readings: still ONE item, never a second beside it');
}

console.log('— ② it is gone when the turn moves or ends');
{
  W.trees.set(4001, { list: idle });
  W.sidecar('a', { cliWroteAt: T0 + 22 * MIN, turnOpenedAt: T0 });
  await W.at(22);
  ok(W.open().length === 0 && W.items()[0].resolvedBy === 'moved', 'the CLI wrote a line: the item ends «it moved on»', W.items().map((i) => i.resolvedBy));
  for (let m = 23; m <= 32; m++) await W.at(m);
  ok(W.items().length === 1 && W.open().length === 1, 'stuck again in the SAME turn: the same key reopened — one item', W.items().map((i) => [i.itemKey, i.status]));
  W.sessions.get('a')._isStreaming = false;
  await W.at(33);
  ok(W.open().length === 0 && W.items()[0].resolvedBy === 'turn-ended', 'the turn ended: «the turn ended»', W.items()[0].resolvedBy);
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
  ok(c2.length === 1 && c2[0].status === 'open' && c2[0].i18n.text.key === TW.TEXT.silentGone && /is not running$/.test(c2[0].text) && c2[0].id === it.id, '…patched IN PLACE when its words change (the CLI gone — the same item, its words redrawn)', c2.map((i) => [i.status, i.text]));
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
  W.clock = T0 + 10.5 * MIN;
  const r = W.watch.keepWaiting('g');
  ok(r.ok && W.open().length === 0 && W.items()[0].resolvedBy === 'kept-waiting', 'the press resolves the item «kept waiting»', W.items()[0].resolvedBy);
  for (let m = 11; m <= 20; m++) await W.at(m);
  ok(W.open().length === 0, 'nine and a half minutes after the press: nothing said again');
  await W.at(21);
  ok(W.items().length === 1 && W.open().length === 1, 'a full bound after the press with nothing: ONE item again — the same key, never a second', W.items().map((i) => [i.itemKey, i.status]));
  ok(W.watch.keepWaiting('nobody').ok === false && W.watch.keepWaiting('nobody').code === 'not-stuck', 'a press for a turn the watch does not hold is refused by name');
}

console.log('— ⑥ a person\'s ✕ stands for that turn');
{
  const it = W.open()[0];
  W.ut.setStatus(it.id, 'dismissed', 'user');
  for (let m = 22; m <= 40; m++) await W.at(m);
  ok(W.open().length === 0 && W.items().length === 1, 'dismissed by the person: not said again in that turn');
}

console.log('— ⑦ a restart: the item a restart left is ADOPTED; the verdict comes at the second reading');
W = world();
{
  W.session('h'); W.tool('h', 'run_command'); W.sidecar('h', { cliWroteAt: T0, turnOpenedAt: T0 }); W.trees.set(4001, { list: idle });
  for (let m = 0; m <= 10; m++) await W.at(m);
  W.ut.flush && W.ut.flush();
  W.ut = new UserTodoManager({ dataDir: W.utDir, onChange: () => { } });
  W.watch = TWatch.create({ activeSessions: W.sessions, buffersDir: W.buf, getUserTodos: () => W.ut, sessionKeyOf: (s, id) => 'key:' + id, procTree: W.reader, now: () => W.clock, log: { log: () => { } } });
  W.sidecar('h', { cliWroteAt: T0 + 20 * MIN, turnOpenedAt: T0 });
  W.sessions.get('h')._turnOpenSaidAt = null;
  await W.at(60);
  ok(W.open().length === 1, 'the restarted watch\'s first reading: the left item stands (nothing judged on ONE reading)');
  W.sidecar('h', { cliWroteAt: T0, turnOpenedAt: T0 });
  await W.at(61);
  ok(W.items().length === 1 && W.open().length === 1 && W.open()[0].itemKey === `turn-stuck:h:${T0}`, 'the second reading: judged — the SAME item (two turns across a restart read as one)', W.items().map((i) => i.itemKey));
  W.sessions.delete('h');
  await W.at(62);
  ok(W.open().length === 0 && W.items()[0].resolvedBy === 'gone', 'the conversation gone: «the conversation is gone»', W.items()[0].resolvedBy);
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
    const w = TWatch.create({ activeSessions: sessions, buffersDir: dir, getUserTodos: () => ut, sessionKeyOf: (s, id) => 'key:' + id, now: () => Date.now() + skew, log: { log: () => { } } });
    try {
      await sleep(900);
      child.stdin.write(JSON.stringify({ type: 'chat-input', text: `run the ${shape}-command now`, msgId: 'm1' }) + '\n');
      const t0 = Date.now(); while (Date.now() - t0 < 8000 && !(fs.existsSync(log) && /commandPid/.test(fs.readFileSync(log, 'utf8')))) await sleep(20);
      for (const l of fs.readFileSync(log, 'utf8').split('\n')) { try { const o = JSON.parse(l); if (o.commandPid) { own.add(o.commandPid); mine.add(o.commandPid); } } catch { } }
      await sleep(900);
      await w.sweep();                                   // the first reading (now)
      for (const p of (await require(path.join(REPO, 'src/server/proc-tree.js')).createProcTree().readBelow(JSON.parse(fs.readFileSync(path.join(dir, 'x.json'), 'utf8')).childPid)).list) { own.add(p.pid); mine.add(p.pid); }
      await sleep(900);
      skew = 11 * MIN; await w.sweep();                  // the second, eleven minutes on (only the clock moved)
      return { items: [...(ut.snapshot().open || []), ...(ut.snapshot().resolved || [])].filter((i) => i.action && i.action.type === 'turn-stuck'), open: mm.openTool() };
    } finally { try { child.kill('SIGKILL'); } catch { } for (const p of mine) { try { process.kill(p, 'SIGKILL'); } catch { } } }
  };
  const [h, b] = await Promise.all([live('hang'), live('busy')]);
  ok(h.open && h.open.name === 'run_command', 'the REAL ACP message manager answers openTool(): agy\'s open run_command step (the conversation\'s own running tool card)', h.open);
  ok(h.items.length === 1 && h.items[0].i18n.text.key === TW.TEXT.commandAlive && h.items[0].i18n.text.params.tool === 'run_command' && / — Antigravity CLI is running$/.test(h.items[0].text) && /the command is ended by itself at/.test(h.items[0].detail) && h.items[0].action.endable === true, 'hang-command: ONE item — stuck on run_command, Antigravity running, and when it is ended by itself (pick 4: its wrapper serves end-command)', h.items.map((i) => i.text + ' | ' + i.detail));
  ok(b.items.length === 0, 'busy-command: nothing (its command works below agy)', b.items.map((i) => i.text));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
// scripts/test-turn-carry.mjs — CONFIRM, THEN MARK (lane report-mark-on-ack, 2026-11-09). HEAVY: a real http hub in-process
// (the REAL groups engine + delivery ladder + the REAL prompt-context route and its confirm door), the REAL product hook
// (data/bin/vibespace-hook.mjs) spawned the way the CLI spawns it, and the REAL chat-wrapper over the stand-in CLI
// (scripts/fixtures/claude-stand-in-cli.cjs with STAND_IN_PROMPT_HOOK_CMD = that hook — the 2.1.321 hook phase, measured).
// The owner, 2026-11-09: «我看它不是回你了吗？» … «没送进你上下文，那不是你的问题吗？自己看一看。» — a peer's reply was stamped
// «read by» a conversation whose turn never carried it. MEASURED (claude 2.1.321, a loopback mock): the hook gives up its fetch
// at 3 s; a hub that answers later (its main loop stalled) was answered into a closed socket while the route moved the marks —
// the socket looks alive at route time, so only the caller's confirm can tell. A Stop during the hook SIGTERMs it.
//   ① a turn that carries the reply: the hook confirms, THEN the marker moves and the card is drawn
//   ② the hub's loop stalled 4 s when the hook connects: the hook prints nothing and says why on stderr; nothing moves; the
//      journal says «[inject] not carried … waited 4.0 s»; the next turn carries the reply under «sent again»
//   ③ a confirm the hub reads only after a stall still lands (the hook writes it and exits — the turn never waits on it)
//   ④ a Stop during the hook (the CLI's SIGTERM, measured): nothing moves; the next turn carries it
//   ⑤ the hub down: the hook says so, nothing was staged, the next turn carries it
//   ⑤b its stdout closed (acceptance r1, law C): exit 0 and one «no hub context» line naming EPIPE — never a crash
//   ⑤c its answer never taken (acceptance r2, item 4): at its 8 s limit, one line, exit 0
//   ⑨ the two stashes between the stage and the confirm, on the REAL ladder and jobs engine: claims, a live arrival, the cap, two routes, a dropped answer
//   ⑥ RED CONTROL mark-on-send (the confirm switch off, the base's law): the stall LOSES the reply — the incident
//   ⑦ the REAL chat-wrapper + the stand-in running the REAL hook: the turn carries the reply; under a stall the wrapper's
//      log says «this turn carries no hub context: the hub did not answer within 3 s» and the next turn carries it
//   ⑧ the three wrappers that call prompt-context themselves confirm only after their own write (source pins)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
import { stopWrapper } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { createChannelStore } = require(path.join(REPO, 'src/channel-store.js'));
const GE = require(path.join(REPO, 'src/server/groups-engine.js'));
const G = require(path.join(REPO, 'src/channel-groups.js'));
const DELIVER = require(path.join(REPO, 'src/server/conversation-deliver.js'));
const TC = require(path.join(REPO, 'src/turn-carry.js'));
const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
const ad = new ClaudeCodeAdapter({ buffersDir: os.tmpdir() });
const HOOK = path.join(REPO, 'data/bin/vibespace-hook.mjs');
const WRAPPER = path.join(REPO, 'data/bin/chat-wrapper.js');
const STAND_IN = path.join(REPO, 'scripts/fixtures/claude-stand-in-cli.cjs');
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-turn-carry-'));
const atExit = [];
const cleanup = () => { for (const f of atExit.splice(0)) { try { f(); } catch { } } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (f()) return true; await sleep(40); } return false; };
const A = 'aaaaaaaa-1111-4000-8000-0000000000a1', B = 'bbbbbbbb-2222-4000-8000-0000000000b2';
const stall = (ms) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };

/** the hub: the REAL engine + ladder + routes behind a REAL node http server (GET + POST with a JSON body) */
async function hub(name, { AR = require(path.join(REPO, 'src/agent-routes.js')) } = {}) {
  const dataDir = path.join(ROOT, name); fs.mkdirSync(dataDir, { recursive: true });
  const store = createChannelStore({ dir: path.join(dataDir, 'channels') });
  const sessions = new Map();
  const roster = [{ cid: A, name: 'alpha', groups: ['tg1'], reachability: null }, { cid: B, name: 'beta', groups: ['tg1'], reachability: null }];
  for (const r of roster) sessions.set('w-' + r.cid.slice(0, 4), { claudeSessionId: r.cid, name: r.name, mode: 'chat', agentToken: 'vsst_' + r.name, cwd: ROOT, _toolsIntroSeen: true, _mgrIntroSeen: true });
  const cards = [];
  const deliver = DELIVER.create({ dataDir, activeSessions: sessions, serverSetting: () => undefined,
    peerMsg: { findPeer: (cid) => ({ name: cid, socketPath: '/dev/null' }), postToPeer: async () => ({ ok: true }), postChannelEvent: async () => ({ ok: false }) },
    emitPeerCard: (cid, c) => cards.push({ cid, ...c }), authorizeSpend: () => ({ ok: true, identity: { key: 'slot-1' } }), noteSpend: () => {}, releaseSpend: () => {} });
  const eng = GE.create({ store, deliver, broadcast: () => {}, roster: () => roster, groupSetting: () => 'none', log: { info() {}, warn() {}, log() {} } });
  const routes = {};
  const app = { get: (p, h) => { routes['GET ' + p] = h; }, post: (p, h) => { routes['POST ' + p] = h; }, put() {}, delete() {}, use() {} };
  AR.setupAgentRoutes({ app, activeSessions: sessions,
    tasks: { groupsForSession: () => [], _persistRescueLine: () => '', backlogNudgeFor: () => '' },
    sessionStatus: { consumeNotices: () => [], pendingNotices: () => [], get: () => null, rekey() {}, dropNotices() {} }, SessionStatusManager: { renderNotices: () => '', renderNotice: () => '' },
    userTodos: {}, sessionStatusKey: (s) => 'claude:' + s.claudeSessionId, serverSetting: (k) => (k === 'agents.perTurnToolReminder' ? true : undefined),
    integrationEnabled: () => true, scheduleCtxSync() {}, remoteCtxBaseFor: () => null, readUserState: () => ({}), getJobs: () => null, deliver: null, getGroups: () => eng });
  const journal = [];
  const box = { stallOn: new Map(), delayMs: 0, conn: 0 };
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const h = routes[req.method + ' ' + u.pathname];
    if (!h) { res.writeHead(404); res.end('{}'); return; }
    let raw = ''; req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { }
      const run = () => {
        const l = console.log, w = console.warn; console.log = (...a) => journal.push(a.join(' ')); console.warn = console.log;
        try { h({ headers: req.headers, query: Object.fromEntries(u.searchParams), body }, { status(c) { res.statusCode = c; return this; }, json(o) { try { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); } catch { } } }); }
        finally { console.log = l; console.warn = w; }
      };
      if (box.delayMs && req.method === 'GET') setTimeout(run, box.delayMs); else run();
    });
  });
  srv.on('connection', () => { const n = ++box.conn; const ms = box.stallOn.get(n); if (ms) { box.stallOn.delete(n); stall(ms); } });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  atExit.push(() => { try { srv.close(); } catch { } try { deliver.flush(); } catch { } try { store.close(); } catch { } });
  const pair = await eng.sendToAgent({ from: A, to: B, text: `the reply for beta (${name})` });
  return { srv, port: srv.address().port, eng, cards, journal, box, sessions, gid: pair.group.id, at: pair.message.at, text: `the reply for beta (${name})`,
    marker() { return G.memberOf(eng.get(pair.group.id), B).reportedUpTo; },
    close() { try { srv.close(); } catch { } try { deliver.flush(); } catch { } try { store.close(); } catch { } } };
}
/** the product hook as the CLI spawns it: stdin = the UserPromptSubmit input; what it PRINTS is what the turn carries */
function hookRun(port, { killAfterMs = 0 } = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const c = spawn(process.execPath, [HOOK], { env: { PATH: process.env.PATH, VIBESPACE_API: `http://127.0.0.1:${port}`, VIBESPACE_SESSION_TOKEN: 'vsst_beta' }, stdio: ['pipe', 'pipe', 'pipe'] });
    atExit.push(() => { try { c.kill('SIGKILL'); } catch { } });
    let out = '', err = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
    if (killAfterMs) setTimeout(() => { try { c.kill('SIGTERM'); } catch { } }, killAfterMs);   // the CLI's own answer to a Stop (measured)
    c.on('close', (code, signal) => { let ctx = ''; try { ctx = JSON.parse(out).hookSpecificOutput.additionalContext || ''; } catch { } resolve({ ms: Date.now() - t0, code, signal, ctx, err }); });
    c.stdin.end(JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: B, prompt: 'the next turn', transcript_path: '', cwd: ROOT }));
  });
}

console.log('① a turn that carries the reply: the hook confirms, THEN the marker moves');
{
  const h = await hub('carried');
  const r = await hookRun(h.port);
  await until(() => h.marker() !== null, 3000);
  ok(r.ctx.includes(h.text) && r.code === 0 && !r.err, 'the hook printed the reply (what the CLI attaches) and said nothing on stderr', r);
  ok(h.marker() === h.at && h.cards.filter((c) => c.group && c.group.id === h.gid).length === 1, 'its confirm arrived: the marker moved to the reply and ONE card was drawn — the sender reads «read by beta»', { marker: h.marker(), at: h.at, cards: h.cards.length });
  const r2 = await hookRun(h.port);
  ok(!r2.ctx.includes(h.text) && !r2.ctx.includes('sent again'), 'the next turn: nothing repeated');
  h.close();
}

console.log('② the hub\'s main loop stalled 4 s while the hook waits: nothing moves, the next turn carries it');
{
  const h = await hub('stalled');
  h.box.stallOn.set(1, 4000);
  const r = await hookRun(h.port);
  await sleep(200);
  ok(!r.ctx && /vibespace-hook: no hub context this turn — the hub did not answer within 3 s/.test(r.err), 'the hook gave up at 3 s: it printed NOTHING (the turn carries no hub context) and said why on stderr', r);
  ok(h.marker() === null && h.cards.length === 0, 'the route ran after the stall and STAGED the report — the marker did not move, no card was drawn (the sender still reads «waiting»)', { marker: h.marker(), cards: h.cards.length });
  const r2 = await hookRun(h.port);
  await until(() => h.marker() !== null, 3000);
  ok(r2.ctx.startsWith(TC.AGAIN_LINE) && r2.ctx.includes(h.text), 'the next turn carries the reply, under «sent again — the previous turn did not confirm it»', r2.ctx.slice(0, 300));
  ok(h.journal.some((l) => /^\[inject\] not carried: claude:bbbbbbbb-2222-4000-8000-0000000000b2 — the person turn's UserPromptSubmit answer \(\d+ B: group-report\) was not confirmed before the next call; its request had waited 4\.\d s for the hub — the caller gives up at 3 s/.test(l)) && !h.journal.some((l) => l.includes(h.text)),
    'the hub journal COUNTS the drop: «[inject] not carried», the turn kind, how long the request waited, the riders — never the content', h.journal.filter((l) => /inject/.test(l)));
  ok(h.marker() === h.at && h.cards.length === 1, '…and that turn\'s confirm moved the marker, the card drawn once');
  h.close();
}

console.log('③ a confirm the hub reads only after a stall still lands');
{
  const h = await hub('late-confirm');
  h.box.stallOn.set(2, 2000);   // the second connection is the hook's confirm
  const r = await hookRun(h.port);
  ok(r.ctx.includes(h.text) && r.code === 0, 'the hook printed the reply and exited (it never waits on the confirm\'s answer)', { ms: r.ms });
  await until(() => h.marker() !== null, 4000);
  ok(h.marker() === h.at && h.cards.length === 1, 'the confirm, written before the hook exited, is read after the stall — the marker moved, the card drawn');
  h.close();
}

console.log('④ a Stop during the hook (the CLI SIGTERMs it, measured on 2.1.321)');
{
  const h = await hub('stopped');
  h.box.delayMs = 1200;   // a slow route: the hook is still waiting when the Stop lands
  const r = await hookRun(h.port, { killAfterMs: 400 });
  await sleep(1500);
  ok(!r.ctx && r.signal === 'SIGTERM', 'the hook was killed before it got the answer — it printed nothing', r);
  ok(h.marker() === null && h.cards.length === 0, 'the route answered a dead hook: STAGED, nothing moved');
  h.box.delayMs = 0;
  const r2 = await hookRun(h.port);
  await until(() => h.marker() !== null, 3000);
  ok(r2.ctx.startsWith(TC.AGAIN_LINE) && r2.ctx.includes(h.text) && h.marker() === h.at, 'the next turn carries it (under «sent again»), and its confirm moves the marker');
  h.close();
}

console.log('⑤ the hub down (a restart): nothing staged, the next turn carries it');
{
  const h = await hub('down');
  const port = h.port;
  await new Promise((r) => h.srv.close(r));
  const r = await hookRun(port);
  ok(!r.ctx && /no hub context this turn — the hub is unreachable \(ECONNREFUSED\)/.test(r.err), 'the hook says the hub is unreachable (stderr) and prints nothing', r.err);
  ok(h.marker() === null, 'nothing was composed, nothing moved');
}

console.log('⑤b a closed stdout (acceptance r1, law C): the hook says why — never a crash');
{
  const srv = http.createServer((q, r) => { r.setHeader('content-type', 'application/json'); r.end(JSON.stringify({ success: true, context: 'CTX-closed', delivery: 'dl_' + 'c'.repeat(24) })); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const closedRun = (hookPath) => new Promise((resolve) => {
    const c = spawn(process.execPath, [hookPath], { env: { PATH: process.env.PATH, VIBESPACE_API: `http://127.0.0.1:${srv.address().port}`, VIBESPACE_SESSION_TOKEN: 'vsst_beta' }, stdio: ['pipe', 'pipe', 'pipe'] });
    atExit.push(() => { try { c.kill('SIGKILL'); } catch { } });
    c.stdout.destroy();   // the CLI's end of the pipe is gone
    let err = ''; c.stderr.on('data', (d) => { err += d; });
    c.on('close', (code) => resolve({ code, err }));
    c.stdin.end(JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: B, prompt: 'p' }));
  });
  const r = await closedRun(HOOK);
  ok(r.code === 0 && /^vibespace-hook: no hub context this turn — its answer could not be written to the CLI \(EPIPE\)\n$/.test(r.err), 'the hook with its stdout closed: exit 0 and ONE line naming why (EPIPE) — the line the chat wrapper logs', r);
  // RED CONTROL: the r1 hook (no error listener on stdout) crashes on the same pipe
  const MUTH = mutantCopies('turn-carry-hook', REPO);
  const hsrc = fs.readFileSync(HOOK, 'utf8');
  const NEEDLE = "        process.stdout.on('error', () => { });\n";
  if (hsrc.split(NEEDLE).length !== 2) throw new Error('mutation anchor missing: the hook\'s stdout error listener');
  const old = path.join(ROOT, 'hook-no-listener.mjs'); fs.writeFileSync(old, hsrc.replace(NEEDLE, ''));
  const ro = await closedRun(old);
  ok(ro.code !== 0 && /EPIPE/.test(ro.err) && !/no hub context this turn/.test(ro.err), 'RED CONTROL the hook without its stdout listener (r1): an unhandled EPIPE, a non-zero exit, no line', { code: ro.code, lines: ro.err.split('\n').length });
  void MUTH;
  srv.close();
}

console.log('⑤c the hook\'s own 8 s exit (acceptance r2, item 4): a pipe nobody drains, an answer larger than its buffer — said');
{
  const big = 'x'.repeat(300 * 1024);
  const srv = http.createServer((q, r) => { r.setHeader('content-type', 'application/json'); r.end(JSON.stringify({ success: true, context: big, delivery: 'dl_' + 'd'.repeat(24) })); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const t0 = Date.now();
  const res = await new Promise((resolve) => {
    const c = spawn(process.execPath, [HOOK], { env: { PATH: process.env.PATH, VIBESPACE_API: `http://127.0.0.1:${srv.address().port}`, VIBESPACE_SESSION_TOKEN: 'vsst_beta' }, stdio: ['pipe', 'pipe', 'pipe'] });
    atExit.push(() => { try { c.kill('SIGKILL'); } catch { } });
    c.stdout.pause();   // nobody drains it: the write never completes
    let err = ''; c.stderr.on('data', (d) => { err += d; });
    c.on('close', (code) => resolve({ code, err }));
    c.stdin.end(JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: B, prompt: 'p' }));
  });
  srv.close();
  ok(res.code === 0 && /^vibespace-hook: no hub context this turn — the hook stopped at its 8 s limit \(the CLI did not take its answer\)\n$/.test(res.err) && Date.now() - t0 >= 7500, 'the hook whose answer the CLI never takes: at its 8 s limit, exit 0 and ONE line naming why — like the other four cases', { code: res.code, err: res.err, ms: Date.now() - t0 });
}

console.log('⑨ the two stashes between the stage and the confirm — the REAL delivery ladder and the REAL jobs engine (acceptance r2, the unverified items)');
{
  const { JobManager } = require(path.join(REPO, 'src/jobs.js'));
  const dataDir = path.join(ROOT, 'stash9'); fs.mkdirSync(path.join(dataDir, 'jobs'), { recursive: true });
  const sessions = new Map([['w-b9', { claudeSessionId: B, name: 'beta', mode: 'chat', backend: 'claude', agentToken: 'vsst_beta9', cwd: ROOT, _toolsIntroSeen: true, _mgrIntroSeen: true }]]);
  const cards = [];
  const deliver = DELIVER.create({ dataDir, activeSessions: sessions, serverSetting: () => undefined,
    peerMsg: { findPeer: (cid) => ({ name: cid, socketPath: '/dev/null' }), postToPeer: async () => ({ ok: true }), postChannelEvent: async () => ({ ok: false }) },
    emitPeerCard: (cid, c) => cards.push({ cid, ...c }), authorizeSpend: () => ({ ok: true, identity: { key: 'slot-1' } }), noteSpend: () => {}, releaseSpend: () => {} });
  const jm = new JobManager({ dataDir: path.join(dataDir, 'jobs'), broadcast: () => {}, notifyUser: () => {}, log: () => {} });
  jm.init(); for (const t of jm._timers || []) clearInterval(t); jm._timers = [];
  atExit.push(() => { try { deliver.flush(); } catch { } });
  const AR = require(path.join(REPO, 'src/agent-routes.js'));
  const routes = {};
  AR.setupAgentRoutes({ app: { get: (p, h) => { routes['GET ' + p] = h; }, post: (p, h) => { routes['POST ' + p] = h; }, put() {}, delete() {}, use() {} }, activeSessions: sessions,
    tasks: { groupsForSession: () => [], _persistRescueLine: () => '', backlogNudgeFor: () => '' },
    sessionStatus: { consumeNotices: () => [], pendingNotices: () => [], get: () => null, rekey() {}, dropNotices() {} }, SessionStatusManager: { renderNotices: () => '', renderNotice: () => '' },
    userTodos: {}, sessionStatusKey: (s) => 'claude:' + s.claudeSessionId, serverSetting: () => undefined,
    integrationEnabled: () => true, scheduleCtxSync() {}, remoteCtxBaseFor: () => null, readUserState: () => ({}), getJobs: () => jm, deliver, getGroups: () => null });
  const ask = (route) => { let out = null; const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { routes['GET ' + route]({ headers: { authorization: 'Bearer vsst_beta9', 'x-vibespace-confirm': '1' }, query: {}, body: {} }, { json: (o) => { out = o; }, status: () => ({ json: (o) => { out = o; } }) }); } finally { console.log = l; console.warn = w; } return out || {}; };
  const confirm = (delivery) => { let code = 200, out = null; const res = { json: (o) => { out = o; }, status: (c) => { code = c; return res; } }; routes['POST ' + TC.CONFIRM_ROUTE]({ headers: { authorization: 'Bearer vsst_beta9' }, query: {}, body: { delivery } }, res); return { ...(out || {}), status: code }; };
  const P = '/api/agent/prompt-context', T = '/api/agent/task-context';
  const stash = (t) => deliver.stashFor(B, { source: 'agent', kind: 'peer', fromName: 'alpha', text: t });
  const cardsOf = (t) => cards.filter((c) => String(c.text || '').includes(t)).length;
  const inStash = (t) => deliver.stashEntries(B).filter((e) => String(e.text || '').includes(t));
  // S1 — a hand-over claim and a live arrival between the stage and the confirm
  stash('STASH-ONE'); stash('STASH-TWO');
  const a1 = ask(P);
  const claimed = deliver.stashEntries(B).filter((e) => /STASH-(ONE|TWO)/.test(e.text || ''));
  ok(a1.context.includes('STASH-ONE') && a1.context.includes('STASH-TWO') && claimed.length === 2 && claimed.every((e) => e.ho === 'carry') && deliver.stashEntries(B).filter((e) => !e.ho).length === 0 && cardsOf('STASH-ONE') === 0,
    'S1 staged: both entries told, CLAIMED meanwhile (a hand-over sees nothing it may take), no card yet', claimed.map((e) => e.ho));
  stash('STASH-THREE');   // a live delivery landing in the window
  const c1 = confirm(a1.delivery);
  const a2 = ask(P); confirm(a2.delivery);
  ok(c1.status === 200 && cardsOf('STASH-ONE') === 1 && cardsOf('STASH-TWO') === 1 && !inStash('STASH-ONE').length && a2.context.includes('STASH-THREE') && !a2.context.includes('STASH-ONE') && cardsOf('STASH-THREE') === 1,
    'S1 confirmed: exactly the two told are taken (one card each); the one that landed in the window waits and rides the next turn (one card)', { cards: cards.map((c) => c.text) });
  // S2 — the stash cap passes a staged entry by
  stash('STASH-FOUR');
  const b1 = ask(P);
  for (let i = 0; i < 40; i++) stash(`FILL-${i}`);   // over the cap of 30
  const survived = inStash('STASH-FOUR').length === 1;
  confirm(b1.delivery);
  ok(survived && cardsOf('STASH-FOUR') === 1 && !inStash('STASH-FOUR').length, 'S2 the cap evicts the OLDEST unclaimed entries: the staged one, claimed, survives 40 arrivals and is taken by its confirm (one card)');
  for (let n = 0; n < 4; n++) { const d = ask(P); if (d.delivery) confirm(d.delivery); }   // drain the fill
  // S3 — both routes stage the same entry: one card, whichever confirms first
  stash('STASH-FIVE');
  const d1 = ask(P), d2 = ask(T);
  const k1 = confirm(d1.delivery), k2 = confirm(d2.delivery);
  ok(d1.context.includes('STASH-FIVE') && d2.context.includes('STASH-FIVE') && k1.status === 200 && k2.status === 200 && cardsOf('STASH-FIVE') === 1, 'S3 the prompt and SessionStart both carried it and both confirmed: ONE card (a confirm that takes nothing draws nothing)', { cards: cardsOf('STASH-FIVE') });
  // S4 — an answer never confirmed: its claim is released, the next answer takes the entry again
  stash('STASH-SIX');
  const e1 = ask(P);
  const e2 = ask(P);   // e1 dropped
  confirm(e2.delivery);
  ok(e1.context.includes('STASH-SIX') && e2.context.startsWith(TC.AGAIN_LINE) && e2.context.includes('STASH-SIX') && cardsOf('STASH-SIX') === 1 && confirm(e1.delivery).status === 409, 'S4 a dropped answer releases its claim: the next answer carries the entry again under «sent again» and its confirm draws ONE card; the dropped id is refused (409)');
  // J — the jobs stash on the REAL engine: claimed while staged, one card across both routes
  const notif = (t) => { const q = jm.pendingNotifs.get(B) || []; q.push({ jobId: 'jb-nightly', jobName: 'nightly', text: t, ts: Date.now(), urgency: 'low' }); jm.pendingNotifs.set(B, q); };
  notif('NIGHTLY-ONE');
  const j1 = ask(P);
  const held = (jm.pendingNotifs.get(B) || []).find((n) => n.text === 'NIGHTLY-ONE');
  ok(j1.context.includes('NIGHTLY-ONE') && held && held.ho === 'carry', 'J staged: the job notification is told and CLAIMED in the jobs engine meanwhile');
  confirm(j1.delivery);
  ok(!(jm.pendingNotifs.get(B) || []).some((n) => n.text === 'NIGHTLY-ONE') && cardsOf('NIGHTLY-ONE') === 1, 'J confirmed: drained from the engine, one card');
  notif('NIGHTLY-TWO');
  const jp = ask(P), jt = ask(T);
  confirm(jp.delivery); confirm(jt.delivery);
  ok(jp.context.includes('NIGHTLY-TWO') && jt.context.includes('NIGHTLY-TWO') && cardsOf('NIGHTLY-TWO') === 1, 'J both routes carried it and both confirmed: ONE card');
}

console.log('⑥ RED CONTROL: mark-on-send (the confirm switch off — the base\'s law) loses the reply under the same stall');
{
  const MUT = mutantCopies('turn-carry', REPO);
  const src = fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf8');
  const NEEDLE = "turn: turnIsUserInitiated(s) ? 'person' : 'machine', confirm: TC.confirmable(req)";
  if (src.split(NEEDLE).length !== 2) throw new Error('mutation anchor missing: the prompt route\'s confirm switch');
  const ARm = MUT.load('src/agent-routes.js', src.replace(NEEDLE, "turn: turnIsUserInitiated(s) ? 'person' : 'machine', confirm: false"), 'mark-on-send');
  const h = await hub('red', { AR: ARm });
  h.box.stallOn.set(1, 4000);
  const r = await hookRun(h.port);
  await sleep(200);
  const r2 = await hookRun(h.port);
  ok(!r.ctx && h.marker() === h.at && h.cards.length === 1 && !r2.ctx.includes(h.text), 'CONTROL the stalled turn carried nothing, yet the marker moved and the card was drawn («read by»), and the next turn lacks the reply — LOST (the incident)', { first: !!r.ctx, marker: h.marker(), next: r2.ctx.slice(0, 120) });
  h.close();
}

console.log('⑦ the REAL chat-wrapper over the stand-in CLI running the REAL hook (the 2.1.321 hook phase)');
{
  const h = await hub('wrapper');
  const dir = fs.mkdtempSync(path.join(ROOT, 'w-'));
  const dlv = path.join(dir, 'delivered.jsonl');
  const w = spawn(process.execPath, [WRAPPER, path.join(dir, 's.buf'), path.join(dir, 's.json'), process.execPath, STAND_IN], { stdio: ['pipe', 'pipe', 'pipe'],
    env: { PATH: process.env.PATH, HOME: dir, VIBESPACE_API: `http://127.0.0.1:${h.port}`, VIBESPACE_SESSION_TOKEN: 'vsst_beta', CLAUDE_CODE_EMIT_USER_PROMPT_SUBMIT_HOOK_EVENTS: '1', STAND_IN_PROMPT_HOOK_CMD: `"${process.execPath}" "${HOOK}"`, STAND_IN_DELIVERED: dlv, STAND_IN_LONG_MS: '200' } });
  atExit.push(() => { try { w.kill('SIGKILL'); } catch { } });
  w.stdout.on('data', () => {}); w.stderr.on('data', () => {});
  const delivered = () => (fs.existsSync(dlv) ? fs.readFileSync(dlv, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  const wlog = () => { try { return fs.readFileSync(path.join(dir, 'chat-wrapper.log'), 'utf8'); } catch { return ''; } };
  await until(() => fs.existsSync(path.join(dir, 's.json')), 8000);
  // a turn under a 4 s stall: no context, said in the wrapper's log; nothing moves
  h.box.stallOn.set(h.box.conn + 1, 4000);
  w.stdin.write(ad.formatChatInput('first turn', 'm-1').stdinPayload + '\n');
  await until(() => delivered().some((d) => d.how === 'turn' && d.text === 'first turn'), 15000);
  await sleep(300);
  ok(!delivered().some((d) => d.how === 'context') && h.marker() === null, 'the stalled turn ran WITHOUT hub context (the stand-in attached nothing) — and nothing moved', delivered());
  ok(/this turn carries no hub context: the hub did not answer within 3 s — what the hub composed for it is composed again next turn/.test(wlog()), "the wrapper's log says why (the hook's stderr, which never reaches the model)", wlog().split('\n').filter((l) => /hub context/.test(l)));
  w.stdin.write(ad.formatChatInput('second turn', 'm-2').stdinPayload + '\n');
  await until(() => delivered().some((d) => d.how === 'turn' && d.text === 'second turn'), 15000);
  await until(() => h.marker() !== null, 4000);
  const ctx = delivered().filter((d) => d.how === 'context').map((d) => d.text);
  ok(ctx.length === 1 && ctx[0].startsWith(TC.AGAIN_LINE) && ctx[0].includes(h.text), 'the next turn CARRIES the reply (the stand-in attached the hook\'s additionalContext), under «sent again»', ctx.map((c) => c.slice(0, 160)));
  ok(h.marker() === h.at && h.cards.length === 1, '…the hook confirmed it: the marker moved, the card drawn once');
  await stopWrapper(w, { dir });
  h.close();
}

console.log('⑧ the three wrappers that call prompt-context themselves confirm after their own write (ruling 2)');
{
  const rd = (f) => fs.readFileSync(path.join(REPO, 'data/bin', f), 'utf8');
  const codex = rd('codex-chat-wrapper.js'), acp = rd('acp-wrapper.js'), agy = rd('agy-wrapper.js');
  const sends = (s) => /'\/api\/agent\/prompt-context', \{[^}]*'X-VibeSpace-Confirm': '1'/.test(s.replace(/\n\s*/g, ' '));
  ok([codex, acp, agy].every(sends), 'each asks with X-VibeSpace-Confirm (the hub stages its marks)');
  ok(codex.indexOf("contextCarried(data.delivery)") > codex.indexOf("await request('thread/inject_items'") && codex.indexOf("await request('thread/inject_items'") > 0,
    'codex-chat: confirmed only after thread/inject_items answered (the thread holds it)');
  const ia = acp.indexOf("const pr = request('session/prompt'"), ic = acp.indexOf('if (writable && carriedId) contextCarried(carriedId);'), ix = acp.indexOf('if (mine.cancelled) { endPrompt(mine, \'cancelled\', null, opts); return; }');
  ok(ia > 0 && ic > ia && ix > 0 && ix < ia && /carriedId = ctxDelivery; ctxDelivery = null;/.test(acp), 'acp: the turn\'s own id, confirmed only once its prompt is written to the agent — a prompt Stopped before dispatch confirms nothing');
  const gw = agy.indexOf("child.stdin.write(JSON.stringify({ event: 'user', message: { content: body } }) + '\\n');"), gc = agy.indexOf('if (carriedId) contextCarried(carriedId);');
  ok(gw > 0 && gc > gw && /carriedId = ctxDelivery; ctxDelivery = null;/.test(agy), 'agy: the turn\'s own id, confirmed only after its text (which carries the context) is on the agent\'s stdin');
  ok([codex, acp, agy].every((s) => /fetch\(api \+ '\/api\/agent\/prompt-context\/carried', \{ method: 'POST'/.test(s)), 'each returns it to the confirm door (/api/agent/prompt-context/carried)');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

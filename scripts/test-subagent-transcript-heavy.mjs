#!/usr/bin/env node
// test-subagent-transcript-heavy — THE HEAVY TWIN of scripts/test-subagent-transcript.mjs (lane lg-recovery, 主开发 r3142: the fast suite read
// 9.0 s alone against a stated 2.3 s and a bound of 10 s). The two legs that READ BIG or WALK SLOW moved here VERBATIM; the fast
// file keeps every other leg and §T, the pin that this file holds the two and reads the helper:
//   ⑥ WHOLE: an agent past the histories' head + tail bound (2 MiB + 32 MiB, a 37 MB agent) comes back entire; CONTROL: the bounded
//      read hides its middle
//   ⑩b THE BOUND'S WORDS (r2991 (a)): a large healthy projects folder on a slow home (every look 1 ms, the agent's folder listed last)
//      — «the walk … did not finish», nothing marked, the walk goes on and its answer is KEPT (a place: the next ask served; a miss:
//      answered «none» as the release did in the end); RED: the bound that ends every walk (the next ask refused again). And
//      (r3103 (1)) a kept miss never hides a file written at the exact place since; RED: the kept miss asked first
// Over the same stand-in home as the fast file (300 project folders), the REAL route and the transcript pool's REAL workers.
// Run: node scripts/test-subagent-transcript-heavy.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { anchored, scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new TypeError(`ok(cond, name): the name is a ${typeof n}, not a string — the arguments are swapped`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e === undefined ? '' : ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 700))); } };
const J = (x) => JSON.stringify(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REAL = { log: console.log, warn: console.warn, error: console.error };
const quiet = () => { console.warn = () => {}; console.error = () => {}; };
const loud = () => { console.warn = REAL.warn; console.error = REAL.error; };

// ── the stand-in home: a scratch home (HOME pointed at it: every road reads the home at its call) with 300 project folders ──
const HOME0 = scratch('subagent-transcript-home'); fs.mkdirSync(HOME0, { recursive: true });
const HOME = fs.realpathSync(HOME0);   // its real path: the helper answers real paths (r2865)
process.env.HOME = HOME;
const PROJ = path.join(HOME, '.claude', 'projects');
const { cwdToProjectDir } = require(path.join(REPO, 'src/session-store.js'));
const CWD = '/home/userL/work/app', OTHER_CWD = '/home/userL/work/elsewhere';
const SID = '0b5e7c1a-1111-4222-8333-944455556666';
fs.rmSync(PROJ, { recursive: true, force: true });
for (let i = 0; i < 298; i++) fs.mkdirSync(path.join(PROJ, `-home-userL-proj-${String(i).padStart(4, '0')}`), { recursive: true });
const SUB = path.join(PROJ, cwdToProjectDir(CWD), SID, 'subagents'), SUB_OTHER = path.join(PROJ, cwdToProjectDir(OTHER_CWD), SID, 'subagents');
fs.mkdirSync(SUB, { recursive: true }); fs.mkdirSync(SUB_OTHER, { recursive: true });
const rec = (i, pad) => {
  const ts = new Date(Date.UTC(2026, 10, 22, 10, 0, i % 60)).toISOString();
  if (i % 3 === 0) return { type: 'user', uuid: `u-${i}`, timestamp: ts, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `t-${i - 1}`, content: 'a line of a file '.repeat(pad) }] } };
  if (i % 3 === 1) return { type: 'assistant', uuid: `a-${i}`, timestamp: ts, message: { role: 'assistant', model: 'stand-in', content: [{ type: 'text', text: 'the agent reasons about its next step. '.repeat(pad) }, { type: 'tool_use', id: `t-${i}`, name: 'Read', input: { file_path: `/home/userL/work/app/src/f${i}.js` } }] } };
  return { type: 'assistant', uuid: `b-${i}`, timestamp: ts, message: { role: 'assistant', model: 'stand-in', content: [{ type: 'text', text: 'a short answer. '.repeat(pad) }] } };
};
/** an agent's transcript of about `mb` MB (records of about `pad` × 40 bytes) + its meta; → { fp, lines } */
const agent = (dir, id, mb, pad = 40) => {
  const fp = path.join(dir, `agent-${id}.jsonl`), out = []; let size = 0, i = 0;
  while (size < mb * 1e6) { const l = J(rec(i++, pad)) + '\n'; out.push(l); size += l.length; }
  fs.writeFileSync(fp, out.join('')); fs.writeFileSync(fp.replace('.jsonl', '.meta.json'), J({ agentType: 'general-purpose', description: `stand-in ${id}` }));
  return { fp, lines: i };
};
const A5 = 'a5000000000000a5', BW = 'b0000000000000b1';
const a5 = agent(SUB, A5, 5);
agent(SUB_OTHER, BW, 0.3);   // found only by the walk (the viewer names the conversation's own cwd)
const STORM = Array.from({ length: 7 }, (_, k) => `c0000000000000${String(k).padStart(2, '0')}`);
for (const id of STORM) agent(SUB, id, 0.4);

// ── counting the main thread's fs calls under the projects root (never a clock) ──
let counting = false;
const SYNC = [], ASYNC = [];
for (const fn of ['readdirSync', 'readFileSync', 'existsSync', 'statSync', 'lstatSync', 'openSync']) {
  const real = fs[fn];
  fs[fn] = function (p, ...a) { if (counting && typeof p === 'string' && p.startsWith(PROJ)) SYNC.push([fn, p]); return real.call(this, p, ...a); };
}
for (const fn of ['readdir', 'stat']) {
  const real = fs.promises[fn];
  fs.promises[fn] = function (p, ...a) { if (counting && typeof p === 'string' && p.startsWith(PROJ)) ASYNC.push([fn, p]); return real.call(this, p, ...a); };
}
const counted = async (fn) => { SYNC.length = 0; ASYNC.length = 0; counting = true; try { return await fn(); } finally { counting = false; } };
const syncOf = (fn) => SYNC.filter(([f]) => f === fn).length;
const wholeReads = () => SYNC.filter(([f, p]) => f === 'readFileSync' && p.endsWith('.jsonl')).length;

// ── the REAL ws-handler on a fake wss (test-layout-stopped-window's harness) ──
const WSH_PATH = path.join(REPO, 'src/ws-handler.js');
const T = require(path.join(REPO, 'src/server/subagent-transcript.js'));
const CX = require(path.join(REPO, 'src/adapters/codex.js'));
const { MessageManager } = require(path.join(REPO, 'src/message-manager.js'));
function hub(WSH, extra = {}) {
  // ws-handler takes path / fs / os from its ctx: the hub's own modules (this fs is the counted one)
  const ctx = new Proxy({ path, fs, os, hosts: null, ...extra, telemetry: { record() {} }, activeSessionsPayload: () => [], serverNotice: () => {}, activeSessions: new Map(), WS_OPEN: 1, readLayouts: () => ({}), writeLayouts: () => {} }, { has: () => true, get: (t, k) => (k in t ? t[k] : undefined) });
  const on = {};
  const wss = { _heartbeatTimer: true, clients: new Set(), on: (ev, fn) => { on[ev] = fn; } };
  WSH.registerWsHandler(wss, ctx);
  const connect = () => {
    const h = {}, frames = [];
    const sock = { readyState: 1, send: (s) => frames.push(JSON.parse(s)), on: (ev, fn) => { h[ev] = fn; } };
    wss.clients.add(sock); quiet(); try { on.connection(sock); } finally { loud(); }
    return { frames, send: (m) => { quiet(); try { return h.message(J(m)); } finally { loud(); } } };
  };
  return { connect };
}
const attachOf = async (H, agentId, { cwd = CWD, sock = null, sid = SID, more = {} } = {}) => {
  const s = sock || H.connect();
  const sessionId = `sub-agent-${agentId}`, before = s.frames.length;   // the frames this attach caused (a connection may say things first)
  s.send({ type: 'attach', sessionId, parentSessionId: null, claudeSessionId: sid, cwd, ...more });
  const mine = () => s.frames.slice(before).filter((x) => x.sessionId === sessionId);
  for (let i = 0; i < 600; i++) { const f = mine().find((x) => x.type === 'attached' || x.type === 'error'); if (f) return { frame: f.type === 'attached' ? f : null, frames: mine() }; await sleep(25); }   // an error ends the wait (a red, never 15 s)
  return { frame: null, frames: mine() };
};
/** the RELEASE's cards for an agent: its read, split and parse (the attach kept user / assistant / result) and the same conversion */
const releaseCards = async (fp, { attach = true, id = 'ref' } = {}) => {
  const raw = [];
  for (const line of fs.readFileSync(fp, 'utf-8').split('\n')) { try { const m = JSON.parse(line.trim()); if (!attach || m.type === 'user' || m.type === 'assistant' || m.type === 'result') raw.push(m); } catch { } }
  const mm = new MessageManager(id); await mm.convertHistoryAsync(raw); return { messages: mm.messages, total: mm.total };
};
const MUT = mutantCopies('subagent-transcript', REPO);
const WSH_SRC = fs.readFileSync(WSH_PATH, 'utf-8');
const HELPER_CALL = (() => { const a = WSH_SRC.indexOf("              const got = aimed ? { fp: null, refused: aimedWords, said: aimedSaid } : await require('./server/subagent-transcript').agentTranscript("); if (a < 0) return 'THE HELPER CALL'; const b = WSH_SRC.indexOf('\n', WSH_SRC.indexOf('              else if (got.fp) {', a)); return WSH_SRC.slice(a, b + 1); })();

// the REAL route, mounted as the fast file's ⑤ mounts it (⑩b asks it)
let ROUTE = null, ASK = null;
{
  const ctx = { activeSessions: new Map(), webuiPids: new Set(), refreshWebuiPids: () => {}, createSessionMessages: () => null, BUFFERS_DIR: path.join(HOME, 'buffers'), PERMISSION_MODES: [], hosts: null, serverSetting: () => null };
  const routeOf = (S) => { S.setup(ctx); const l = S.router.stack.find((x) => x.route && x.route.path === '/api/subagent-messages'); return l.route.stack[0].handle; };
  const ask = (h, q) => new Promise((resolve) => { const res = { code: 200 }; res.status = (c) => { res.code = c; return res; }; res.json = (o) => { res.body = o; resolve(res); return res; }; Promise.resolve(h({ query: q }, res)).catch((e) => resolve({ code: 'threw', body: String(e) })); });
  const S = require(path.join(REPO, 'src/routes/sessions.js'));
  ROUTE = routeOf(S); ASK = ask;
}

console.log('⑩b THE BOUND\'S WORDS (主开发 r2991 (a)) — a large healthy projects folder on a slow home: «did not finish», the walk goes on, its answer kept');
{
  const realRp = fs.promises.realpath, realRd = fs.promises.readdir;
  const LAST = cwdToProjectDir(OTHER_CWD);   // BW's folder, listed LAST (a placement: the walk reaches it past the bound)
  const slow = () => new Promise((r) => setTimeout(r, 1));   // ~600 looks a walk: well past the 0.2 s bound, no look near half of it
  fs.promises.realpath = async function (p, ...a) { if (typeof p === 'string' && p.startsWith(PROJ)) await slow(); return realRp.call(fs.promises, p, ...a); };
  fs.promises.readdir = async function (p, ...a) { if (typeof p === 'string' && p.startsWith(PROJ)) await slow(); const names = await realRd.call(fs.promises, p, ...a); return p === PROJ ? [...names.filter((n) => n !== LAST), ...names.filter((n) => n === LAST)] : names; };
  const settle = async (M) => { for (let i = 0; i < 1000 && M.stats().walking > 0; i++) await sleep(10); };   // (a count: until the walk that went on has ended)
  try {
    T._resetForTest(); T._setFindBoundForTest(200);
    const r1 = await ASK(ROUTE, { claudeSessionId: SID, cwd: CWD, agentId: BW });
    const marked1 = T.stats().marked;
    await settle(T);
    const k0 = T.stats().kept;
    const r2 = await ASK(ROUTE, { claudeSessionId: SID, cwd: CWD, agentId: BW });
    ok(r1.code === 503 && /the walk of the projects folder did not finish within 0\.2 s/.test(r1.body.refused || '') && marked1 === 0, `a walk past the bound with every look answering is said as a walk that did not finish, never as a folder that did not answer; nothing marked («${r1.body.refused}», marked ${marked1})`);
    ok(r2.code === 200 && (r2.body.messages || []).length > 0 && T.stats().kept === k0 + 1, `…it went on, and the next ask is served from the place it kept (${r2.code}, ${(r2.body.messages || []).length} cards)`);
    const NONE = 'e0000000000000ee';
    const r3 = await ASK(ROUTE, { claudeSessionId: SID, cwd: CWD, agentId: NONE });
    await settle(T);
    const r4 = await ASK(ROUTE, { claudeSessionId: SID, cwd: CWD, agentId: NONE });
    ok(/did not finish/.test(r3.body.refused || '') && r4.code === 200 && (r4.body.messages || []).length === 0 && !r4.body.refused, `…an agent that is nowhere: the walk past the bound ends finding nothing, and the next ask is answered «none», as the release answered in the end (${r4.code}${r4.body.refused ? ', «' + r4.body.refused + '»' : ''})`);
    // r3103 (1): the kept miss is asked only AFTER the kept and exact places — the agent's file written at the exact place since is found at once
    agent(SUB, NONE, 0.02);
    const r5 = await ASK(ROUTE, { claudeSessionId: SID, cwd: CWD, agentId: NONE });
    ok(r5.code === 200 && (r5.body.messages || []).length > 0, `…and once its file is written at the conversation's own folder, the next ask finds it at once — the kept miss never hides it (${r5.code}, ${(r5.body.messages || []).length} cards)`);
    // RED: the bound as it was (05d3d860d) — any look out at the bound ends the walk and names its folder; the next ask walks again
    const HSRC = fs.readFileSync(path.join(REPO, 'src/server/subagent-transcript.js'), 'utf-8');
    const cut = MUT.load('src/server/subagent-transcript.js', anchored(HSRC, '  const stalled = !!out && Date.now() - out.at >= findBoundMs / 2;\n', '  const stalled = !!out;\n', 'the bound\'s words'), 'bound-cuts');
    cut._setFindBoundForTest(200);
    const c1 = await cut.agentTranscript({ claudeSessionId: SID, agentId: BW, exactDir: path.join(PROJ, cwdToProjectDir(CWD)), root: PROJ });
    for (let i = 0; i < 300 && cut.stats().marked > 0; i++) await sleep(10);
    const c2 = await cut.agentTranscript({ claudeSessionId: SID, agentId: BW, exactDir: path.join(PROJ, cwdToProjectDir(CWD)), root: PROJ });
    ok(/did not answer/.test(c1.refused || '') && !!c2.refused && !c2.records, `RED CONTROL: the bound that ends every walk names a folder that answered («${c1.refused}») and refuses the next ask again («${c2.refused}») — the legs above would be RED`);
    // RED (r3103 (1)): the kept miss asked FIRST (before the kept and exact places), planted in a copy — the file written since stays hidden
    const missFirst = MUT.load('src/server/subagent-transcript.js', anchored(anchored(HSRC,
      '  const missedAt = _missedPast.get(ctx.ask);\n  if (missedAt !== undefined) { if (Date.now() - missedAt < MISS_KEPT_MS) return { fp: null }; _missedPast.delete(ctx.ask); }\n', '', 'the kept miss after the exact place'),
      '  let walk = _walks.get(ask);\n', '  const missedAt = _missedPast.get(ask);\n  if (missedAt !== undefined && Date.now() - missedAt < MISS_KEPT_MS) return { fp: null };\n  let walk = _walks.get(ask);\n', 'the kept miss asked first'), 'miss-first');
    missFirst._setFindBoundForTest(200);
    const NONE2 = 'e0000000000000ed', mopts = { claudeSessionId: SID, agentId: NONE2, exactDir: path.join(PROJ, cwdToProjectDir(CWD)), root: PROJ };
    await missFirst.agentTranscript(mopts); await settle(missFirst);
    agent(SUB, NONE2, 0.02);
    const mf = await missFirst.agentTranscript(mopts);
    ok(!mf.fp, `RED CONTROL: a copy that asks the kept miss first answers «none» for a file written at the exact place since (found ${mf.fp}) — the leg above would be RED`);
  } finally { fs.promises.realpath = realRp; fs.promises.readdir = realRd; T._resetForTest(); }
}

console.log('⑥ WHOLE — an agent past the histories\' head + tail bound (2 MiB + 32 MiB) comes back entire');
{
  T._resetForTest();
  const big = agent(SUB, 'd00000000000000d', 37, 400);   // 37 MB > 2 MiB + 32 MiB = 35.65 MB, the bound
  const got = await T.agentTranscript({ claudeSessionId: SID, agentId: 'd00000000000000d', exactDir: path.join(PROJ, cwdToProjectDir(CWD)), root: PROJ });
  ok(got.records && got.records.length === big.lines && got.records[0].uuid === 'u-0' && got.records[big.lines - 1].uuid === rec(big.lines - 1, 1).uuid, `every one of its ${big.lines} records, the first and the last (${(got.records || []).length})`);
  const bounded = await CX.readJsonlBoundedParsedPagedAsync(big.fp, { tailOnly: false, slot: 'subagent' });
  ok(Array.isArray(bounded) && bounded.length < big.lines, `CONTROL: the histories' bounded read of the same file keeps ${(bounded || []).length} of its ${big.lines} records — without \`whole\` the viewer would hide its middle`);
  fs.rmSync(big.fp, { force: true });
}

console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass} passed${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);

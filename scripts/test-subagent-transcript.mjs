#!/usr/bin/env node
// test-subagent-transcript — A FINISHED AGENT'S TRANSCRIPT, FOUND AND READ OFF THE HUB'S LOOP (lane lg-recovery, 主开发 r2350 / r2374;
// B-299b's law: no byte of a harness transcript is listed, read or split on the hub's main thread). ONE helper
// (src/server/subagent-transcript.js) serves the sub-agent viewer's WebSocket attach of `sub-agent-<id>` (src/ws-handler.js — what a
// person meets, at every open and every re-attach) and GET /api/subagent-messages (src/routes/sessions.js). Over a stand-in home
// (300 project folders), the REAL ws-handler on a fake socket and the REAL route, the transcript pool's REAL workers:
//   ① THE ATTACH of a 5 MB agent answers the release's cards and makes ZERO synchronous listings and ZERO whole-file reads on the
//      loop (counted at the fs calls of the main thread, never timed); RED: a copy whose attach walks and reads as the release did
//   ② THE PLACE KEPT: an agent found by the walk is asked next with no listing at all; RED: a copy that keeps nothing
//   ③ TEN WINDOWS RE-ATTACHED AT ONCE: each acked first, each answered with its own agent; ONE read at a time, asks of one file
//      sharing its read; RED: a copy that reads them all at once
//   ④ THE POOL REFUSING (its heap bound): the window is told by name (`loadRefused`), nothing read on the loop; RED: a copy that
//      falls back to a read on the loop
//   ⑤ THE ROUTE'S SAME: the release's cards, zero listings / whole reads on the loop, a refusal 503 by name; RED: a copy of the
//      release's route
//   ⑥ WHOLE: an agent past the histories' head + tail bound (2 MiB + 32 MiB) comes back entire; CONTROL: the bounded read hides its middle
// Run: node scripts/test-subagent-transcript.mjs
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
const HOME = scratch('subagent-transcript-home');
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
function hub(WSH) {
  // ws-handler takes path / fs / os from its ctx: the hub's own modules (this fs is the counted one)
  const ctx = new Proxy({ path, fs, os, hosts: null, telemetry: { record() {} }, activeSessionsPayload: () => [], serverNotice: () => {}, activeSessions: new Map(), WS_OPEN: 1, readLayouts: () => ({}), writeLayouts: () => {} }, { has: () => true, get: (t, k) => (k in t ? t[k] : undefined) });
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
const attachOf = async (H, agentId, { cwd = CWD, sock = null } = {}) => {
  const s = sock || H.connect();
  const sessionId = `sub-agent-${agentId}`, before = s.frames.length;   // the frames this attach caused (a connection may say things first)
  s.send({ type: 'attach', sessionId, parentSessionId: null, claudeSessionId: SID, cwd });
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
const HELPER_CALL = (() => { const a = WSH_SRC.indexOf("              const got = await require('./server/subagent-transcript').agentTranscript("); if (a < 0) return 'THE HELPER CALL'; const b = WSH_SRC.indexOf('\n', WSH_SRC.indexOf('              else if (got.fp) {', a)); return WSH_SRC.slice(a, b + 1); })();

console.log('① THE ATTACH — a 5 MB agent, 300 project folders: the release\'s cards, nothing listed or read whole on the loop');
{
  T._resetForTest();
  const H = hub(require(WSH_PATH));
  const ref = await releaseCards(a5.fp, { id: `sub-agent-${A5}` });
  const r = await counted(() => attachOf(H, A5));
  const f = r.frame || {};
  ok(r.frames[0] && r.frames[0].type === 'attach-ack', 'the attach is acked first (the window waits, it never concludes the session is gone)', r.frames.slice(0, 2).map((x) => x.type));
  ok(f.messages && J(f.messages) === J(ref.messages) && f.totalCount === ref.total && f.meta && f.meta.description === `stand-in ${A5}`, `the window gets the release's cards for it (${(f.messages || []).length} of ${ref.messages.length}) and its meta`);
  ok(syncOf('readdirSync') === 0 && wholeReads() === 0 && SYNC.length === 0, `ZERO synchronous listings and ZERO whole-file reads on the loop (${SYNC.length} sync call(s) under the projects root: ${J(SYNC.slice(0, 3))})`);
  ok(T.stats().reads === 1 && T.stats().exact === 1 && CX.pagedReadStats().pages >= 1, `read once, through the transcript pool's pages (${J(T.stats())})`);
  // RED: the release's road, planted in a copy (the attach walks and reads on the loop)
  const RELEASE = `              const subDirs = [path.join(projectsDir, cwdToProjectDir(cwd), claudeId, 'subagents')]; /* stale-pins: kept — the release's attach road, planted as this leg's RED control */
              try { for (const dir of fs.readdirSync(projectsDir)) { const fp = path.join(projectsDir, dir, claudeId, 'subagents'); if (!subDirs.includes(fp)) subDirs.push(fp); } } catch {}
              const fileCandidates = [...pulled];
              for (const subDir of subDirs) { fileCandidates.push(path.join(subDir, \`agent-\${agentId}.jsonl\`)); let wfRuns = []; try { wfRuns = fs.readdirSync(path.join(subDir, 'workflows')); } catch {} for (const wf of wfRuns) fileCandidates.push(path.join(subDir, 'workflows', wf, \`agent-\${agentId}.jsonl\`)); }
              for (const fp of fileCandidates) { try { if (!fs.existsSync(fp)) continue; for (const line of fs.readFileSync(fp, 'utf-8').split('\\n')) { try { const m = JSON.parse(line.trim()); if (m.type === 'user' || m.type === 'assistant' || m.type === 'result') rawMsgs.push(m); } catch {} } try { meta = JSON.parse(fs.readFileSync(fp.replace('.jsonl', '.meta.json'), 'utf-8')); } catch {} break; } catch {} }
`;
  const red = MUT.load('src/ws-handler.js', anchored(WSH_SRC, HELPER_CALL, RELEASE, 'the attach through the helper'), 'release-attach');
  const R = await counted(() => attachOf(hub(red), A5));
  ok(R.frame && J(R.frame.messages) === J(ref.messages) && syncOf('readdirSync') >= 290 && wholeReads() === 1,
    `RED CONTROL: the release's attach answers the same cards with ${syncOf('readdirSync')} synchronous listings and ${wholeReads()} whole read on the loop — the leg above would be RED`);
}

console.log('② THE PLACE KEPT — found by the walk once, asked next with no listing');
{
  T._resetForTest();
  const H = hub(require(WSH_PATH));
  const first = await counted(() => attachOf(H, BW));
  const walked = ASYNC.filter(([f]) => f === 'readdir').length;
  const second = await counted(() => attachOf(H, BW));
  const again = ASYNC.filter(([f]) => f === 'readdir').length, stats2 = ASYNC.filter(([f]) => f === 'stat').length;
  ok(first.frame && first.frame.messages.length > 0 && walked >= 1 && SYNC.length === 0 && T.stats().walked === 1, `an agent outside the cwd's folder is found by the walk — asynchronous (${walked} listings off the loop until it was found, none synchronous: ${SYNC.length})`);
  ok(second.frame && J(second.frame.messages) === J(first.frame.messages) && again === 0 && stats2 === 1 && T.stats().kept === 1, `the next ask is ONE stat of the kept place (${stats2} stat, ${again} listings)`);
  const noKeep = MUT.load('src/server/subagent-transcript.js', anchored(fs.readFileSync(path.join(REPO, 'src/server/subagent-transcript.js'), 'utf-8'), 'const keep = (key, fp) => { _places.delete(key); _places.set(key, fp);', 'const keep = (key, fp) => { _places.delete(key);', 'the place kept'), 'no-keep');
  const look = async () => counted(() => noKeep.findAgentTranscript({ claudeSessionId: SID, agentId: BW, exactDir: path.join(PROJ, cwdToProjectDir(CWD)), root: PROJ }));
  await look(); const lookAgain = await look(); const twice = ASYNC.filter(([f]) => f === 'readdir').length;
  ok(lookAgain.fp && twice >= 1, `RED CONTROL: a copy that keeps nothing walks again at the next ask (${twice} listings) — the leg above would be RED`);
}

console.log('③ TEN WINDOWS RE-ATTACHED AT ONCE — each acked first and answered with its own agent; one read at a time, one file read once');
{
  T._resetForTest();
  const H = hub(require(WSH_PATH));
  const ids = [...STORM, STORM[0], STORM[1], STORM[2]];   // seven agents, three of them in two windows
  const socks = ids.map(() => H.connect());
  const outs = await counted(() => Promise.all(ids.map((id, k) => attachOf(H, id, { sock: socks[k] }))));
  const refs = await Promise.all(STORM.map(async (id) => [id, await releaseCards(path.join(SUB, `agent-${id}.jsonl`), { id: `sub-agent-${id}` })]));
  const refOf = new Map(refs);
  const st = T.stats();
  ok(outs.every((o) => o.frames[0] && o.frames[0].type === 'attach-ack'), 'every window is acked at once (its first frame), whatever its place in the queue');
  ok(outs.every((o, k) => o.frame && J(o.frame.messages) === J(refOf.get(ids[k]).messages)), 'every window is answered with ITS agent\'s cards');
  ok(st.maxInFlight === 1 && st.shared >= 1 && st.reads + st.shared === ids.length, `ONE read at a time (at most ${st.maxInFlight} in flight, ${st.maxWaiting} waiting), ${st.reads} reads for ${ids.length} windows (${st.shared} shared a read of the same file)`);
  ok(SYNC.length === 0, `nothing listed or read whole on the loop through the storm (${SYNC.length})`);
  const allAtOnce = MUT.load('src/server/subagent-transcript.js', anchored(fs.readFileSync(path.join(REPO, 'src/server/subagent-transcript.js'), 'utf-8'), 'const p = _chain.then(run, run);', 'const p = run();', 'one read at a time'), 'all-at-once');
  await Promise.all(STORM.map((id) => allAtOnce.agentTranscript({ claudeSessionId: SID, agentId: id, exactDir: path.join(PROJ, cwdToProjectDir(CWD)), root: PROJ })));
  ok(allAtOnce.stats().maxInFlight > 1, `RED CONTROL: a copy without the one-at-a-time chain had ${allAtOnce.stats().maxInFlight} reads in flight at once — the leg above would be RED`);
}

console.log('④ THE POOL REFUSING — said by name in the window, nothing read on the loop');
{
  T._resetForTest();
  const H = hub(require(WSH_PATH));
  CX._setHistoryHeapMbForTest(1);
  let r;
  try { r = await counted(() => attachOf(H, STORM[3])); } finally { CX._setHistoryHeapMbForTest(768); }
  const f = r.frame || {};
  ok(f.loadRefused && /heap bound/.test(f.loadRefused) && (f.messages || []).length === 0, `the window is told by name — «${String(f.loadRefused || '').slice(0, 90)}»`);
  ok(wholeReads() === 0 && syncOf('readdirSync') === 0 && T.stats().refused === 1, `nothing read on the loop instead (${wholeReads()} whole reads, ${syncOf('readdirSync')} listings)`);
  const src = fs.readFileSync(path.join(REPO, 'src/server/subagent-transcript.js'), 'utf-8');
  const fallback = MUT.load('src/server/subagent-transcript.js', anchored(src, "if (!Array.isArray(records)) { _stats.refused++; return { refused: why || 'the transcript pool did not answer' }; }", "if (!Array.isArray(records)) { const fsx = require('fs'); return { records: fsx.readFileSync(fp, 'utf-8').split('\\n').filter(Boolean).map((l) => JSON.parse(l)), meta: {} }; }", 'the refusal'), 'loop-fallback');
  CX._setHistoryHeapMbForTest(1);
  try { await counted(() => fallback.agentTranscript({ claudeSessionId: SID, agentId: STORM[3], exactDir: path.join(PROJ, cwdToProjectDir(CWD)), root: PROJ })); } finally { CX._setHistoryHeapMbForTest(768); }
  ok(wholeReads() === 1, `RED CONTROL: a copy that falls back when the pool refuses reads the whole file on the loop (${wholeReads()}) — the leg above would be RED`);
}

console.log('⑤ THE ROUTE\'S SAME — GET /api/subagent-messages through the helper');
{
  T._resetForTest();
  const ctx = { activeSessions: new Map(), webuiPids: new Set(), refreshWebuiPids: () => {}, createSessionMessages: () => null, BUFFERS_DIR: path.join(HOME, 'buffers'), PERMISSION_MODES: [], hosts: null, serverSetting: () => null };
  const routeOf = (S) => { S.setup(ctx); const l = S.router.stack.find((x) => x.route && x.route.path === '/api/subagent-messages'); return l.route.stack[0].handle; };
  const ask = (h, q) => new Promise((resolve) => { const res = { code: 200 }; res.status = (c) => { res.code = c; return res; }; res.json = (o) => { res.body = o; resolve(res); return res; }; Promise.resolve(h({ query: q }, res)).catch((e) => resolve({ code: 'threw', body: String(e) })); });
  const S = require(path.join(REPO, 'src/routes/sessions.js'));
  const route = routeOf(S);
  const ref = await releaseCards(a5.fp, { attach: false, id: `sub-agent-${A5}` });
  const r = await counted(() => ask(route, { claudeSessionId: SID, cwd: CWD, agentId: A5 }));
  ok(r.code === 200 && J(r.body.messages) === J(ref.messages) && r.body.total === ref.total, `the route answers the release's cards (${(r.body.messages || []).length})`);
  ok(SYNC.length === 0, `ZERO synchronous listings and whole-file reads on the loop (${SYNC.length})`);
  CX._setHistoryHeapMbForTest(1);
  let ref2;
  try { T._resetForTest(); ref2 = await counted(() => ask(route, { claudeSessionId: SID, cwd: CWD, agentId: A5 })); } finally { CX._setHistoryHeapMbForTest(768); }
  ok(ref2.code === 503 && /heap bound/.test(ref2.body.refused || '') && /could not be read here/.test(ref2.body.error || '') && wholeReads() === 0, `a pool that refuses: 503 by name, nothing read on the loop («${String(ref2.body.error || '').slice(0, 80)}»)`);
  // RED: the release's route, planted in a copy of the module
  const SRC = fs.readFileSync(path.join(REPO, 'src/routes/sessions.js'), 'utf-8');
  const a = SRC.indexOf("      const got = await require('../server/subagent-transcript').agentTranscript("), b = SRC.indexOf("      return res.json({ messages: mm.messages, total: mm.total, meta: got.meta || {} });", a);
  const NEW_BODY = a >= 0 && b > a ? SRC.slice(a, b + "      return res.json({ messages: mm.messages, total: mm.total, meta: got.meta || {} });".length) : 'THE ROUTE THROUGH THE HELPER';
  const OLD_BODY = `      const fsx = require('fs'); const subDirs = []; if (cwd) subDirs.push(path.join(projectsDir, cwdToProjectDir(String(cwd)), claudeSessionId, 'subagents')); /* stale-pins: kept — the release's route, planted as this leg's RED control */
      try { for (const dir of fsx.readdirSync(projectsDir)) { const sd = path.join(projectsDir, dir, claudeSessionId, 'subagents'); if (!subDirs.includes(sd)) subDirs.push(sd); } } catch {}
      const candidates = []; for (const sd of subDirs) { candidates.push(path.join(sd, \`agent-\${agentId}.jsonl\`)); let wfRuns = []; try { wfRuns = fsx.readdirSync(path.join(sd, 'workflows')); } catch {} for (const wf of wfRuns) candidates.push(path.join(sd, 'workflows', wf, \`agent-\${agentId}.jsonl\`)); }
      for (const filePath of candidates) { if (!fsx.existsSync(filePath)) continue; const rawMsgs = []; for (const line of fsx.readFileSync(filePath, 'utf-8').split('\\n')) { const t = line.trim(); if (!t) continue; try { rawMsgs.push(JSON.parse(t)); } catch {} } const mm = createMessageManager('claude', \`sub-agent-\${agentId}\`); mm.convertHistory(rawMsgs); return res.json({ messages: mm.messages, total: mm.total, meta: {} }); }
      return res.json({ messages: [], total: 0, meta: {} });`;
  const redS = MUT.load('src/routes/sessions.js', anchored(SRC, NEW_BODY, OLD_BODY, 'the route through the helper'), 'release-route');
  const rr = await counted(() => ask(routeOf(redS), { claudeSessionId: SID, cwd: CWD, agentId: A5 }));
  ok(rr.code === 200 && J(rr.body.messages) === J(ref.messages) && syncOf('readdirSync') >= 290 && wholeReads() === 1, `RED CONTROL: the release's route answers the same cards with ${syncOf('readdirSync')} synchronous listings and ${wholeReads()} whole read on the loop — the leg above would be RED`);
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

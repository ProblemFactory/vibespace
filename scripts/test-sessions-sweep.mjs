#!/usr/bin/env node
// THE SESSIONS SWEEP OFF THE LOOP (B-891e's named cause — B-360d ranks 12c + 9, lane bl-loop-a, 2026-11-18). Measured on
// a scratch hub with 12 543 transcripts: every /api/sessions that missed its 4.5 s cache held the main loop 1 348–1 385 ms,
// cold or warm (two witnessed statSyncs per transcript + every row built on the loop; pages poll every 5 s). THE LAW
// (主开发 00:10Z): no pass over every row on the main loop; nothing a person sees changes. Judged by COUNTS, never a clock:
//   ① the route's sweep through its «sessions-sweep» pool (the REAL transcript worker) over a HOME of N transcripts:
//      ZERO sync fs calls into the transcripts on this thread, ZERO rows built here (src/sessions-assemble.js touched());
//      RED CONTROL: the same sweep run on this thread (the pool's inline fallback = the old road) — 2N+ calls, N+ rows
//   ② the same rows in the same order: the worker's bytes = this thread's, byte for byte — ties (one mtime), a symlinked
//      cwd (realCwd), a kept meta (its name / account / why), a second harness's entries (the first key wins), a sign-in's pid
//   ③ the rows a resume's account lookup reads: the stopped rows that name an account, or of an account-bound harness
//   ④ the route's wiring: the sweep goes through the pool, claude never discovers on the route's thread; RED: the release's text
//   ⑤ THE ROUTE ITSELF (setup + its GET handler, driven as test-local-discovery-device drives it): its answer makes ZERO sync
//      fs calls into the transcripts and builds ZERO rows here, and parses no big string here (the readers ask the worker)
//   ⑥ TODAY'S ROWS: the RELEASE's route (b06f36e90's text, a copy) answers the same bytes over the same HOME
//   ⑦ the readers on the loop: one row by key, the compact list — asked of the worker
// Run: node scripts/test-sessions-sweep.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratchHome, scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0, skips = 0;
// the sweep's -cure (D): a leg that cannot run here is COUNTED as a skip, never a pass (the hosted mirror is a depth-one clone)
const skip = (n) => { skips++; console.log('  - SKIP ' + n); };
const ok = (c, n, e) => { if (typeof n !== 'string') throw new TypeError(`ok(cond, name): the name is a ${typeof n} — the arguments are swapped?`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };

// a HOME of N transcripts in the CLI's own form (the boot shape's records: cwd + user/assistant lines), set BEFORE the
// stores load (session-store reads ~ at require) and before the pool's worker is built (it copies this env)
const HOME = scratchHome('sessions-sweep'); process.env.HOME = HOME;
const PROJ = path.join(HOME, '.claude/projects'), N = 120, T0 = Date.UTC(2026, 10, 1);
// the sweep's -cure (A): a fake tmux on PATH (its panes from a file ⑧ writes) — set before any worker copies the env
const FAKE_BIN = path.join(HOME, 'bin'), PANES = path.join(HOME, 'tmux-panes.txt');
fs.mkdirSync(FAKE_BIN, { recursive: true }); fs.writeFileSync(PANES, '');
fs.writeFileSync(path.join(FAKE_BIN, 'tmux'), `#!/bin/sh\ncat "${PANES}"\n`, { mode: 0o755 });
process.env.PATH = FAKE_BIN + path.delimiter + (process.env.PATH || '');
// the symlinked cwd lives OUTSIDE /tmp/vs-*: discovery's fixture guard ignores a project folder a suite's scratch cwd names
const REAL = fs.mkdtempSync(path.join(os.tmpdir(), 'blsweep-real-')), LINK = REAL.replace('blsweep-real-', 'blsweep-link-');
try { fs.rmSync(LINK, { force: true, recursive: true }); } catch { }
fs.symlinkSync(REAL, LINK);
// the two fixture folders live outside the scratch helper's /tmp/vs-* (discovery's fixture guard ignores a project folder a
// scratch cwd names); this suite still ENDS them at exit, a throw or a red included
process.on('exit', () => { try { fs.rmSync(LINK, { force: true }); fs.rmSync(REAL, { recursive: true, force: true }); } catch { } });
let seq = 0;
const hex = (n) => { let s = ''; while (s.length < n) s += ((++seq * 2654435761) >>> 0).toString(16).padStart(8, '0'); return s.slice(0, n); };
const uuid = () => `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`;
const sids = [];
for (let i = 0; i < N; i++) {
  const cwd = i === 7 ? LINK : `/srv/work/p${i % 9}`, dir = path.join(PROJ, cwd.replace(/[/._]/g, '-')), sid = uuid();
  fs.mkdirSync(dir, { recursive: true });
  const lines = Array.from({ length: 6 }, (_, j) => JSON.stringify({ type: j % 2 ? 'assistant' : 'user', sessionId: sid, uuid: uuid(), timestamp: new Date(T0 + i * 6e4 + j).toISOString(), cwd, message: { role: j % 2 ? 'assistant' : 'user', content: [{ type: 'text', text: `the conversation ${i}, line ${j}` }] } }));
  const f = path.join(dir, sid + '.jsonl');
  fs.writeFileSync(f, lines.join('\n') + '\n');
  const at = new Date(T0 + (i === 11 ? 10 : i) * 6e4);   // ties: the transcripts 10 and 11 share one mtime
  fs.utimesSync(f, at, at);
  sids.push(sid);
}
const R = require(path.join(REPO, 'src/routes/sessions.js'));
const SW = require(path.join(REPO, 'src/sessions-sweep.js'));
const A = require(path.join(REPO, 'src/sessions-assemble.js'));
const SP = require(path.join(REPO, 'src/storage-path.js')), DOOR = require(path.join(REPO, 'src/mount-door.js'));
const payload = {
  active: [], webuiPids: [], devSnap: null, order: ['claude', 'other'], offLoop: 'claude',
  others: { other: [
    { backend: 'other', backendSessionId: 'o1', sessionId: 'o1', cwd: '/srv/work/o', startedAt: T0 + 50.5 * 6e4, status: 'stopped', name: 'another harness' },
    { backend: 'other', backendSessionId: 'o2', sessionId: 'o2', cwd: '/srv/work/o', startedAt: T0 + 60 * 6e4, status: 'live', pid: 4242, name: 'a sign-in\'s own' },
  ] },
  signInPids: [4242],
  kept: [{ backend: 'claude', backendSessionId: sids[3], sessionId: sids[3], status: 'stopped', name: 'the name the person knew', accountId: 'acc-kept', stopReason: 'hub-restart', stoppedAt: T0 + 1, kept: true }],
  bound: ['other'],
  facts: { roots: SP.snapshot(), blocked: DOOR.snapshot() },
};
// the main thread's sync fs calls INTO the transcripts (the sweep's own reads)
const calls = [];
const SPY = ['statSync', 'lstatSync', 'readdirSync', 'openSync', 'existsSync', 'readFileSync', 'realpathSync'], realFs = {};
for (const fn of SPY) { realFs[fn] = fs[fn]; fs[fn] = function (p, ...a) { if (typeof p === 'string' && (p.startsWith(PROJ) || p.startsWith(LINK))) calls.push(fn); return realFs[fn].call(this, p, ...a); }; }
const unspy = () => { for (const fn of SPY) fs[fn] = realFs[fn]; };

console.log('① law 2: the sweep builds no row on this thread (a count)');
let out = null, inl = null, mainCalls = 0, mainRows = 0, inlCalls = 0, inlRows = 0;
try {
  const t0 = A.touched(); calls.length = 0;
  out = await R.sweepPool().call('sessionsSweep', payload, { timeoutMs: 60000 });
  mainCalls = calls.length; mainRows = A.touched() - t0;
  const t1 = A.touched(); calls.length = 0;
  inl = await SW.sweepInThread(payload);   // the pool's inline fallback: the old road, on this thread
  inlCalls = calls.length; inlRows = A.touched() - t1;
} finally { unspy(); }
ok(out && out.count === N + 1 && mainCalls === 0 && mainRows === 0,
  `the pool's sweep of ${N} transcripts (+ one other harness's row): ${out && out.count} rows, ${mainCalls} sync fs call(s) into the transcripts on this thread, ${mainRows} row(s) built here`);
ok(inl && inlCalls >= 2 * N && inlRows >= N, `control (the same sweep on this thread — the old road): ${inlCalls} sync fs calls into the transcripts, ${inlRows} rows built here ⇒ RED`);
ok(out && out.onLoop === false && inl && inl.onLoop === true, 'the answer says which road built it — the worker (onLoop false), the inline fallback (onLoop true: the route says it, once per outage)');

console.log('② law 3: the same rows, in the same order');
const wbuf = out ? Buffer.from(out.buf.buffer, out.buf.byteOffset, out.buf.byteLength) : Buffer.alloc(0);
ok(inl && Buffer.compare(wbuf, inl.buf) === 0 && out.etag === inl.etag, `the worker's answer = this thread's, byte for byte (${wbuf.length} B, ETag ${out && out.etag})`);
const rows = JSON.parse(wbuf.toString() || '{"sessions":[]}').sessions;
const iOf = (sid) => rows.findIndex((r) => r.sessionId === sid);
ok(rows.length === N + 1 && rows.every((r, k) => !k || rows[k - 1].startedAt >= r.startedAt), 'newest first by startedAt (the transcript\'s mtime)');
const inlList = JSON.parse(inl ? inl.buf.toString() : '{"sessions":[]}').sessions, iIn = (sid) => inlList.findIndex((r) => r.sessionId === sid);
ok(iOf(sids[11]) >= 0 && Math.abs(iOf(sids[10]) - iOf(sids[11])) === 1 && iOf(sids[10]) === iIn(sids[10]) && iOf(sids[11]) === iIn(sids[11]), `a tie (one mtime): adjacent, in the walk's own order on both roads (${iOf(sids[11])}, ${iOf(sids[10])})`);
const linked = rows.find((r) => r.sessionId === sids[7]), keptRow = rows.find((r) => r.sessionId === sids[3]);
ok(linked && linked.cwd === LINK && linked.realCwd === fs.realpathSync(LINK), `a symlinked cwd carries its realpath (${linked && linked.realCwd})`);
ok(keptRow && keptRow.name === 'the name the person knew' && keptRow.accountId === 'acc-kept' && keptRow.stopReason === 'hub-restart', 'a kept meta lends its stopped row the name, the account and why it stopped');
ok(rows.some((r) => r.sessionId === 'o1' && r.sessionKey === 'other:o1') && !rows.some((r) => r.sessionId === 'o2'), 'another harness\'s row is merged (keyed); a sign-in\'s own process is never a row');

console.log('③ the rows a resume\'s account lookup reads');
const held = (out && out.held) || [];
ok(held.length === 2 && held.some((r) => r.sessionId === sids[3] && r.accountId === 'acc-kept') && held.some((r) => r.sessionId === 'o1' && r.backend === 'other'),
  `the stopped rows that name an account, or of an account-bound harness: ${held.length} of ${rows.length}`, held);
R._noteSweptRows(held);
ok(JSON.stringify(R.heldAccountOf('claude', sids[3])) === '{"accountId":"acc-kept"}' && R.heldAccountOf('claude', sids[5]) === null, 'heldAccountOf answers from them as from every row (a named account; no account ⇒ null)');

console.log('③b the held keys\' rows AS DISCOVERED, handed to the resume seam (B-a5a4 follow-up, met)');
{
  // an account-bound harness's stopped row that names its OWN account and has no kept copy (an agy conversation a For-you reply
  // reopens): the seam answers that account from the sweep's rows — absent, it would resume on the default login. RED: a sweep
  // that hands no discovered rows; an assembly whose kept fields drop the account; a key that drifts
  const B1 = { backend: 'other', backendSessionId: 'b1', sessionId: 'b1', cwd: '/srv/work/b', startedAt: T0 + 70 * 6e4, status: 'stopped', name: 'bound to its own account', accountId: 'acc-own' };
  const PAY = { order: ['other'], offLoop: null, others: { other: [B1] }, kept: [], bound: ['other'], signInPids: [] };
  const seam = async (S) => { const o = await S.sweepInThread(PAY); R._noteSweptRows(o.heldDisc); try { return await R.heldAccountOfNow('other', 'b1', { stopped: async () => [] }); } finally { R._noteSweptRows(null); } };
  const SW = fs.readFileSync(path.join(REPO, 'src/sessions-sweep.js'), 'utf8'), AS = fs.readFileSync(path.join(REPO, 'src/sessions-assemble.js'), 'utf8');
  const RET = 'return { buf, etag, count, held, heldDisc, onLoop: isMainThread, ms };', KEY = "discovered.get(`${h.backend || 'claude'}:${h.backendSessionId || h.sessionId}`)", FLD = 'accountId: r.accountId, ';
  const M3 = mutantCopies('sessions-sweep-held', REPO);
  const now3 = await seam(require(path.join(REPO, 'src/sessions-sweep.js')));
  const noDisc = await seam(M3.load('src/sessions-sweep.js', SW.replace(RET, 'return { buf, etag, count, held, onLoop: isMainThread, ms };'), 'no-heldDisc'));
  const drift = await seam(M3.load('src/sessions-sweep.js', SW.replace(KEY, "discovered.get(`${h.backendSessionId || h.sessionId}`)"), 'key-drift'));
  const asmNoAcct = M3.write('src/sessions-assemble.js', AS.replace(FLD, ''), 'no-account-field');
  const noAcct = await seam(M3.load('src/sessions-sweep.js', SW.replace("require('./sessions-assemble.js')", `require(${JSON.stringify(asmNoAcct)})`), 'asm-no-account'));
  ok([RET, KEY, FLD].every((x, i) => (i === 2 ? AS : SW).split(x).length === 2) && JSON.stringify(now3) === '{"accountId":"acc-own"}',
    `an account-bound row that names its own account, no kept copy: the seam over the sweep's rows answers it (${JSON.stringify(now3)})`, now3);
  ok(noDisc === null && drift === null && noAcct === null, `RED CONTROLS — no discovered rows handed (${JSON.stringify(noDisc)}), a drifted key (${JSON.stringify(drift)}), the kept fields without the account (${JSON.stringify(noAcct)}): the default login`, { noDisc, drift, noAcct });
}
console.log('③c the seam merges only the ASKED key\'s kept copies: one row built (one realpath), never one per kept copy');
{
  const K = 12, cwdRoot = scratch('seam-cwds');
  const copy = (key, accountId) => ({ backend: 'claude', backendSessionId: key, sessionId: key, status: 'stopped', cwd: path.join(cwdRoot, key), accountId, kept: true, stopReason: 'hub-restart' });
  const copies = [...Array.from({ length: K }, (_, i) => copy(`other-${i}`, `acc-${i}`)), copy('asked', 'acc-asked')];
  const count = async (Mod) => {
    Mod._noteSweptRows([]);
    let n = 0; const realRp = fs.realpathSync;
    fs.realpathSync = function (...a) { n++; return realRp.apply(this, a); };
    let r; try { r = await Mod.heldAccountOfNow('claude', 'asked', { stopped: async () => copies }); } finally { fs.realpathSync = realRp; Mod._noteSweptRows(null); }
    return { n, r };
  };
  const SRC3 = fs.readFileSync(path.join(REPO, 'src/routes/sessions.js'), 'utf8'), NARROW = '  if (Array.isArray(kept)) { const ask = ';
  const now3 = await count(R);
  const wide3 = await count(mutantCopies('sessions-sweep-narrow', REPO).load('src/routes/sessions.js', SRC3.replace(NARROW, '  if (false) { const ask = '), 'wide'));
  ok(SRC3.split(NARROW).length === 2 && JSON.stringify(now3.r) === '{"accountId":"acc-asked"}' && now3.n <= 1,
    `a resume asked with ${K + 1} kept copies (one its own): its account (${now3.r && now3.r.accountId}), ${now3.n} realpath on this thread`, now3);
  ok(JSON.stringify(wide3.r) === '{"accountId":"acc-asked"}' && wide3.n >= K, `RED CONTROL (every kept copy merged, the train's seam over the sweep's few rows): the same answer, ${wide3.n} realpaths on this thread — one per copy`, wide3);
}
console.log('④ the route\'s wiring');
const routeOf = (src) => ({ pool: /out = await sweepPool\(\)\.call\('sessionsSweep', payload, \{ timeoutMs: _sweepTest\.timeoutMs \|\| SWEEP_TIMEOUT_MS, waitMs: _sessionsCache \? SWEEP_QUEUE_MS : \(_sweepTest\.firstQueueMs \|\| FIRST_QUEUE_MS\) \}\);/.test(src), others: /if \(h\.store\.discoverInSweep === true && !offLoop\) offLoop = h\.id;\n\s*else others\[h\.id\] = await h\.store\.discover\(\{ activeSessions, webuiPids, devSnap \}\);/.test(src), noRows: !/sessions\.push\(withSessionKey\(entry\)\)/.test(src) });
const now = routeOf(fs.readFileSync(path.join(REPO, 'src/routes/sessions.js'), 'utf8'));
ok(now.pool && now.others && now.noRows, 'the route sends the sweep to its pool; every harness but claude discovers here; no row is built here', now);
let base = '';
try { base = execFileSync('git', ['-C', REPO, 'show', 'b06f36e90:src/routes/sessions.js'], { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { base = ''; }
const was = routeOf(base);
if (!base) skip('control (the release\'s route, b06f36e90): the release is not in this clone (a depth-one mirror) — ⑧ compares with the release\'s road everywhere');
else ok(!was.pool && !was.noRows, `control (the release's route, b06f36e90): pool ${was.pool}, rows built on the loop ${!was.noRows} ⇒ RED`);

console.log('⑤ the route itself: its GET answer builds nothing here');
const routeCtx = () => ({ activeSessions: new Map(), webuiPids: new Set(), refreshWebuiPids: () => { }, createSessionMessages: () => ({}), BUFFERS_DIR: scratch('sessions-sweep-buffers'), PERMISSION_MODES: [], execFileSync, hosts: { device: async () => null }, accounts: null, sessionAuth: () => ({}), serverSetting: () => undefined });
const getOf = (mod) => { const layer = mod.router.stack.find((l) => l.route && l.route.path === '/api/sessions'); return () => new Promise((resolve, reject) => {
  let code = 200;
  const res = { status: (c) => { code = c; return res; }, type: () => res, set: () => res, json: (b) => resolve({ code, bytes: Buffer.from(JSON.stringify(b)) }), send: (b) => resolve({ code, bytes: Buffer.isBuffer(b) ? b : Buffer.from(String(b)) }) };
  Promise.resolve(layer.route.stack[0].handle({ query: {} }, res)).catch(reject);
}); };
fs.mkdirSync(routeCtx().BUFFERS_DIR, { recursive: true });
R.setup(routeCtx());
const getNow = getOf(R);
const realParse = JSON.parse; let bigParses = 0;
JSON.parse = function (t, ...a) { if (typeof t === 'string' && t.length > 100000) bigParses++; return realParse.call(this, t, ...a); };
let ans = null, routeCalls = 0, routeRows = 0;
try {
  for (const fn of SPY) fs[fn] = function (p, ...a) { if (typeof p === 'string' && (p.startsWith(PROJ) || p.startsWith(LINK))) calls.push(fn); return realFs[fn].call(this, p, ...a); };
  calls.length = 0; const t0 = A.touched();
  ans = await getNow();
  routeCalls = calls.length; routeRows = A.touched() - t0;
} finally { unspy(); JSON.parse = realParse; }
const nowRows = ans ? realParse(ans.bytes.toString()).sessions : [];
ok(ans && ans.code === 200 && nowRows.length >= N && routeCalls === 0 && routeRows === 0 && bigParses === 0,
  `GET /api/sessions through the route: ${nowRows.length} rows, ${routeCalls} sync fs call(s) into the transcripts on this thread, ${routeRows} row(s) built here, ${bigParses} big parse(s) here`);
console.log('⑤b the resume seam over the sweep\'s rows (B-a5a4 follow-up, met): the copies kept NOW merged into the rows AS DISCOVERED');
{
  // the route's own sweep through the REAL worker (a module copy of the route: its own pool), then the seam with no rows handed —
  // the claude row's account lives only in its copy: the copy at the sweep named one account, the copy kept since another
  const SRC = fs.readFileSync(path.join(REPO, 'src/routes/sessions.js'), 'utf8'), HAND = '_sweptStopped = Array.isArray(out.heldDisc) ? out.heldDisc : null;';
  const keptAt = (accountId) => ({ backend: 'claude', backendSessionId: sids[3], sessionId: sids[3], status: 'stopped', name: 'the name the person knew', accountId, stopReason: 'hub-restart', stoppedAt: T0 + 1, kept: true });
  const seamOf = async (Mod) => {
    try {
      Mod.setup({ ...routeCtx(), stoppedSessions: async () => [keptAt('acc-then')] });
      const a = await getOf(Mod)();
      const r = await Mod.heldAccountOfNow('claude', sids[3], { stopped: async () => [keptAt('acc-now')] });
      return { code: a && a.code, r };
    } finally { try { Mod.closeSweepPool(); } catch { } }
  };
  const M5 = mutantCopies('sessions-sweep-seam', REPO);
  const now5 = await seamOf(M5.load('src/routes/sessions.js', SRC, 'seam'));
  const was5 = await seamOf(M5.load('src/routes/sessions.js', SRC.replace(HAND, '_sweptStopped = out.held;'), 'seam-merged'));
  ok(SRC.split(HAND).length === 2 && now5.code === 200 && now5.r && now5.r.accountId === 'acc-now',
    `after the route's sweep (the worker's rows), a resume that states no account goes to the account the copy kept NOW names (${now5.r && now5.r.accountId}) — over the row as discovered, as the page's next merge does`, now5);
  ok(was5.r && was5.r.accountId === 'acc-then', `RED CONTROL (the sweep's MERGED rows handed to the seam): the older copy's account wins (${was5.r && was5.r.accountId}) — B-a5a4's own mutant answer`, was5);
}
console.log('⑥ today\'s rows: the release\'s route answers the same bytes');
if (!base) skip('⑥ the release b06f36e90 is not in this clone (its route is needed) — ⑧ needs no other commit');
else {
  const M6 = mutantCopies('sessions-sweep-release', REPO);
  const Rold = M6.load('src/routes/sessions.js', base, 'release');
  Rold.setup(routeCtx());
  const was6 = await getOf(Rold)();
  ok(was6 && was6.code === 200 && ans && Buffer.compare(was6.bytes, ans.bytes) === 0, `the release's route (b06f36e90) over the same HOME: ${was6 ? was6.bytes.length : 0} B — the tip's ${ans ? ans.bytes.length : 0} B, byte for byte`);
}
console.log('⑦ the readers on the loop ask the worker');
const one = await R.sessionRow(`claude:${sids[3]}`), some = await R.sessionRows(['sessionId', 'name']);
ok(one && one.sessionId === sids[3] && one.sessionKey === `claude:${sids[3]}` && (await R.sessionRow('claude:no-such-row')) === null, `one row by its key (a For-you reply's reopen): ${one && one.sessionKey}; an unknown key ⇒ null`);
ok(Array.isArray(some) && some.length === nowRows.length && some.every((r) => Object.keys(r).every((k) => k === 'sessionId' || k === 'name')), `the compact list (the search backfill): ${some.length} rows cut to their two fields`);
const st = R.sweepStats();
ok(st && st.road === 'worker' && st.rows === nowRows.length && Number.isFinite(st.ms), `the sweep's own cost is kept: ${st && st.ms} ms for ${st && st.rows} rows, by the ${st && st.road}`);

console.log('⑪ the meta memo: a second warm sweep reads zero transcript heads');
{
  const heads = [], HS = ['openSync', 'readFileSync'], realH = {};
  const counting = async (fn) => { heads.length = 0; for (const k of HS) { realH[k] = fs[k]; fs[k] = function (p, ...a) { if (typeof p === 'string' && p.startsWith(PROJ) && p.endsWith('.jsonl')) heads.push(p); return realH[k].call(this, p, ...a); }; } try { await fn(); } finally { for (const k of HS) fs[k] = realH[k]; } return heads.length; };
  await SW.sweepInThread(payload);   // this thread's memo (① ran it here once already)
  const warm = await counting(() => SW.sweepInThread(payload));
  const one = path.join(PROJ, '-srv-work-p4', sids[4] + '.jsonl'); fs.appendFileSync(one, JSON.stringify({ type: 'user', sessionId: sids[4], uuid: uuid(), timestamp: new Date(T0 + 4 * 6e4 + 9).toISOString(), cwd: '/srv/work/p4', message: { role: 'user', content: [{ type: 'text', text: 'one more' }] } }) + '\n');
  const at4 = new Date(T0 + 4 * 6e4 + 30); fs.utimesSync(one, at4, at4);
  const moved = await counting(() => SW.sweepInThread(payload));
  ok(warm === 0 && moved >= 1 && heads.every((p) => p === one), `a second warm sweep over ${N} transcripts reads ${warm} transcript heads (the memo, keyed by path + mtime + size); one transcript that grew: ${moved} read, only that one (the counter counts)`);
}

console.log('⑧ the sweep\'s -cure (A): LIVE ROWS — a live, a tmux and an external conversation; the route\'s projection = the full live table');
const { spawn } = await import('node:child_process');
const CI = require(path.join(REPO, 'src/cli-identity.js'));
const kids = ['live', 'tmux', 'ext'].map(() => spawn('sleep', ['300'], { stdio: 'ignore' }));
process.on('exit', () => { for (const k of kids) { try { k.kill('SIGKILL'); } catch { } } });
for (let i = 0; i < 300 && kids.some((k) => !CI.procStartTicks(k.pid)); i++) await new Promise((r) => setTimeout(r, 10));
const [kL, kT, kE] = kids.map((k) => k.pid);
const LIVE_CWD = '/srv/work/live', TMUX_CWD = '/srv/work/tmux', EXT_CWD = '/srv/work/ext', T8 = T0 + 200 * 6e4;
const tr8 = (cwd, at) => { const dir = path.join(PROJ, cwd.replace(/[/._]/g, '-')), sid = uuid(); fs.mkdirSync(dir, { recursive: true }); const f = path.join(dir, sid + '.jsonl'); fs.writeFileSync(f, JSON.stringify({ type: 'user', sessionId: sid, uuid: uuid(), timestamp: new Date(at).toISOString(), cwd, message: { role: 'user', content: [{ type: 'text', text: 'hello ' + cwd }] } }) + '\n'); fs.utimesSync(f, new Date(at), new Date(at)); return sid; };
const sidL = tr8(LIVE_CWD, T8), sidX = tr8(LIVE_CWD, T8 + 6e4), sidT = tr8(TMUX_CWD, T8 + 2 * 6e4), sidE = tr8(EXT_CWD, T8 + 3 * 6e4), sidK = tr8('/srv/work/kept', T8 - 6e4);
const LOCKS = path.join(HOME, '.claude', 'sessions'); fs.mkdirSync(LOCKS, { recursive: true });
const lock = (pid, sessionId, cwd) => fs.writeFileSync(path.join(LOCKS, `${pid}.json`), JSON.stringify({ pid, sessionId, cwd, procStart: CI.procStartTicks(pid), startedAt: T8 }));
lock(kL, uuid(), LIVE_CWD);   // the live conversation's lock names ANOTHER id: only the projection (claude id + child pid) places it
lock(kT, sidT, TMUX_CWD); lock(kE, sidE, EXT_CWD);
fs.writeFileSync(PANES, `${kT}||work:0.1\n`);
const liveTable = new Map([['sess-live', { backend: 'claude', claudeSessionId: sidL, backendSessionId: sidL, _childPid: kL, cwd: LIVE_CWD, name: 'a live one' }]]);
const keptMeta = [{ backend: 'claude', backendSessionId: sidK, sessionId: sidK, status: 'stopped', name: 'kept by its name', stopReason: 'hub-restart', stoppedAt: T8, kept: true }];
const routeSrc = fs.readFileSync(path.join(REPO, 'src/routes/sessions.js'), 'utf8');
const RL = mutantCopies('sessions-sweep-live', REPO).load('src/routes/sessions.js', routeSrc, 'live');   // a fresh route (its own pool, its own cache)
RL.setup({ ...routeCtx(), activeSessions: liveTable, webuiPids: new Set([kL]), stoppedSessions: async () => keptMeta });
let sent = null; { const p8 = RL.sweepPool(), c8 = p8.call.bind(p8); p8.call = (op, x, o) => { if (op === 'sessionsSweep') sent = x; return c8(op, x, o); }; }
const ans8 = await getOf(RL)();
const SSf = mutantCopies('sessions-sweep-walk', REPO).load('src/session-store.js', fs.readFileSync(path.join(REPO, 'src/session-store.js'), 'utf8'), 'fresh');   // its own memos (the pane map's 4 s)
const fullWalk = (table) => SSf.discoverClaudeSessions({ activeSessions: table, webuiPids: new Set([kL]) });
const bytesOf = (entries, x = sent, Asm = A) => Asm.answerBytes(Asm.assembleSweep({ perHarness: x.order.map((id) => ({ id, entries: id === x.offLoop ? entries : (x.others[id] || []) })), signInPids: x.signInPids, kept: x.kept })).buf;
const inline8 = sent ? bytesOf(await fullWalk(liveTable)) : Buffer.alloc(0);
const rows8 = ans8 && ans8.code === 200 ? JSON.parse(ans8.bytes.toString()).sessions : [], row8 = (sid) => rows8.find((r) => r.sessionId === sid) || {};
ok(sent && sent.active.length === 1 && Object.keys(sent.active[0][1]).sort().join() === '_childPid,claudeSessionId' && Buffer.compare(ans8.bytes, inline8) === 0,
  `the route's answer (the worker, over the PROJECTED live table: [id, {claudeSessionId, _childPid}]) = the walk over the FULL live table on this thread (the release's road), byte for byte (${ans8 && ans8.bytes.length} B)`);
ok(row8(sidL).status === 'live' && row8(sidT).status === 'tmux' && row8(sidT).tmuxTarget === 'work:0.1' && row8(sidE).status === 'external' && row8(sidE).pid === kE && row8(sidX).status === 'stopped' && row8(sidK).name === 'kept by its name',
  'the rows: LIVE (placed by the projection alone — its lock names another id), TMUX (its pane), EXTERNAL (its pid), the other transcript of the live folder stopped, a kept stopped row by its kept name', { L: row8(sidL).status, T: row8(sidT).status, E: row8(sidE).status, X: row8(sidX).status, K: row8(sidK).name });
{
  const drop = (k) => new Map([...liveTable].map(([id, s]) => { const o = { ...s }; delete o[k]; return [id, o]; }));
  const noId = bytesOf(await fullWalk(drop('claudeSessionId'))), noPid = bytesOf(await fullWalk(drop('_childPid')));
  const noKept = bytesOf(await fullWalk(liveTable), { ...sent, kept: [] });
  const asm = fs.readFileSync(path.join(REPO, 'src/sessions-assemble.js'), 'utf8'), SORT = 'sessions.sort((a, b) => b.startedAt - a.startedAt);';
  const Arev = mutantCopies('sessions-sweep-rev', REPO).load('src/sessions-assemble.js', asm.replace(SORT, 'sessions.sort((a, b) => a.startedAt - b.startedAt);'), 'reversed');
  const rev = bytesOf(await fullWalk(liveTable), sent, Arev);
  const diff = [noId, noPid, noKept, rev].map((b) => Buffer.compare(b, ans8.bytes) !== 0);
  ok(asm.split(SORT).length === 2 && diff.every(Boolean), `RED CONTROLS against the route's bytes — the projection without the claude id ${diff[0]}, without the child pid ${diff[1]}; the kept stopped rows dropped ${diff[2]}; the sort reversed ${diff[3]} ⇒ each differs`);
}
RL.closeSweepPool();

console.log('⑨ the sweep\'s -cure (B): the failure roads are driven, and a list that stopped refreshing is SAID');
const getQ = (mod) => (q = {}) => new Promise((resolve, reject) => {
  const layer = mod.router.stack.find((l) => l.route && l.route.path === '/api/sessions');
  let code = 200;
  const res = { status: (c) => { code = c; return res; }, type: () => res, set: () => res, json: (b) => resolve({ code, bytes: Buffer.from(JSON.stringify(b)) }), send: (b) => resolve({ code, bytes: Buffer.isBuffer(b) ? b : Buffer.from(String(b)) }) };
  Promise.resolve(layer.route.stack[0].handle({ query: q }, res)).catch(reject);
});
const RF = mutantCopies('sessions-sweep-fail', REPO).load('src/routes/sessions.js', routeSrc, 'fail');
RF.setup(routeCtx());
const gf = getQ(RF), parse = (a) => { try { return JSON.parse(a.bytes.toString()); } catch { return {}; } };
const sameList = (a, b) => JSON.stringify(parse(a).sessions) === JSON.stringify(parse(b).sessions);
const stub = (name, body) => { const f = path.join(HOME, `${name}-worker.js`); fs.writeFileSync(f, body); return f; };
const HUNG = stub('hung', "const { parentPort } = require('worker_threads'); parentPort.on('message', () => { });");
const THROWS = stub('throws', "const { parentPort } = require('worker_threads'); parentPort.on('message', (m) => { if (m && m.op) parentPort.postMessage({ id: m.id, ok: false, error: { message: 'the value could not be cloned', code: 'DataCloneError' } }); });");
const settle = async (fn) => { for (let k = 0; k < 500 && !fn(); k++) await new Promise((r) => setTimeout(r, 10)); return fn(); };
RF._sweepTestSeam({ pollWaitMs: 150 });   // a poll's bounded wait, short here (the product's POLL_WAIT_MS is said in ⑩)
const good = await gf();
// a sweep that THROWS every time (a value that cannot be cloned)
RF._sweepTestSeam({ workerFile: THROWS });
const th1 = await gf({ rebuild: '1' }), th2 = await gf({ rebuild: '1' });
ok(good.code === 200 && sameList(th1, good) && sameList(th2, good) && !parse(th1).listStale && parse(th2).listStale && parse(th2).listStale.fails === 2 && parse(th2).listStale.why === 'DataCloneError' && parse(th2).listStale.since === RF.sweepFails().builtAt,
  `a sweep that throws every time: the last list stands; the FIRST failure says nothing, from the SECOND every answer carries listStale (fails ${parse(th2).listStale && parse(th2).listStale.fails}, why ${parse(th2).listStale && parse(th2).listStale.why}, since the list's own build)`);
RF._sweepTestSeam({ workerFile: null });
const back = await gf({ rebuild: '1' });
ok(back.code === 200 && !parse(back).listStale && RF.sweepFails().fails === 0, 'the first good sweep clears it');
// the worker WEDGED (it never answers): its deadline ends the sweep, the list stands
RF._sweepTestSeam({ workerFile: HUNG, timeoutMs: 200 });
await gf({ rebuild: '1' }); await settle(() => RF.sweepFails().fails >= 1);
const w2 = await gf({ rebuild: '1' }); await settle(() => RF.sweepFails().fails >= 2);
const w3 = await gf();
ok(sameList(w2, good) && RF.sweepFails().fails >= 2 && parse(w3).listStale && /timed out|not responding/i.test(parse(w3).listStale.why), `a wedged worker: each sweep ends at its deadline, the list stands, and it is said (${parse(w3).listStale && parse(w3).listStale.why})`);
// the worker KILLED mid-sweep, and the pool CLOSED mid-sweep: each fails that sweep; the next pool / respawn rebuilds
const midSweep = async (end) => {
  RF._sweepTestSeam({ workerFile: HUNG, timeoutMs: 60000 });
  const f0 = RF.sweepFails().fails;
  const p = gf({ rebuild: '1' });
  const inside = await settle(() => { const w = RF.sweepPool()._workers[0]; return w && w.inflight && w.inflight.size === 1; });
  end();
  await p; await settle(() => RF.sweepFails().fails === f0 + 1);
  const failed = RF.sweepFails().fails === f0 + 1;
  RF._sweepTestSeam({ workerFile: null, timeoutMs: null });
  const at0 = (RF.sweepStats() || {}).at || 0;
  await gf({ rebuild: '1' }); await settle(() => ((RF.sweepStats() || {}).at || 0) > at0);
  return { inside, failed, rebuilt: ((RF.sweepStats() || {}).at || 0) > at0 && RF.sweepFails().fails === 0 };
};
const killed = await midSweep(() => RF.sweepPool()._workers[0].worker.terminate());
const closed = await midSweep(() => RF.closeSweepPool());
ok(killed.inside && killed.failed && killed.rebuilt && closed.inside && closed.failed && closed.rebuilt, 'the worker killed mid-sweep, the pool closed mid-sweep: that sweep fails (counted), the list stands; the respawned worker / the next pool rebuilds it and the count clears', { killed, closed });
{
  // the sweep's -cure r3 (its read r2, M1): the line DRAWN, not grepped — the REAL Sidebar prototype over a minimal DOM stand-in
  // (test-codex-subagents' shape), through the two renders of the Sessions tab that WIPE the list: the workbench (a desktop)
  // and the column (a phone). RED: the r2 renderers — the line _renderInner drew was wiped by them in the same render
  const WORDS = 'Session list is out of date — the hub could not rebuild it.';
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  ok(zh.includes(`"${WORDS}":`) && ja.includes(`"${WORDS}":`) && zh.split('"Retrying…":').length === 2 && ja.split('"Retrying…":').length === 2, 'its words in zh and ja (the line; its door while a press runs — the upload row\'s «Retrying…», ONE key in each)');
  const mkEl = (tag) => {
    const el = { tagName: tag, children: [], className: '', textContent: '', title: '', type: '', disabled: false, style: { setProperty() { } }, dataset: {},
      classList: { add: (c) => { el.className = (el.className + ' ' + c).trim(); }, remove() { }, toggle() { }, contains: (c) => el.className.split(/\s+/).includes(c) },
      setAttribute() { }, append(...c) { el.children.push(...c); }, appendChild(c) { el.children.push(c); return c; }, querySelector: () => null, closest: () => null, remove() { } };
    Object.defineProperty(el, 'innerHTML', { get: () => el._html || '', set: (v) => { el._html = v; el.children = []; } });
    return el;
  };
  const { Sidebar } = await import(path.join(REPO, 'src/lib/sidebar.js'));   // BEFORE the stand-in: utils.js binds document listeners at load
  const hadDoc = globalThis.document;
  globalThis.document = { createElement: mkEl, getElementById: () => null, querySelector: () => null, addEventListener() { }, removeEventListener() { } };
  try {
    const lineOf = (el) => el.children.find((c) => c && /sidebar-hub-stale/.test(c.className || '')) || null;
    const render = (self, mode) => { try { if (mode === 'column') self._renderColumnList([]); else self._renderWorkbench([]); return null; } catch (e) { return String((e && e.message) || e).slice(0, 120); } };
    const drive = (proto, mode) => {
      const self = Object.create(proto);
      Object.assign(self, { listEl: mkEl('div'), _pollFails: 0, _activeTab: 'folders', _regularMode: mode === 'column', _manageMode: false, app: {},
        _hubStale: { since: Date.now() - 60000, ageMs: 60000, fails: 2, why: 'sweep-pool-down', at: Date.now() - 60000 },
        _appendKindHint() { }, _appendStatusHint() { }, _renderServiceHintRows() { }, _sortSessions() { }, _buildSessionCard: () => mkEl('div'), isStarred: () => 0 });
      const threw = render(self, mode), line = lineOf(self.listEl);
      self._retrying = true; render(self, mode);
      const btn = (lineOf(self.listEl)?.children || []).find((c) => c && c.tagName === 'button') || null;
      self._retrying = false; self._hubStale = null; render(self, mode);   // a clean answer
      return { drawn: !!line, retrying: !!btn && btn.disabled !== true && btn.textContent === 'Retrying…', cleared: !lineOf(self.listEl), threw };   // r6: live, saying so (test-control-says-why)
    };
    const wb = drive(Sidebar.prototype, 'workbench'), col = drive(Sidebar.prototype, 'column');
    ok(wb.drawn && wb.cleared && col.drawn && col.cleared && wb.retrying && col.retrying,
      'the Sessions tab DRAWS it: the workbench render (a desktop) and the column render (a phone) each wipe the list and the hub\'s line stands after the wipe; its Retry says «Retrying…» while a press runs (the door stays live); a clean answer clears it', { wb, col });
    const MCs = mutantCopies('sweep-cure-stale-line', REPO), CALL = /\n      this\._appendStaleHint\?\.\(\);[^\n]*/;
    const wbSrc = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-workbench.js'), 'utf8'), colSrc = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-column.js'), 'utf8');
    const wbM = await import(MCs.write('src/lib/sidebar-workbench.js', wbSrc.replace(CALL, ''), 'r2-workbench', { esm: true }));
    const colM = await import(MCs.write('src/lib/sidebar-column.js', colSrc.replace(CALL, ''), 'r2-column', { esm: true }));
    class R2 extends Sidebar { }
    wbM.installSidebarWorkbench(R2); colM.installSidebarColumn(R2);
    const rwb = drive(R2.prototype, 'workbench'), rcol = drive(R2.prototype, 'column');
    ok(CALL.test(wbSrc) && CALL.test(colSrc) && !rwb.drawn && !rcol.drawn, 'RED CONTROL (the r2 renderers): the line is gone after the wipe — the person on the Sessions tab saw a frozen list with no word', { rwb, rcol });
    // r4 (its third read, M2): THE POLL'S ROAD — the REAL _poll over a stand-in fetch: the hub's answer → the line's forced render
    // (the list's digest skips a render: a stale answer is the same list); four answers — clean, stale, stale with one more
    // failure (the same start), clean again. RED: a copy of the page without the forced render
    const FORCED = 'if (drawsLine && (staleMoved || (hubStale && this._hubStalePolls % 12 === 0))) this._render();';
    const sbSrc4 = fs.readFileSync(path.join(REPO, 'src/lib/sidebar.js'), 'utf8');
    const pollDrive = async (Proto) => {
      const self = Object.create(Proto.prototype); let renders = 0;
      Object.assign(self, { listEl: mkEl('div'), _activeTab: 'folders', app: {}, _mergeAndRender() { }, _render() { renders++; } });
      const since = Date.now() - 9000, says = [{ sessions: [] }, { sessions: [], listStale: { since, ageMs: 9000, fails: 2, why: 'sweep-pool-down' } }, { sessions: [], listStale: { since, ageMs: 14000, fails: 3, why: 'sweep-pool-down' } }, { sessions: [] }];
      const hadFetch = globalThis.fetch, out = [];
      try {
        for (const d of says) { globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => d }); const r0 = renders; await self._poll(); clearTimeout(self._pollTimer); out.push(renders - r0); }
      } finally { globalThis.fetch = hadFetch; clearTimeout(self._pollTimer); }
      return out.join(',');
    };
    const pNow = await pollDrive(Sidebar);
    const { Sidebar: SbNoForce } = await import(MCs.write('src/lib/sidebar.js', sbSrc4.replace(FORCED, '/* no forced render */'), 'r4-no-forced', { esm: true }));
    const pWas = await pollDrive(SbNoForce);
    ok(sbSrc4.split(FORCED).length === 2 && pNow === '0,1,0,1' && pWas === '0,0,0,0',
      `THE POLL'S ROAD: the hub's stale answer forces the line's render when it appears and when it goes, not when only its count moves (${pNow}); RED the page without the forced render (${pWas})`);
    // r5 (its fourth read's shoulds): the three page cures that had no leg — the phone's task-group view draws the line; the line's
    // Retry click runs the press («Retrying…» while it runs) and the door redraws when it SETTLES. RED: the r4-less copies
    const STALE = () => ({ since: Date.now() - 60000, ageMs: 60000, fails: 2, why: 'sweep-pool-down', at: Date.now() - 60000 });
    const tasksLine = (Proto) => { const self = Object.create(Proto.prototype); Object.assign(self, { listEl: mkEl('div'), _hubStale: STALE(), _pollFails: 0, app: {} }); try { self._renderMobileTaskDetail('A group', [], []); } catch { } return !!lineOf(self.listEl); };
    const press = async (Proto) => {
      const self = Object.create(Proto.prototype), seen = []; let fetched = '', fetches = 0;
      Object.assign(self, { listEl: mkEl('div'), _hubStale: STALE(), _pollFails: 0, app: {}, _render() { seen.push(self._retrying ? 'retrying' : 'retry'); }, _poll() { } });
      self._appendStaleHint();
      const btn = (lineOf(self.listEl)?.children || []).find((c) => c && c.tagName === 'button');
      const hadFetch = globalThis.fetch;
      globalThis.fetch = async (u) => { fetched = String(u); fetches++; return { ok: true, status: 200, json: async () => ({}) }; };
      try { if (btn) await Promise.all([btn.onclick(), btn.onclick()]); } finally { globalThis.fetch = hadFetch; clearTimeout(self._pollTimer); }   // pressed TWICE at once
      return { fetched, fetches, renders: seen.join(','), after: !!self._retrying };
    };
    const tNow = tasksLine(Sidebar), pNow5 = await press(Sidebar);
    const tkSrc = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-tasks.js'), 'utf8'), TK = /\n    this\._appendStaleHint\?\.\(\);[^\n]*/;
    const tkM = await import(MCs.write('src/lib/sidebar-tasks.js', tkSrc.replace(TK, ''), 'r5-tasks', { esm: true }));
    class T4 extends Sidebar { }
    tkM.installSidebarTasks(T4);
    const SETTLE = 'this._retrying = false; this._render(); }';
    const { Sidebar: SbNoSettle } = await import(MCs.write('src/lib/sidebar.js', sbSrc4.replace(SETTLE, 'this._retrying = false; }'), 'r5-no-settle', { esm: true }));
    const tWas = tasksLine(T4), pWas5 = await press(SbNoSettle);
    const GUARD1 = '    if (this._retrying) return;';
    const { Sidebar: SbTwice } = await import(MCs.write('src/lib/sidebar.js', sbSrc4.replace(GUARD1, '    if (false) return;'), 'cure-two-presses', { esm: true }));
    const pTwice = await press(SbTwice);
    ok(sbSrc4.split(GUARD1).length === 2 && pNow5.fetches === 1 && pTwice.fetches === 2, `Retry pressed twice at once asks ONE rebuild (${pNow5.fetches}); RED the door without its one-press guard (${pTwice.fetches})`);
    const pz = Object.create(Sidebar.prototype); Object.assign(pz, { listEl: mkEl('div'), _pollFails: 0, app: {}, _hubStale: { ...STALE(), paused: true, why: 'discovery is paused (a storage mount is not answering)' } }); pz._appendStaleHint();
    const pzLine = lineOf(pz.listEl);
    ok(!!pzLine && !(pzLine.children || []).some((c) => c && c.tagName === 'button'), 'a paused discovery (the chain\'s -cure): the line stands, no Retry door — it could not act; the chip\'s title names the pause');
    // the -cure's read (S2): a sweep still running past the bound, nothing failed — the line says it is still being rebuilt, and
    // offers no Retry (a press would only join the sweep in flight); RED: the door without its guards (the paused line's RED too)
    const RDOOR = "      if (!this._hubStale.paused && this._hubStale.running == null) row.append(' ', retry);";
    const { Sidebar: SbDoor } = await import(MCs.write('src/lib/sidebar.js', sbSrc4.replace(RDOOR, () => "      row.append(' ', retry);"), 'cure2-door-always', { esm: true }));
    const lineFor = (Proto, extra) => { const s = Object.create(Proto.prototype); Object.assign(s, { listEl: mkEl('div'), _pollFails: 0, app: {}, _hubStale: { ...STALE(), ...extra } }); s._appendStaleHint(); const l = lineOf(s.listEl); return { line: !!l, door: !!l && (l.children || []).some((c) => c && c.tagName === 'button'), text: l ? String(((l.children || [])[0] || {}).textContent || '') : '' }; };
    const run = lineFor(Sidebar, { fails: 0, running: 20, why: 'a rebuild has run 20 s' }), runFailed = lineFor(Sidebar, { fails: 2, running: 3 }), runRed = lineFor(SbDoor, { fails: 0, running: 20 }), pzRed = lineFor(SbDoor, { paused: true });
    ok(sbSrc4.split(RDOOR).length === 2 && run.line && !run.door && /still being rebuilt/.test(run.text) && /could not rebuild/.test(runFailed.text) && !runFailed.door && runRed.door && pzRed.door,
      `a sweep still running past the bound with nothing failed: «${run.text.trim()}», no Retry (it would only join the sweep); after failures the line keeps «could not rebuild»; RED the door without its guards ⇒ a Retry on the running line (${runRed.door}) and on the paused one (${pzRed.door})`, { run, runFailed, runRed, pzRed });
    ok(tNow && pNow5.fetched === '/api/sessions?rebuild=1' && pNow5.renders === 'retrying,retry' && !pNow5.after,
      `the phone's task-group view draws the line; the line's Retry click asks the hub to rebuild now (${pNow5.fetched}) — «Retrying…» while it runs, the door redrawn when it settles (${pNow5.renders})`, { tNow, pNow5 });
    ok(TK.test(tkSrc) && sbSrc4.split(SETTLE).length === 2 && !tWas && pWas5.renders === 'retrying', `RED CONTROLS: the task-group view without its call (line ${tWas}); the press without its redraw on settling (${pWas5.renders}: «Retrying…» stays)`, { tWas, pWas5 });
  } finally { if (hadDoc === undefined) delete globalThis.document; else globalThis.document = hadDoc; }
  const sb = fs.readFileSync(path.join(REPO, 'src/lib/sidebar.js'), 'utf8');
  ok(/const staleKey = \(x\) => \(x \? `\$\{x\.since\}\|\$\{!!x\.paused\}\|\$\{x\.running != null\}` : ''\)/.test(sb) && sb.includes("await fetch('/api/sessions?rebuild=1', ac ? { signal: ac.signal } : undefined)"),
    'the page redraws the line on its presence and start — and (the -cure\'s read, S4) when a pause or a running sweep starts or ends — not on every failed count (its read r2, S2); Retry asks the hub to rebuild now (?rebuild=1), one press at a time, never holding the connection past a minute (S1)');
}

console.log('⑩ the sweep\'s -cure (C): nobody waits out a long sweep with a list in hand; a lookup never kills a sweep');
{
  const DONE = path.join(HOME, 'busy-done'), HOLD = path.join(HOME, 'busy-hold');
  // a BUSY sweep (its thread blocked while the leg holds it — Atomics.wait: blocked, no core spun; the chain's -cure: held by a FILE the
  // leg removes once the poll and the lookup answered, never a 1.2 s race against the runner's clock) — then the real sweep
  const BUSY = stub('busy', `const { parentPort } = require('worker_threads'); const fs = require('fs'); const S = require(${JSON.stringify(path.join(REPO, 'src/sessions-sweep.js'))});
const ops = { sessionsSweep: (p) => { const g = new Int32Array(new SharedArrayBuffer(4)); for (let k = 0; k < 1000 && fs.existsSync(${JSON.stringify(HOLD)}); k++) Atomics.wait(g, 0, 0, 10); return S.sweepInThread(p); }, sessionsLookup: (p) => S.lookupInThread(p), sessionsRows: (p) => S.rowsInThread(p) };
parentPort.on('message', (m) => { if (!m || !m.op || !ops[m.op]) return; Promise.resolve(ops[m.op](m.payload)).then((r) => { if (m.op === 'sessionsSweep') fs.writeFileSync(${JSON.stringify(DONE)}, 'done'); parentPort.postMessage({ id: m.id, ok: true, result: r }); }, (e) => parentPort.postMessage({ id: m.id, ok: false, error: { message: e.message, code: e.code } })); });`);
  const drive = async (mod, getter) => {
    try { fs.rmSync(DONE, { force: true }); } catch { }
    mod._sweepTestSeam({ workerFile: BUSY, timeoutMs: null, lookupMs: 150, pollWaitMs: 200, cacheTtlMs: 0 });
    const pre = await getter({ rebuild: '1' });   // the busy worker's first sweep: the list in hand
    try { fs.rmSync(DONE, { force: true }); } catch { }
    const at0 = (mod.sweepStats() || {}).at || 0, f0 = mod.sweepFails().fails;
    fs.writeFileSync(HOLD, 'hold');
    const a1 = await getter();                                   // a poll past the cache (cacheTtlMs 0): a sweep starts, held
    const doneAtAnswer = fs.existsSync(DONE);
    await settle(() => { const w = mod.sweepPool()._workers[0]; return w && w.inflight && w.inflight.size === 1; });   // the sweep IN the worker before the lookup (r2's S4)
    const look = await mod.sessionRow(`claude:${sids[3]}`);      // a lookup while the sweep runs
    try { fs.rmSync(HOLD, { force: true }); } catch { }           // released: the sweep goes on
    await settle(() => fs.existsSync(DONE) || mod.sweepFails().fails > f0);
    await settle(() => ((mod.sweepStats() || {}).at || 0) > at0 || mod.sweepFails().fails > f0);
    return { a1, pre, doneAtAnswer, look, finished: fs.existsSync(DONE) && ((mod.sweepStats() || {}).at || 0) > at0, failed: mod.sweepFails().fails > f0 };
  };
  const now = await drive(RF, gf);
  ok(now.a1.code === 200 && sameList(now.a1, now.pre) && !now.doneAtAnswer && now.look === null && now.finished && !now.failed,
    `with a list in hand a poll got it while a held sweep still ran (its wait bounded); a lookup behind that sweep ended ITSELF (null) — the sweep finished in the same worker, never killed (the product's bound: POLL_WAIT_MS ${RF.POLL_WAIT_MS} ms, said in the route)`, { look: now.look, finished: now.finished, failed: now.failed });
  // RED: the release's pool form (no serial lane) — the lookup is sent INTO the busy worker and its deadline terminates it, the sweep with it
  const SERIAL = "serial: { busy: { message: 'the session list is being rebuilt — try again in a moment', code: 'sweep_busy' } }, ";
  const RR = mutantCopies('sessions-sweep-noserial', REPO).load('src/routes/sessions.js', routeSrc.replace(SERIAL, ''), 'noserial');
  RR.setup(routeCtx());
  const was = await drive(RR, getQ(RR));
  ok(routeSrc.split(SERIAL).length === 2 && was.failed && !was.finished, `RED CONTROL — the release's pool form (no serial lane): the lookup's 150 ms deadline terminated the worker under the sweep (failed ${was.failed}, finished ${was.finished})`);
  RR.closeSweepPool();
  RF._sweepTestSeam({ workerFile: null, lookupMs: null, pollWaitMs: null, cacheTtlMs: null });
}
console.log('⑫ the chain\'s -cure (主开发 12:08Z): no walk on the loop after a worker RAN; a list that stopped refreshing said in seconds; the bounds; a newer conversation reopened; a pause named');
{
  const M12 = mutantCopies('sessions-sweep-chain-cure', REPO);
  const fresh = (src, tag, ctx = routeCtx()) => { const Mod = M12.load('src/routes/sessions.js', src, tag); Mod.setup(ctx); return Mod; };
  // (1) a FIRST sweep (no list yet) whose worker RAN past its deadline: SAID (a 500), never walked again on this thread
  const GUARD = "      if (!(e && (e.noWorker || e.code === 'sweep-pool-down'))) throw e;\n";
  const first = async (src, tag) => {
    const Mod = M12.load('src/routes/sessions.js', src, tag);
    Mod._sweepTestSeam({ workerFile: HUNG, timeoutMs: 150 }); Mod.setup(routeCtx());
    calls.length = 0; const t0 = A.touched();
    for (const fn of SPY) fs[fn] = function (p, ...a) { if (typeof p === 'string' && (p.startsWith(PROJ) || p.startsWith(LINK))) calls.push(fn); return realFs[fn].call(this, p, ...a); };
    let a = null; try { a = await getQ(Mod)(); } finally { unspy(); }
    const out = { code: a && a.code, onLoop: calls.length, rows: A.touched() - t0 };
    try { Mod.closeSweepPool(); } catch { }
    return out;
  };
  const now1 = await first(routeSrc, 'first'), was1 = await first(routeSrc.replace(GUARD, ''), 'first-walks');
  ok(routeSrc.split(GUARD).length === 2 && now1.code === 500 && now1.onLoop === 0 && now1.rows === 0,
    `(1) a FIRST sweep whose worker ran past its deadline is SAID (${now1.code}): ${now1.onLoop} fs calls into the transcripts, ${now1.rows} rows built on this thread`, now1);
  ok(was1.code === 200 && (was1.onLoop > 0 || was1.rows > 0), `RED CONTROL (any failure walks — the r6 road): the storage that held the worker walked again on the loop (${was1.onLoop} calls, ${was1.rows} rows)`, was1);
  // (1b) its read (adv/sweep-chain-cure-findings.md M1): the NEXT first sweep, asked while the killed worker waits to respawn (its
  // back-off doubles at each deadline; here set long, so the window is certain): a wait that ends with no worker ALIVE is not «no
  // worker» once one of the pool's ran — never walked on this thread. RED: be3ac90af's predicate (none alive at this moment)
  const NW = 'noWorker: !this._ran && !this._workers.some((r) => r.alive)';
  const sfSrc = fs.readFileSync(path.join(REPO, 'src/safe-fs.js'), 'utf8'), SFREQ = "const { SafeFs } = require('../safe-fs');";
  const sfAlive = M12.write('src/safe-fs.js', sfSrc.replace(NW, () => 'noWorker: !this._workers.some((r) => r.alive)'), 'noworker-alive');
  const second = async (src, tag) => {
    const Mod = M12.load('src/routes/sessions.js', src, tag);
    Mod._sweepTestSeam({ workerFile: HUNG, timeoutMs: 150, firstQueueMs: 60 }); Mod.setup(routeCtx());
    for (const r of Mod.sweepPool()._workers) r.backoff = 6;   // the respawn after a kill: 30 s away (the sixth deadline's wait, reached at once)
    const a = await getQ(Mod)();                                // the first sweep: the worker ran past its deadline, killed
    calls.length = 0; const t0 = A.touched();
    for (const fn of SPY) fs[fn] = function (p, ...x) { if (typeof p === 'string' && (p.startsWith(PROJ) || p.startsWith(LINK))) calls.push(fn); return realFs[fn].call(this, p, ...x); };
    let b = null; try { b = await getQ(Mod)(); } finally { unspy(); }   // the next first sweep: its wait ends while no worker is alive
    const out = { first: a && a.code, code: b && b.code, onLoop: calls.length, rows: A.touched() - t0 };
    try { Mod.closeSweepPool(); } catch { }
    return out;
  };
  const now1b = await second(routeSrc, 'second'), was1b = await second(routeSrc.replace(SFREQ, () => `const { SafeFs } = require(${JSON.stringify(sfAlive)});`), 'second-alive');
  ok(sfSrc.split(NW).length === 2 && routeSrc.split(SFREQ).length === 2 && now1b.first === 500 && now1b.code === 500 && now1b.onLoop === 0 && now1b.rows === 0,
    `(1b) the NEXT first sweep, asked while the killed worker waits to respawn: said (${now1b.code}), ${now1b.onLoop} fs calls into the transcripts and ${now1b.rows} rows on this thread`, now1b);
  ok(was1b.first === 500 && was1b.code === 200 && (was1b.onLoop > 0 || was1b.rows > 0), `RED CONTROL (be3ac90af's «no worker» = none alive now): the respawn wait walked the storage that held its worker on the loop (${was1b.onLoop} calls, ${was1b.rows} rows)`, was1b);
  // (1c) the delta read (S3): the ONE road left to «no worker» — a worker that cannot be created (`new Worker` throws at once: a
  // script name that is not a path) — the first sweep runs here, once, said; RED: a safe-fs copy whose wait never says noWorker
  const noWorkerRoad = async (src, tag) => {
    const Mod = M12.load('src/routes/sessions.js', src, tag);
    Mod._sweepTestSeam({ workerFile: 'not-a-worker-path.js', timeoutMs: 150, firstQueueMs: 60 }); Mod.setup(routeCtx());
    const t0 = A.touched(); let a = null; try { a = await getQ(Mod)(); } catch (e) { a = { code: 'threw' }; }
    const out = { code: a && a.code, rows: A.touched() - t0, ran: !!Mod.sweepPool()._ran };
    try { Mod.closeSweepPool(); } catch { }
    return out;
  };
  const sfNever = M12.write('src/safe-fs.js', sfSrc.replace(NW, () => 'noWorker: false'), 'noworker-never');
  const now1c = await noWorkerRoad(routeSrc, 'no-worker'), was1c = await noWorkerRoad(routeSrc.replace(SFREQ, () => `const { SafeFs } = require(${JSON.stringify(sfNever)});`), 'no-worker-never');
  ok(now1c.code === 200 && now1c.rows > 0 && !now1c.ran && was1c.code === 500 && was1c.rows === 0,
    `(1c) a worker that cannot be created: no worker of the pool ever took a call ⇒ the first sweep runs on this thread once (${now1c.code}, ${now1c.rows} rows built here); RED (a wait that never says «no worker»): ${was1c.code}, no list at all`, { now1c, was1c });
  // (2) a list that stopped refreshing is SAID IN SECONDS: a sweep still running past the bound says it while it runs; a sweep that
  // ran past its deadline is said at once (not at the second failure). ONE copy for every scene below (the RED copy: neither rule)
  const SAID = 'const said = _sweepFails >= SWEEP_STALE_SAY_AFTER || (_sweepFails >= 1 && _sweepFailDeadline) || late;';
  let PAUSE = false;
  const MAIN = fresh(routeSrc, 'cure', { ...routeCtx(), paused: (k) => PAUSE && k === 'discovery' });
  const RSAID = fresh(routeSrc.replace(SAID, 'const said = _sweepFails >= SWEEP_STALE_SAY_AFTER;'), 'cure-said-red');
  const good = async (Mod, seam = {}) => { Mod._sweepTestSeam({ workerFile: null, timeoutMs: null, lateSayMs: null, answerMaxBytes: null, pollWaitMs: 50, cacheTtlMs: null, ...seam }); return getQ(Mod)({ rebuild: '1' }); };   // a good sweep, waited for
  const late = async (Mod) => {
    const g = getQ(Mod); await good(Mod);
    Mod._sweepTestSeam({ workerFile: HUNG, timeoutMs: 60000, lateSayMs: 600, pollWaitMs: 30, cacheTtlMs: 0 });   // the -cure's read (S7): 570 ms of margin for the first answer
    const a1 = await g();                                    // a sweep starts and hangs: the poll gets the list, nothing said yet
    const t1 = Date.now(); await settle(() => Date.now() - t1 > 660);
    const a2 = await g();                                    // the same sweep, past the bound: said while it runs
    const f0 = Mod.sweepFails().fails;
    try { Mod.closeSweepPool(); } catch { }
    await settle(() => Mod.sweepFails().fails > f0);         // the hung sweep ENDS (counted) before the next scene's rebuild
    return { a1: parse(a1).listStale || null, a2: parse(a2).listStale || null };
  };
  const dead = async (Mod) => {
    await good(Mod);
    Mod._sweepTestSeam({ workerFile: HUNG, timeoutMs: 120 });
    const a = await getQ(Mod)({ rebuild: '1' });             // its sweep ran past the deadline: ONE failure
    try { Mod.closeSweepPool(); } catch { }
    return { stale: parse(a).listStale || null, fails: Mod.sweepFails().fails };
  };
  const l2 = await late(MAIN), d2 = await dead(MAIN), l2r = await late(RSAID), d2r = await dead(RSAID);
  ok(routeSrc.split(SAID).length === 2 && !l2.a1 && l2.a2 && l2.a2.fails === 0 && l2.a2.running >= 0 && /a rebuild has run/.test(l2.a2.why) && d2.fails === 1 && d2.stale && /timed out|not responding/i.test(d2.stale.why),
    `(2) said in seconds: a sweep running past the bound is said WHILE it runs (${l2.a2 && l2.a2.why}); a sweep that ran past its deadline is said at its FIRST failure (${d2.stale && d2.stale.why})`, { l2, d2 });
  ok(!l2r.a2 && !d2r.stale, 'RED CONTROLS: without the running rule the hung sweep says nothing; without the deadline rule the first deadline says nothing (the list frozen ~10 min before the line, the readers\' scene)', { l2r, d2r });
  // (a) the stated bound on what crosses back: an answer past it is refused in the worker, counted, said — the last list stands
  {
    const g = getQ(MAIN), before = await good(MAIN);
    MAIN._sweepTestSeam({ answerMaxBytes: 64, pollWaitMs: 50 });
    await g({ rebuild: '1' }); const a = await g({ rebuild: '1' });
    const st = parse(a).listStale || null;
    ok(st && st.why === 'sweep-answer-too-big' && st.fails === 2 && sameList(a, before) && R.SWEEP_ANSWER_MAX_BYTES === 64 * 1024 * 1024 && R.SWEEP_ROWS_IN_MAX === 200000,
      `(a) the bound on what crosses the thread is stated (an answer ≤ ${R.SWEEP_ANSWER_MAX_BYTES} bytes, ≤ ${R.SWEEP_ROWS_IN_MAX} rows in): an answer past it is refused in the worker — the last list stands, said (${st && st.why})`, st);
  }
  // the pause named: while discovery is paused a Retry cannot act — the answer says so (the line names it and offers no door: the page leg)
  {
    const g = getQ(MAIN); await good(MAIN);
    MAIN._sweepTestSeam({ workerFile: THROWS, pollWaitMs: 50 }); await g({ rebuild: '1' }); await g({ rebuild: '1' });
    PAUSE = true; let a = null; try { a = await g({ rebuild: '1' }); } finally { PAUSE = false; }
    const p5 = parse(a).listStale || null;
    ok(p5 && p5.paused === true && /discovery is paused/.test(p5.why) && p5.fails === 2, `a list served while discovery is paused SAYS the pause (${p5 && p5.why})`, p5);
  }
  // (b) a For-you reopen of a conversation NEWER than the last sweep: one fresh sweep, then its row
  const FRESH = 'if (r && !r.row && _warmSweep && ';
  const newer = async (Mod) => {
    await good(Mod, { cacheTtlMs: 0 });                      // the list as it stood
    const sid = uuid(), cwd = '/srv/work/p1', f = path.join(PROJ, cwd.replace(/[/._]/g, '-'), sid + '.jsonl');
    fs.writeFileSync(f, JSON.stringify({ type: 'user', sessionId: sid, uuid: uuid(), timestamp: new Date().toISOString(), cwd, message: { role: 'user', content: 'a conversation newer than the sweep' } }) + '\n');
    const tb = Date.now(); await settle(() => Date.now() - tb > 5);   // the last sweep is older than the (zero) cache
    let row = null; try { row = await Mod.sessionRow(`claude:${sid}`); } finally { try { fs.rmSync(f, { force: true }); } catch { } }
    return row ? row.sessionKey === `claude:${sid}` : false;
  };
  const RFRESH = fresh(routeSrc.replace(FRESH, 'if (false && r && !r.row && _warmSweep && '), 'cure-newer-red');
  const n4 = await newer(MAIN), n4r = await newer(RFRESH);
  ok(routeSrc.split(FRESH).length === 2 && n4 === true && n4r === false, `(b) a reopen of a conversation newer than the last sweep finds its row after ONE fresh sweep (${n4}); RED the last sweep alone (${n4r})`);
  // (c) the -cure's read (S7): a hub whose sweeps keep failing with NO list yet — its worker answers a lookup «no sweep held», each
  // sweep fails — a second For-you reopen inside the cache's spacing starts NO second sweep (spaced by the last ATTEMPT, good or
  // failed); RED: the lookup's sweep unspaced (3e6ed72ed's askRows)
  const NONEFAIL = stub('none-fails', "const { parentPort } = require('worker_threads'); parentPort.on('message', (m) => { if (!m || !m.op) return; if (m.op === 'sessionsLookup') parentPort.postMessage({ id: m.id, ok: true, result: { none: true } }); else parentPort.postMessage({ id: m.id, ok: false, error: { message: 'the sweep failed', code: 'SWEEP_FAILS' } }); });");
  const SPACE = '      if (Date.now() - _sweepTriedAt < (_sweepTest.cacheTtlMs ?? 4500)) return null;';
  const reopens = async (src, tag) => {
    const Mod = M12.load('src/routes/sessions.js', src, tag);
    Mod._sweepTestSeam({ workerFile: NONEFAIL, lookupMs: 5000, cacheTtlMs: 60000, timeoutMs: null }); Mod.setup(routeCtx());   // a lookup waits out the failing sweep (it ends in ms once posted) — never joined by the second reopen
    const P = Mod.sweepPool(), call0 = P.call.bind(P); let sweeps = 0;
    P.call = (op, ...x) => { if (op === 'sessionsSweep') sweeps++; return call0(op, ...x); };
    const t0 = Date.now(); const a = await Mod.sessionRow(`claude:${uuid()}`); const first = Date.now() - t0;
    const ended = await settle(() => sweeps === 1);   // the first attempt was posted (and failed: the lookup waited it out)
    const b = await Mod.sessionRow(`claude:${uuid()}`);
    try { Mod.closeSweepPool(); } catch { }
    return { sweeps, a, b, first, ended };
  };
  const sp = await reopens(routeSrc, 'cure2-spaced'), spRed = await reopens(routeSrc.replace(SPACE, () => '      if (false) return null;'), 'cure2-unspaced');
  ok(routeSrc.split(SPACE).length === 2 && sp.ended && spRed.ended && sp.sweeps === 1 && sp.a === null && sp.b === null && spRed.sweeps === 2,
    `(c) sweeps that keep failing with no list yet: two reopens inside the spacing start ONE sweep (${sp.sweeps}; each answered by locate()); RED the lookup's sweep unspaced: ${spRed.sweeps}`, { sp, spRed });
  for (const Mod of [MAIN, RSAID, RFRESH]) { try { Mod.closeSweepPool(); } catch { } }
}
RF.closeSweepPool();

R.closeSweepPool();
try { fs.rmSync(HOME, { recursive: true, force: true }); fs.rmSync(LINK, { force: true }); fs.rmSync(REAL, { recursive: true, force: true }); } catch { }
console.log(fail ? `\n${fail} FAILED (${pass} passed${skips ? `, ${skips} SKIPPED` : ''})` : `\nALL PASS (${pass})${skips ? ` · ${skips} SKIPPED (counted, never a pass)` : ''}`);
process.exit(fail ? 1 : 0);

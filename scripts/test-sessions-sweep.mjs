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
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new TypeError(`ok(cond, name): the name is a ${typeof n} — the arguments are swapped?`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };

// a HOME of N transcripts in the CLI's own form (the boot shape's records: cwd + user/assistant lines), set BEFORE the
// stores load (session-store reads ~ at require) and before the pool's worker is built (it copies this env)
const HOME = scratchHome('sessions-sweep'); process.env.HOME = HOME;
const PROJ = path.join(HOME, '.claude/projects'), N = 120, T0 = Date.UTC(2026, 10, 1);
// the symlinked cwd lives OUTSIDE /tmp/vs-*: discovery's fixture guard ignores a project folder a suite's scratch cwd names
const REAL = fs.mkdtempSync(path.join(os.tmpdir(), 'blsweep-real-')), LINK = REAL.replace('blsweep-real-', 'blsweep-link-');
try { fs.rmSync(LINK, { force: true, recursive: true }); } catch { }
fs.symlinkSync(REAL, LINK);
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
const routeOf = (src) => ({ pool: /out = await sweepPool\(\)\.call\('sessionsSweep', payload, \{ timeoutMs: SWEEP_TIMEOUT_MS \}\);/.test(src), others: /if \(h\.store\.discoverInSweep === true && !offLoop\) offLoop = h\.id;\n\s*else others\[h\.id\] = await h\.store\.discover\(\{ activeSessions, webuiPids, devSnap \}\);/.test(src), noRows: !/sessions\.push\(withSessionKey\(entry\)\)/.test(src) });
const now = routeOf(fs.readFileSync(path.join(REPO, 'src/routes/sessions.js'), 'utf8'));
ok(now.pool && now.others && now.noRows, 'the route sends the sweep to its pool; every harness but claude discovers here; no row is built here', now);
let base = '';
try { base = execFileSync('git', ['-C', REPO, 'show', 'b06f36e90:src/routes/sessions.js'], { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { base = ''; }
const was = routeOf(base);
ok(!base || (!was.pool && !was.noRows), `control (the release's route, b06f36e90): ${base ? `pool ${was.pool}, rows built on the loop ${!was.noRows}` : 'SKIP — the release b06f36e90 is not in this clone'} ⇒ RED`);

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
if (!base) ok(true, 'SKIP — the release b06f36e90 is not in this clone (⑥ needs its route)');
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

R.closeSweepPool();
try { fs.rmSync(HOME, { recursive: true, force: true }); fs.rmSync(LINK, { force: true }); fs.rmSync(REAL, { recursive: true, force: true }); } catch { }
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

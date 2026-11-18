#!/usr/bin/env node
// test-pool-pass-reads — B-403e (lane bl-accounts; 主开发 2026-11-18 from the production hub's witness: about forty percent of
// five hours' main-loop holds were the pool pass asking the SAME files on the data mount again and again in one synchronous
// run). THE LAW: within one synchronous run — one pool pass, one stdout record, one session-list broadcast — each file under
// the watched folders is asked of the mount AT MOST ONCE (src/run-reads.js), and a read after a write of this process in the
// same run sees the write, whoever wrote.
//   ① THE COUNTING LEG — a stand-in pool (its sizes are PARAMETERS, its members invented): every path-named fs ask counted per
//      file in one forced pass, one record and one broadcast. TODAY'S ASKS are its RED control: the same world with each
//      routed site asking the mount directly (a pass-through copy of src/run-reads.js — the release's direct calls).
//   ② THE MEMO NEVER OUTLIVES ITS RUN — two asks with an await between them are two asks of the mount.
//   ③ AN ERROR IS AN ANSWER FOR THE RUN — a missing file asked twice in a run is one ask; both askers see «no such file».
//   ④ BY CONSTRUCTION — a write under a watched folder by a writer nobody listed (a bare fs.writeFileSync) and a link re-point
//      are seen by the next read in the SAME run; RED: a copy whose write hook does nothing serves the stale answer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (extra !== undefined ? ' — ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };
const cleanup = [];
process.on('exit', () => { for (const d of cleanup) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } });
const tmpdir = (p) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); cleanup.push(d); return d; };
const quiet = (fn) => { const o = console.log, w = console.warn; console.log = () => { }; console.warn = () => { }; try { return fn(); } finally { console.log = o; console.warn = w; } };

const RRpath = path.join(REPO, 'src/run-reads.js');
const RR = require(RRpath);
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const engMod = require(path.join(REPO, 'src/server/usage-pool-engine.js'));
const MU = mutantCopies('pool-pass-reads', REPO);

// ── THE COUNTER: every path-named ask of the mount under a world's root, per resolved path ──
const ASKS = ['readFileSync', 'readlinkSync', 'lstatSync', 'statSync', 'readdirSync', 'openSync', 'existsSync', 'accessSync', 'realpathSync'];
let counting = null;   // { root, by: Map path → n }
for (const name of ASKS) {
  const orig = fs[name];
  fs[name] = function (...a) {
    if (counting && typeof a[0] === 'string') { const r = path.resolve(a[0]); if (r.startsWith(counting.root + path.sep)) counting.by.set(r, (counting.by.get(r) || 0) + 1); }
    return orig.apply(this, a);
  };
}
/** count the asks of ONE synchronous run */
function countRun(root, fn) {
  counting = { root, by: new Map() };
  try { quiet(fn); } finally { /* the run's asks are what it asked */ }
  const by = counting.by; counting = null;
  const asks = [...by.values()].reduce((x, y) => x + y, 0);
  const max = Math.max(0, ...by.values());
  const worst = [...by].sort((x, y) => y[1] - x[1]).slice(0, 4).map(([p, n]) => `${path.relative(root, p)} ×${n}`);
  return { asks, files: by.size, max, worst, by };
}

// ── THE STAND-IN POOL: S conversations with their own links over M members (invented names, fake tokens built here) ──
function world({ S, M, mods = { AccountManager, engMod } }) {
  const root = tmpdir('vs-pool-reads-');
  const dataDir = path.join(root, 'data');
  const am = new mods.AccountManager({ dataDir });
  if (!am.poolSupported()) return null;
  const tok = (k) => ['tok', k, 'x'.repeat(8)].join('-');
  const ids = [];
  for (let i = 0; i < M; i++) {
    const id = am.createSubscription({ name: `Member ${String.fromCharCode(65 + (i % 26))}${i}` }).id;
    fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: tok('a' + i), refreshToken: tok('r' + i), expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 29 * 86400e3, subscriptionType: 'max' } }), { mode: 0o600 });
    ids.push(id);
  }
  const P = am.createPool({ name: 'stand-in' }).id;
  am.setPoolTarget(P, ids[0]);
  am.updatePool(P, { auto: true, hot: true });
  const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
  const nowS = Math.floor(Date.now() / 1000);
  ids.forEach((id, i) => fs.writeFileSync(path.join(cacheDir, id + '.json'), JSON.stringify({ fetchedAt: Date.now() - 60e3, source: 'on-demand', fiveHour: { utilization: 0.1 + 0.05 * (i % 5), resetsAt: nowS + 3600 }, sevenDay: { utilization: 0.2, resetsAt: nowS + 3 * 86400 } })));
  const sessions = new Map();
  const app = { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} };
  const eng = mods.engMod.create({
    app, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions,
    wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice() { },
    serverSetting: () => undefined, getAccounts: () => am, getHosts: () => null, getUsageHistory: () => null,
    recordUsageAttribution() { }, adapterRegistry: { get() { return null; } },
    getAutoResume: () => null, getQuotaProbe: () => null, getUserTodos: () => null,
  });
  for (let k = 0; k < S; k++) {
    const sid = 'conv-' + k;
    sessions.set(sid, { backend: 'claude', mode: 'chat', _webuiId: sid, claudeSessionId: 'cid-' + k, _accountId: P, _servedModel: 'claude-fable-5', _servedModelAt: Date.now(), _isStreaming: false, _turnState: 'idle', pty: { write() { } }, name: sid });
    am.ensureSessionPoolLink(P, sid, ids[k % M]);
  }
  return { root, dataDir, am, eng, P, ids, sessions, cacheDir };
}
/** the three runs the law names — each its OWN synchronous run (a macrotask between: a record or a broadcast never rides a
 *  pass's answers) */
const turn = () => new Promise((r) => setImmediate(r));
async function runs(w) {
  const first = [...w.sessions.values()][0];
  await turn();
  const pass = countRun(w.root, () => w.eng.maybePoolAutoSwitchForPool(w.P, { force: true }));
  await turn();
  const record = countRun(w.root, () => { w.eng.resolveUsageKey(first); w.eng.cacheFactsOf(first); });
  await turn();
  const broadcast = countRun(w.root, () => { for (const [sid, s] of w.sessions) { try { w.am.poolMemberOfSession(w.P, s, sid); } catch { } } });
  return { pass, record, broadcast };
}
/** TODAY'S ASKS: each routed site asking the mount directly — a copy of src/run-reads.js whose ask is the call itself,
 *  swapped onto the module every routed site reads through (`RR.readText(…)` is looked up at each call) */
async function withPassThrough(fn) {
  const src = fs.readFileSync(RRpath, 'utf8');
  const needle = 'function ask(kind, p, fn) {\n';
  if (src.split(needle).length !== 2) return { err: 'the ask needle moved' };
  const f = MU.write('src/run-reads.js', src.replace(needle, needle + '  return fn();\n'), 'today');
  const today = require(f);
  const saved = {};
  for (const k of ['readText', 'readlink', 'entryExists', 'readdir', 'facts', 'stat']) { saved[k] = RR[k]; RR[k] = today[k]; }
  try { return { out: await fn() }; } finally { Object.assign(RR, saved); }
}

console.log('① THE COUNTING LEG — one pass, one record, one broadcast over a stand-in pool (sizes are parameters)');
const SIZES = [{ S: 3, M: 2 }, { S: 12, M: 6 }];
const said = [];
for (const { S, M } of SIZES) {
  const w = world({ S, M });
  if (!w) { ok(true, 'pools unsupported on ' + process.platform + ' — SKIPPED (said as a skip, never a pass)'); continue; }
  const wt = world({ S, M });
  const memo = await runs(w);
  const t = await withPassThrough(() => runs(wt));
  if (t.err) { ok(false, 'the pass-through copy of run-reads could be built', t.err); continue; }
  const today = t.out;
  for (const k of ['pass', 'record', 'broadcast']) {
    console.log(`    S=${S} M=${M} ${k}: today ${today[k].asks} asks over ${today[k].files} files (max ${today[k].max} per file: ${today[k].worst.join(', ')}) · with the memo ${memo[k].asks} asks over ${memo[k].files} files (max ${memo[k].max})`);
    ok(memo[k].max <= 1, `S=${S} M=${M}: in ONE ${k} every file is asked of the mount at most once (${memo[k].asks} asks over ${memo[k].files} files)`, memo[k].worst);
  }
  ok(today.pass.max > 1 && today.pass.asks > memo.pass.asks, `S=${S} M=${M} RED CONTROL: today's pass asks the same files again and again — ${today.pass.asks} asks (max ${today.pass.max} per file) against ${memo.pass.asks}`, today.pass.worst);
  said.push(`S=${S} M=${M}: one pass today ${today.pass.asks} asks → ${memo.pass.asks} with the memo`);
}
console.log('    THE TWO NUMBERS: ' + said.join(' · '));

console.log('② THE MEMO NEVER OUTLIVES ITS SYNCHRONOUS RUN');
{
  const w = world({ S: 1, M: 1 });
  const p = path.join(w.cacheDir, w.ids[0] + '.json');
  const one = countRun(w.root, () => { RR.readText(p); RR.readText(p); RR.readText(p); });
  counting = { root: w.root, by: new Map() };
  RR.readText(p);
  await null;   // the run ends at its microtask checkpoint
  RR.readText(p);
  const two = counting.by.get(path.resolve(p)) || 0; counting = null;
  ok(one.asks === 1 && two === 2, `three asks in one run are ONE ask of the mount; two asks with an await between them are TWO (${one.asks}, ${two})`);
}

console.log('③ AN ERROR IS AN ANSWER FOR THE RUN');
{
  const w = world({ S: 1, M: 1 });
  const p = path.join(w.cacheDir, 'never-written.json');
  const codes = [];
  const r = countRun(w.root, () => { for (let i = 0; i < 3; i++) { try { RR.readText(p); codes.push('read'); } catch (e) { codes.push(e.code); } } });
  ok(r.asks === 1 && codes.every((c) => c === 'ENOENT'), `a missing file asked three times in one run is ONE ask, and every asker sees «no such file» (${r.asks}; ${codes.join(',')})`);
}

console.log('④ A READ AFTER A WRITE OF THIS PROCESS IN THE SAME RUN SEES THE WRITE — BY CONSTRUCTION');
const afterWrites = (rr) => {
  const w = world({ S: 2, M: 2 });
  const p = path.join(w.cacheDir, w.ids[0] + '.json');
  let before = null, after = null, linkBefore = null, linkAfter = null;
  quiet(() => {
    before = rr.readText(p);
    fs.writeFileSync(p, JSON.stringify({ fetchedAt: 1, marker: 'written-in-the-run' }));   // a writer nobody listed
    after = rr.readText(p);
    linkBefore = w.am.poolCurrentFor(w.P, 'conv-0');
    w.am.ensureSessionPoolLink(w.P, 'conv-0', w.ids[1], { why: 'per-session-switch' });   // the link writer re-points
    linkAfter = w.am.poolCurrentFor(w.P, 'conv-0');
  });
  return { sawWrite: /written-in-the-run/.test(after || '') && before !== after, linkMoved: linkBefore === w.ids[0] && linkAfter === w.ids[1] };
};
{
  const r = afterWrites(RR);
  ok(r.sawWrite, 'a bare fs.writeFileSync under a watched folder (a writer nobody listed) is seen by the next read in the SAME run', r);
  ok(r.linkMoved, 'a link the link writer re-points is seen by the next read of it in the SAME run', r);
  const src = fs.readFileSync(RRpath, 'utf8');
  const needle = 'function wrote(args, idx) {\n';
  ok(src.split(needle).length === 2, 'RED CONTROL: the write hook\'s needle hits once in a copy of run-reads');
  if (src.split(needle).length === 2) {
    const blind = require(MU.write('src/run-reads.js', src.replace(needle, needle + '  return;\n'), 'blind'));
    const saved = {};
    for (const k of ['readText', 'readlink', 'entryExists', 'readdir', 'facts', 'stat']) { saved[k] = RR[k]; RR[k] = blind[k]; }
    let rb;
    try { rb = afterWrites(blind); } finally { Object.assign(RR, saved); }
    ok(!rb.sawWrite && !rb.linkMoved, 'RED CONTROL: with the write hook doing nothing, the run serves the STALE answer after its own write — the reading and the link both', rb);
  }
}

console.log('⑤ THE RATCHET — every Sync function of the RUNNING runtime is classed exactly once');
const READS = new Set(['accessSync', 'existsSync', 'globSync', 'lstatSync', 'opendirSync', 'readdirSync', 'readFileSync', 'readlinkSync', 'realpathSync', 'statSync', 'statfsSync']);
const FD = new Set(['closeSync', 'fchownSync', 'fchmodSync', 'fdatasyncSync', 'fstatSync', 'fsyncSync', 'ftruncateSync', 'futimesSync', 'readSync', 'readvSync', 'writeSync', 'writevSync']);
const SYNCS = Object.keys(fs).filter((k) => /^[a-z][A-Za-z]*Sync$/.test(k) && typeof fs[k] === 'function');
const unclassed = SYNCS.filter((k) => [READS.has(k), FD.has(k), Object.prototype.hasOwnProperty.call(RR.WRITES, k)].filter(Boolean).length !== 1);
ok(SYNCS.length > 30 && !unclassed.length, `every Sync function of node ${process.version} (${SYNCS.length}) is a read, a path write (run-reads WRITES) or a descriptor call — an unclassed one (a new runtime's) is RED until classed`, unclassed);

console.log('⑥ EVERY PATH WRITE between two asks in one run is seen by the second (table-driven over WRITES)');
{
  const w = world({ S: 1, M: 1 });
  const uid = typeof process.getuid === 'function' ? process.getuid() : 0, gid = typeof process.getgid === 'function' ? process.getgid() : 0;
  const t = new Date();
  const ARGS = {
    writeFileSync: (d) => [path.join(d, 'f'), 'x'], appendFileSync: (d) => [path.join(d, 'f'), 'x'], renameSync: (d) => [path.join(d, 'f'), path.join(d, 'g')],
    copyFileSync: (d) => [path.join(d, 'f'), path.join(d, 'c')], cpSync: (d) => [path.join(d, 'f'), path.join(d, 'c2')], symlinkSync: (d) => ['f', path.join(d, 's')],
    linkSync: (d) => [path.join(d, 'f'), path.join(d, 'h')], unlinkSync: (d) => [path.join(d, 'f')], rmSync: (d) => [path.join(d, 'f')], rmdirSync: (d) => [path.join(d, 'sub')],
    mkdirSync: (d) => [path.join(d, 'n')], mkdtempSync: (d) => [path.join(d, 't-')], mkdtempDisposableSync: (d) => [path.join(d, 'u-')], truncateSync: (d) => [path.join(d, 'f'), 0],
    utimesSync: (d) => [path.join(d, 'f'), t, t], lutimesSync: (d) => [path.join(d, 'f'), t, t], chmodSync: (d) => [path.join(d, 'f'), 0o600],
    chownSync: (d) => [path.join(d, 'f'), uid, gid], lchownSync: (d) => [path.join(d, 'f'), uid, gid], openSync: (d) => [path.join(d, 'o'), 'w'],
  };
  const unseen = [], noArgs = [];
  for (const name of Object.keys(RR.WRITES)) {
    if (typeof fs[name] !== 'function') continue;   // not in this runtime
    if (!ARGS[name]) { noArgs.push(name); continue; }
    const d = path.join(w.cacheDir, 'w-' + name); fs.mkdirSync(path.join(d, 'sub'), { recursive: true }); fs.writeFileSync(path.join(d, 'f'), 'y');
    const r = countRun(w.root, () => {
      RR.readdir(d);
      const out = fs[name](...ARGS[name](d));
      if (name === 'openSync' && typeof out === 'number') fs.closeSync(out);
      RR.readdir(d);
    });
    if ((r.by.get(path.resolve(d)) || 0) !== 2) unseen.push(name);   // the folder's own asks: the second is a new one
  }
  ok(!unseen.length && !noArgs.length, `every path write of this runtime (${Object.keys(RR.WRITES).filter((n) => typeof fs[n] === 'function').length}) between two asks of a watched folder in ONE run makes the second a new ask`, { unseen, noArgs });
}

console.log('⑦ ONE WRAPPER PER PROCESS — a second copy of the module, one write, both memos gone');
{
  const w = world({ S: 1, M: 1 });
  const p = path.join(w.cacheDir, w.ids[0] + '.json');
  const src = fs.readFileSync(RRpath, 'utf8');
  const B = require(MU.write('src/run-reads.js', src, 'second'));
  B.watch(w.cacheDir);
  const G = globalThis[Symbol.for('vibespace.run-reads.writes')];
  const r = countRun(w.root, () => {
    RR.readText(p); B.readText(p); RR.readText(p); B.readText(p);   // each copy's own memo: two asks
    fs.writeFileSync(p, JSON.stringify({ fetchedAt: 2 }));           // ONE write …
    RR.readText(p); B.readText(p);                                   // … drops BOTH: two more asks
  });
  ok(r.asks === 4 && G && G.drops.size >= 2 && G.installed.get('writeFileSync') && fs.writeFileSync === G.installed.get('writeFileSync'), `two copies in one process: one wrapper (found by the process-wide key, not a mark on a function), and one write drops every copy's memo (${r.asks} asks; ${G ? G.drops.size : 0} drops)`, { asks: r.asks });
}

console.log('⑧ A TICK CALLBACK AND AN ALREADY-QUEUED CONTINUATION SHARE THE RUN\'S ANSWERS (nothing outside the process can have been heard)');
{
  const w = world({ S: 1, M: 1 });
  const p = path.join(w.cacheDir, w.ids[0] + '.json');
  let seenBy = [];
  // a run begun in a MACROTASK — where the pool pass (a timer), a record (an I/O callback) and a broadcast run
  await new Promise((done) => setImmediate(() => {
    counting = { root: w.root, by: new Map() };
    Promise.resolve().then(() => { RR.readText(p); seenBy.push('continuation'); });   // queued BEFORE the run's first ask
    RR.readText(p);                                                                     // the run's first ask: its drop queued after
    process.nextTick(() => { RR.readText(p); seenBy.push('tick'); });
    setImmediate(done);
  }));
  const n = counting.by.get(path.resolve(p)) || 0; counting = null;
  ok(n === 1 && seenBy.length === 2, `a nextTick callback of the run and a promise continuation queued before it began read from the run's answers — ONE ask (${n}; ${seenBy.join(', ')})`);
}

console.log('⑨ NO MODULE HOLDS AN fs WRITE FUNCTION FROM BEFORE THE WRAP — a census derived by search over src and server.js');
{
  const { execFileSync } = await import('node:child_process');
  const files = execFileSync('git', ['-C', REPO, 'ls-files', '-z', '--', 'src', 'server.js'], { encoding: 'utf8' }).split('\0').filter((f) => /\.(c|m)?js$/.test(f));
  const W = Object.keys(RR.WRITES).join('|');
  const DESTR = /\{([^{}]*)\}\s*=\s*(?:require\(\s*['"](?:node:)?fs['"]\s*\)|fs)\b/g;
  const ALIAS = new RegExp(`=\\s*(?:require\\(\\s*['"](?:node:)?fs['"]\\s*\\)|fs)\\.(?:${W})\\b(?!\\s*\\()`, 'g');
  // the two modules that wrap fs's functions by design hold the function they wrap inside their wrapper
  const BY_DESIGN = new Set(['src/run-reads.js', 'src/server/loop-blame.js']);
  const hits = [];
  for (const f of files) {
    if (BY_DESIGN.has(f)) continue;
    let text = ''; try { text = fs.readFileSync(path.join(REPO, f), 'utf8'); } catch { continue; }
    for (const m of text.matchAll(DESTR)) if (new RegExp(`\\b(?:${W})\\b`).test(m[1])) hits.push(`${f}: { ${m[1].trim().slice(0, 60)} }`);
    for (const m of text.matchAll(ALIAS)) hits.push(`${f}: ${m[0].slice(0, 60)}`);
  }
  ok(files.length > 300 && !hits.length, `no module destructures or aliases an fs write function (${files.length} files searched; by design: ${[...BY_DESIGN].join(', ')})`, hits);
  const planted = 'const { writeFileSync } = require(\'fs\');\nconst w2 = fs.renameSync;\n';
  const ph = [...planted.matchAll(DESTR)].filter((m) => new RegExp(`\\b(?:${W})\\b`).test(m[1])).length + [...planted.matchAll(ALIAS)].length;
  ok(ph === 2, `CONTROL: a planted destructured write and a planted alias are both found by the census (${ph})`);
}

console.log('⑩ THE LOOP WITNESS INSTALLED AFTER THIS MODULE KEEPS ITS WRAPPER INSIDE');
{
  const w = world({ S: 1, M: 1 });
  const p = path.join(w.cacheDir, w.ids[0] + '.json');
  const LB = require(path.join(REPO, 'src/server/loop-blame.js'));
  LB.install({ fsMod: fs });
  const r = countRun(w.root, () => { RR.readText(p); fs.writeFileSync(p, JSON.stringify({ fetchedAt: 3 })); RR.readText(p); });
  ok(LB.isWrapped(fs.writeFileSync) && r.asks === 2, `with the witness wrapped around it, a write still drops the memo (${r.asks} asks)`);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

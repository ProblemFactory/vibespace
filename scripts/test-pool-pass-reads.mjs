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
  return { asks, files: by.size, max, worst };
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
/** the three runs the law names */
function runs(w) {
  const first = [...w.sessions.values()][0];
  return {
    pass: countRun(w.root, () => w.eng.maybePoolAutoSwitchForPool(w.P, { force: true })),
    record: countRun(w.root, () => { w.eng.resolveUsageKey(first); w.eng.cacheFactsOf(first); }),
    broadcast: countRun(w.root, () => { for (const [sid, s] of w.sessions) { try { w.am.poolMemberOfSession(w.P, s, sid); } catch { } } }),
  };
}
/** TODAY'S ASKS: each routed site asking the mount directly — a copy of src/run-reads.js whose ask is the call itself,
 *  swapped onto the module every routed site reads through (`RR.readText(…)` is looked up at each call) */
function withPassThrough(fn) {
  const src = fs.readFileSync(RRpath, 'utf8');
  const needle = 'function ask(kind, p, fn) {\n';
  if (src.split(needle).length !== 2) return { err: 'the ask needle moved' };
  const f = MU.write('src/run-reads.js', src.replace(needle, needle + '  return fn();\n'), 'today');
  const today = require(f);
  const saved = {};
  for (const k of ['readText', 'readlink', 'entryExists', 'readdir', 'facts', 'stat']) { saved[k] = RR[k]; RR[k] = today[k]; }
  try { return { out: fn() }; } finally { Object.assign(RR, saved); }
}

console.log('① THE COUNTING LEG — one pass, one record, one broadcast over a stand-in pool (sizes are parameters)');
const SIZES = [{ S: 3, M: 2 }, { S: 12, M: 6 }];
const said = [];
for (const { S, M } of SIZES) {
  const w = world({ S, M });
  if (!w) { ok(true, 'pools unsupported on ' + process.platform + ' — SKIPPED (said as a skip, never a pass)'); continue; }
  const wt = world({ S, M });
  const memo = runs(w);
  const t = withPassThrough(() => runs(wt));
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

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
// test-pool-pass-reads — B-403e (lane bl-accounts; 主开发 2026-11-18 from the production hub's witness: about forty percent of
// five hours' main-loop holds were the pool pass asking the SAME files on the data mount again and again in one synchronous
// run). THE LAW: within one synchronous run — one pool pass, one stdout record, one session-list broadcast — each file under
// the watched folders is asked of the mount AT MOST ONCE between two writes of this process (src/run-reads.js), a read after
// a write of this process in the same run sees the write, whoever wrote, and a look-again read asks the mount itself.
//   ① THE COUNTING LEG — a stand-in pool (its sizes are PARAMETERS, its members invented): every path-named fs ask counted
//      per file AND kind in one forced pass, a second (steady) pass, one record and one broadcast (the record and the
//      broadcast are MODELS: the key resolver + the reading facts a stdout usage record asks; the member lookup a session-list
//      broadcast makes per conversation). The FLOOR: every member's reading and sign-in file and every conversation's link is
//      asked at least once (the pass ran). TODAY'S ASKS are its RED control: each routed site asking the mount directly (a
//      pass-through copy of the helper — the new routing, so AT LEAST the release's count).
//   ② THE MEMO NEVER OUTLIVES ITS RUN — two asks with an await between them are two asks of the mount.
//   ③ AN ERROR IS AN ANSWER FOR THE RUN — a missing file asked three times in a run is one ask; every asker sees it.
//   ④ BY CONSTRUCTION — a write by a writer nobody listed, a link re-point and a sign-in file written are each seen by the
//      next read in the SAME run; RED: a copy whose drop does nothing, watching the same folders, serves the stale answers.
//   ⑤ THE RATCHET — every Sync function of the RUNNING runtime is a read, a descriptor call, a descriptor write or a path write.
//   ⑥ every path write and every descriptor write between two asks in one run makes the second a new ask (table-driven).
//   ⑦ ONE WRAPPER PER PROCESS — two copies, one write, both memos gone.   ⑧ a tick and a queued continuation share the run.
//   ⑨ no module holds an fs write function from before the wrap (a census by search, its planted control).
//   ⑩ the loop witness installed after keeps the wrapper inside.
//   ⑪ WHAT IS SAID MEMOIZED IS WHAT IS WATCHED — every path the routed readers ask is under a watched folder; RED: an engine
//      that does not watch its readings.
//   ⑫ A SIGN-IN FILE WHOSE STAT ANSWERS KEEPS ITS SIGNATURE (memberLoginState across runs); RED: the signature from the read.
//   ⑬ NOTHING AT LOAD (a child process: require + the harness descriptor leave fs untouched, the first watch wraps) and the
//      helper's own mutants, each in a child (the wrappers are process-wide): every one is caught.
//   ⑭ A LOOK-AGAIN READ ASKS THE MOUNT ITSELF — another process changes a sign-in folder or a link mid-run; every check before
//      a write sees it, while the run's memo still answers the old state (the control in kind).
//   ⑮ dropRun() drops every copy's memo (the hand-off for a write no wrapper sees).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (extra !== undefined ? ' — ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };
const cleanup = [];
process.on('exit', () => { for (const d of cleanup) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } });
const tmpdir = (p) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); cleanup.push(d); return d; };
const quiet = (fn) => { const o = console.log, w = console.warn; console.log = () => { }; console.warn = () => { }; try { return fn(); } finally { console.log = o; console.warn = w; } };
const turn = () => new Promise((r) => setImmediate(r));

const RRpath = path.join(REPO, 'src/run-reads.js');
const ENGpath = path.join(REPO, 'src/server/usage-pool-engine.js');
const RR = require(RRpath);
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const engMod = require(ENGpath);
const MU = mutantCopies('pool-pass-reads', REPO);
const RR_SRC = fs.readFileSync(RRpath, 'utf8');
const ENG_SRC = fs.readFileSync(ENGpath, 'utf8');
const ASK_FNS = ['readText', 'readlink', 'entryExists', 'readdir', 'facts', 'stat'];
/** a copy of a product file with ONE named edit — null when its needle does not hit exactly once (said as a red by the caller) */
const copyOf = (rel, src, from, to, tag) => (src.split(from).length === 2 ? MU.write(rel, src.replace(from, to), tag) : null);
/** swap a copy's asks onto the module every routed site reads through (`RR.readText(…)` is looked up at each call) */
async function withAsks(copy, fn) { const saved = {}; for (const k of ASK_FNS) { saved[k] = RR[k]; RR[k] = copy[k]; } try { return await fn(); } finally { Object.assign(RR, saved); } }
const tok = (k) => ['tok', k, 'x'.repeat(8)].join('-');
const loginBody = (k, live = true) => JSON.stringify({ claudeAiOauth: { accessToken: live ? tok('a' + k) : '', refreshToken: live ? tok('r' + k) : '', expiresAt: live ? Date.now() + 36e5 : 0, refreshTokenExpiresAt: live ? Date.now() + 29 * 86400e3 : 0, subscriptionType: 'max' } });

// ── THE COUNTER: every path-named ask of the mount under a world's root, per resolved path AND kind, and an EPOCH that every
//    write of this process under the root starts (the law holds between two writes: a write drops the memo by construction) ──
const ASKS = ['readFileSync', 'readlinkSync', 'lstatSync', 'statSync', 'readdirSync', 'openSync', 'existsSync', 'accessSync', 'realpathSync'];
let counting = null;   // { root, epoch, by: Map «epoch\0path» → Map kind → n, writes: [] }
const inRoot = (r) => !!counting && (r === counting.root || r.startsWith(counting.root + path.sep));
const writesOpen = (f) => (f == null ? false : typeof f === 'number' ? (f & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND)) !== 0 : /[wa+]/.test(String(f)));
for (const name of new Set([...ASKS, ...Object.keys(RR.WRITES)])) {
  const orig = fs[name];
  if (typeof orig !== 'function') continue;
  const isWrite = Object.prototype.hasOwnProperty.call(RR.WRITES, name);
  fs[name] = function (...a) {
    if (counting) {
      if (isWrite && (name !== 'openSync' || writesOpen(a[1]))) {
        const hit = RR.WRITES[name].map((i) => a[i]).find((p) => typeof p === 'string' && inRoot(path.resolve(p)));
        if (hit) { counting.writes.push(`${name.replace('Sync', '')} ${path.relative(counting.root, path.resolve(hit))}`); counting.epoch++; }
      } else if (ASKS.includes(name) && typeof a[0] === 'string') {
        const r = path.resolve(a[0]);
        if (inRoot(r)) { const k = counting.epoch + '\0' + r; const m = counting.by.get(k) || new Map(); m.set(name, (m.get(name) || 0) + 1); counting.by.set(k, m); }
      }
    }
    return orig.apply(this, a);
  };
}
/** count the asks of ONE synchronous run */
function countRun(root, fn) {
  counting = { root, epoch: 0, by: new Map(), writes: [] };
  try { quiet(fn); } finally { /* the run's asks are what it asked */ }
  const c = counting; counting = null;
  const rows = [...c.by].map(([k, m]) => ({ epoch: Number(k.slice(0, k.indexOf('\0'))), p: k.slice(k.indexOf('\0') + 1), m, n: [...m.values()].reduce((x, y) => x + y, 0) }));
  const asks = rows.reduce((x, r) => x + r.n, 0);
  const files = new Set(rows.map((r) => r.p)).size;
  const max = Math.max(0, ...rows.map((r) => r.n));   // per file BETWEEN TWO WRITES — the law
  const kindTotals = {};
  for (const r of rows) for (const [k, v] of r.m) kindTotals[k.replace('Sync', '')] = (kindTotals[k.replace('Sync', '')] || 0) + v;
  const worst = rows.sort((x, y) => y.n - x.n).slice(0, 4).map((r) => `${path.relative(root, r.p)} ×${r.n} (${[...r.m].map(([k, v]) => k.replace('Sync', '') + (v > 1 ? '×' + v : '')).join('+')}${c.epoch ? ', after write ' + r.epoch : ''})`);
  const kinds = (rel, kind) => rows.filter((r) => r.p === path.join(root, rel)).reduce((x, r) => x + (r.m.get(kind) || 0), 0);
  return { asks, files, max, worst, writes: c.writes, kinds, kindTotals };
}
const kindsSaid = (r) => Object.entries(r.kindTotals).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none';

// ── THE STAND-IN POOL: S conversations with their own links over M members (invented names, fake tokens built here) ──
function world({ S, M, mods = { AccountManager, engMod } }) {
  const root = tmpdir('vs-pool-reads-');
  const dataDir = path.join(root, 'data');
  const am = new mods.AccountManager({ dataDir });
  if (!am.poolSupported()) return null;
  const ids = [];
  for (let i = 0; i < M; i++) {
    const id = am.createSubscription({ name: `Member ${String.fromCharCode(65 + (i % 26))}${i}` }).id;
    fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), loginBody(i), { mode: 0o600 });
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
/** the runs the law names — each its OWN synchronous run (a macrotask between: a record or a broadcast never rides a pass's
 *  answers); the second pass is the STEADY one (nothing changed since the first) */
async function runs(w) {
  const first = [...w.sessions.values()][0];
  await turn();
  const pass = countRun(w.root, () => w.eng.maybePoolAutoSwitchForPool(w.P, { force: true }));
  await turn();
  const steady = countRun(w.root, () => w.eng.maybePoolAutoSwitchForPool(w.P, { force: true }));
  await turn();
  const record = countRun(w.root, () => { w.eng.resolveUsageKey(first); w.eng.cacheFactsOf(first); });   // a MODEL of one stdout usage record
  await turn();
  const broadcast = countRun(w.root, () => { for (const [sid, s] of w.sessions) { try { w.am.poolMemberOfSession(w.P, s, sid); } catch { } } });   // a MODEL of one broadcast
  return { pass, steady, record, broadcast };
}

console.log('① THE COUNTING LEG — one pass, a steady pass, one record, one broadcast over a stand-in pool (sizes are parameters)');
const TODAY = (() => { const f = copyOf('src/run-reads.js', RR_SRC, 'function ask(kind, p, fn) {\n', 'function ask(kind, p, fn) {\n  return fn();\n', 'today'); return f ? require(f) : null; })();
ok(!!TODAY, 'RED CONTROL: the pass-through copy of the helper (today\'s asks) is built — its needle hits once');
const SIZES = [{ S: 3, M: 2 }, { S: 12, M: 6 }];
const said = [];
for (const { S, M } of SIZES) {
  const w = world({ S, M });
  if (!w) { ok(true, 'pools unsupported on ' + process.platform + ' — SKIPPED (said as a skip, never a pass)'); continue; }
  if (!TODAY) continue;
  const wt = world({ S, M });
  const memo = await runs(w);
  const today = await withAsks(TODAY, () => runs(wt));
  for (const k of ['pass', 'steady', 'record', 'broadcast']) {
    console.log(`    S=${S} M=${M} ${k}: today at least ${today[k].asks} asks over ${today[k].files} files (max ${today[k].max} per file: ${today[k].worst.join(', ')}) · with the memo ${memo[k].asks} asks over ${memo[k].files} files (max ${memo[k].max}; ${kindsSaid(memo[k])}) · writes in it: ${memo[k].writes.length ? memo[k].writes.join(', ') : 'none'}`);
    ok(memo[k].max <= 1, `S=${S} M=${M}: in ONE ${k} every file is asked of the mount at most once between two writes (${memo[k].asks} asks over ${memo[k].files} files, ${memo[k].writes.length} write(s))`, memo[k].worst);
  }
  // THE FLOOR: the pass ran — every member's reading and sign-in file and every conversation's link was asked, by its kind
  const rel = (p) => path.relative(w.root, p);
  const missed = [];
  for (const k of ['pass']) {
    for (const id of w.ids) {
      if (memo[k].kinds(rel(path.join(w.cacheDir, id + '.json')), 'readFileSync') < 1) missed.push(`${k}: reading ${id}`);
      if (memo[k].kinds(rel(w.am.subCredsPath(id)), 'openSync') < 1) missed.push(`${k}: sign-in file ${id}`);
    }
    for (const sid of w.sessions.keys()) if (memo[k].kinds(rel(w.am.sessionPoolLinkPath(w.P, sid)), 'readlinkSync') < 1) missed.push(`${k}: link ${sid}`);
  }
  ok(!missed.length, `S=${S} M=${M} THE FLOOR: in the pass every member's reading (a read) and sign-in file (an open) and every conversation's link (a readlink) is asked at least once — the pass ran`, missed.slice(0, 6));
  ok(memo.steady.writes.length === 0, `S=${S} M=${M}: the steady pass writes nothing under the watched folders (a pass that wrote every run would drop its own memo every run)`, memo.steady.writes);
  ok(today.pass.max > 1 && today.pass.asks > memo.pass.asks && today.steady.asks > memo.steady.asks, `S=${S} M=${M} RED CONTROL: today's pass asks the same files again and again — at least ${today.pass.asks} asks (max ${today.pass.max} per file) against ${memo.pass.asks}; steady ${today.steady.asks} against ${memo.steady.asks}`, today.pass.worst);
  said.push(`S=${S} M=${M}: one pass at least ${today.pass.asks} asks today → ${memo.pass.asks} with the memo (${memo.pass.files} files, ${memo.pass.writes.length} write(s) in it); the steady pass ${today.steady.asks} → ${memo.steady.asks}; one record ${today.record.asks} → ${memo.record.asks} (${kindsSaid(memo.record)}); one broadcast ${today.broadcast.asks} → ${memo.broadcast.asks}`);
}
console.log('    THE NUMBERS: ' + said.join(' · '));

console.log('② THE MEMO NEVER OUTLIVES ITS SYNCHRONOUS RUN');
{
  const w = world({ S: 1, M: 1 });
  const p = path.join(w.cacheDir, w.ids[0] + '.json');
  await turn();
  const one = countRun(w.root, () => { RR.readText(p); RR.readText(p); RR.readText(p); });
  await turn();   // the second half is its OWN run
  counting = { root: w.root, epoch: 0, by: new Map(), writes: [] };
  RR.readText(p);
  await null;   // the run ends at its microtask checkpoint
  RR.readText(p);
  const two = (counting.by.get('0\0' + path.resolve(p)) || new Map()).get('readFileSync') || 0; counting = null;
  ok(one.asks === 1 && two === 2, `three asks in one run are ONE ask of the mount; two asks with an await between them are TWO (${one.asks}, ${two})`);
}

console.log('③ AN ERROR IS AN ANSWER FOR THE RUN');
{
  const w = world({ S: 1, M: 1 });
  const p = path.join(w.cacheDir, 'never-written.json');
  const codes = [];
  await turn();
  const r = countRun(w.root, () => { for (let i = 0; i < 3; i++) { try { RR.readText(p); codes.push('read'); } catch (e) { codes.push(e.code); } } });
  ok(r.asks === 1 && codes.every((c) => c === 'ENOENT'), `a missing file asked three times in one run is ONE ask, and every asker sees «no such file» (${r.asks}; ${codes.join(',')})`);
}

console.log('④ A READ AFTER A WRITE OF THIS PROCESS IN THE SAME RUN SEES THE WRITE — BY CONSTRUCTION');
const MAT = require(path.join(REPO, 'src/account-material.js'));
const afterWrites = (rr) => {
  const w = world({ S: 2, M: 2 });
  // a copy watches exactly what the owners watch — an empty watch list memoizes nothing and could prove nothing
  for (const d of [w.cacheDir, path.join(w.dataDir, 'pool-links'), path.join(w.dataDir, 'subs')]) rr.watch(d);
  const p = path.join(w.cacheDir, w.ids[0] + '.json');
  const creds = w.am.subCredsPath(w.ids[1]);
  let r = null;
  quiet(() => {
    const before = rr.readText(p);
    fs.writeFileSync(p, JSON.stringify({ fetchedAt: 1, marker: 'written-in-the-run' }));   // a writer nobody listed
    const after = rr.readText(p);
    const linkBefore = w.am.poolCurrentFor(w.P, 'conv-0');
    w.am.ensureSessionPoolLink(w.P, 'conv-0', w.ids[1], { why: 'per-session-switch' });   // the link writer re-points
    const linkAfter = w.am.poolCurrentFor(w.P, 'conv-0');
    const tokBefore = JSON.parse(rr.facts(creds).text).claudeAiOauth.accessToken;
    MAT.writePrivateFile(creds, loginBody('again'));   // a sign-in file written (the one 0600 writer: a temp open, its descriptor writes, a rename)
    const tokAfter = JSON.parse(rr.facts(creds).text).claudeAiOauth.accessToken;
    r = { sawWrite: /written-in-the-run/.test(after || '') && before !== after, linkMoved: linkBefore === w.ids[0] && linkAfter === w.ids[1], sawLogin: tokBefore !== tokAfter && tokAfter === tok('aagain') };
  });
  return r;
};
{
  const r = afterWrites(RR);
  ok(r.sawWrite, 'a bare fs.writeFileSync under a watched folder (a writer nobody listed) is seen by the next read in the SAME run', r);
  ok(r.linkMoved, 'a link the link writer re-points is seen by the next read of it in the SAME run', r);
  ok(r.sawLogin, 'a sign-in file written between two asks in the SAME run is seen by the second', r);
  const f = copyOf('src/run-reads.js', RR_SRC, 'clear: () => { if (run) run.clear(); } };', 'clear: () => { } };', 'blind');
  ok(!!f, 'RED CONTROL: the drop\'s needle hits once in a copy of the helper');
  if (f) {
    const blind = require(f);
    const rb = await withAsks(blind, () => afterWrites(blind));
    ok(!rb.sawWrite && !rb.linkMoved && !rb.sawLogin, 'RED CONTROL: a copy whose drop does nothing, watching the same folders, serves the STALE answer after its own write — the reading, the link and the sign-in file all three', rb);
  }
}

console.log('⑤ THE RATCHET — every Sync function of the RUNNING runtime is classed exactly once');
const READS = new Set(['accessSync', 'existsSync', 'globSync', 'lstatSync', 'opendirSync', 'readdirSync', 'readFileSync', 'readlinkSync', 'realpathSync', 'statSync', 'statfsSync']);
const FD_READS = new Set(['closeSync', 'fdatasyncSync', 'fstatSync', 'fsyncSync', 'readSync', 'readvSync']);   // a descriptor call that changes nothing a read sees
const SYNCS = Object.keys(fs).filter((k) => /^[a-z][A-Za-z]*Sync$/.test(k) && typeof fs[k] === 'function');
const unclassed = SYNCS.filter((k) => [READS.has(k), FD_READS.has(k), RR.FD_WRITES.includes(k), Object.prototype.hasOwnProperty.call(RR.WRITES, k)].filter(Boolean).length !== 1);
ok(SYNCS.length > 30 && !unclassed.length, `every Sync function of node ${process.version} (${SYNCS.length}) is a read, a descriptor call, a descriptor write (run-reads FD_WRITES) or a path write (run-reads WRITES) — an unclassed one (a new runtime's) is RED until classed`, unclassed);

console.log('⑥ EVERY PATH WRITE AND EVERY DESCRIPTOR WRITE between two asks in one run is seen by the second (table-driven)');
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
  await turn();
  for (const name of Object.keys(RR.WRITES)) {
    if (typeof fs[name] !== 'function') continue;   // not in this runtime
    if (!ARGS[name]) { noArgs.push(name); continue; }
    const d = path.join(w.cacheDir, 'w-' + name); fs.mkdirSync(path.join(d, 'sub'), { recursive: true }); fs.writeFileSync(path.join(d, 'f'), 'y');
    await turn();
    const r = countRun(w.root, () => {
      RR.readdir(d);
      const out = fs[name](...ARGS[name](d));
      if (name === 'openSync' && typeof out === 'number') fs.closeSync(out);
      RR.readdir(d);
    });
    if (r.kinds(path.relative(w.root, d), 'readdirSync') !== 2) unseen.push(name);   // the folder's own asks: the second is a new one
  }
  ok(!unseen.length && !noArgs.length, `every path write of this runtime (${Object.keys(RR.WRITES).filter((n) => typeof fs[n] === 'function').length}) between two asks of a watched folder in ONE run makes the second a new ask`, { unseen, noArgs });
  // THE DESCRIPTOR WRITES: a write-flagged open under the folder made in an EARLIER run — its descriptor is kept across runs
  const FDARGS = { writeSync: (fd) => [fd, 'x'], writevSync: (fd) => [fd, [Buffer.from('x')]], ftruncateSync: (fd) => [fd, 0], futimesSync: (fd) => [fd, t, t], fchmodSync: (fd) => [fd, 0o600], fchownSync: (fd) => [fd, uid, gid], 'writeFileSync(fd)': (fd) => [fd, 'x'], 'appendFileSync(fd)': (fd) => [fd, 'x'] };
  const d2 = path.join(w.cacheDir, 'fd'); fs.mkdirSync(d2, { recursive: true });
  const fd = fs.openSync(path.join(d2, 'f'), 'w');
  const fdUnseen = [];
  for (const [label, args] of Object.entries(FDARGS)) {
    const fn = fs[label.replace('(fd)', '')];
    if (typeof fn !== 'function') continue;
    await turn();
    const r = countRun(w.root, () => { RR.readdir(d2); fn(...args(fd)); RR.readdir(d2); });
    if (r.kinds(path.relative(w.root, d2), 'readdirSync') !== 2) fdUnseen.push(label);
  }
  fs.closeSync(fd);
  // CONTROL (precision): a descriptor opened for writing OUTSIDE the watched folders drops nothing
  const outside = tmpdir('vs-pool-reads-out-'); const fdo = fs.openSync(path.join(outside, 'f'), 'w');
  await turn();
  const kept = countRun(w.root, () => { RR.readdir(d2); fs.writeSync(fdo, 'x'); RR.readdir(d2); });
  fs.closeSync(fdo);
  ok(!fdUnseen.length && RR.FD_WRITES.every((n) => FDARGS[n]) && kept.kinds(path.relative(w.root, d2), 'readdirSync') === 1, `every descriptor write (${RR.FD_WRITES.join(', ')}, and writeFileSync / appendFileSync handed a descriptor) through a descriptor opened for writing under a watched folder makes the next ask new; one opened elsewhere keeps the memo`, { fdUnseen, kept: kept.asks });
}

console.log('⑦ ONE WRAPPER PER PROCESS — a second copy of the module, one write, both memos gone');
{
  const w = world({ S: 1, M: 1 });
  const p = path.join(w.cacheDir, w.ids[0] + '.json');
  const B = require(MU.write('src/run-reads.js', RR_SRC, 'second'));
  B.watch(w.cacheDir);
  const G = globalThis[Symbol.for('vibespace.run-reads.writes')];
  await turn();
  const r = countRun(w.root, () => {
    RR.readText(p); B.readText(p); RR.readText(p); B.readText(p);   // each copy's own memo: two asks
    fs.writeFileSync(p, JSON.stringify({ fetchedAt: 2 }));           // ONE write …
    RR.readText(p); B.readText(p);                                   // … drops BOTH: two more asks
  });
  ok(r.asks === 4 && G && G.copies.size >= 2 && G.installed.get('writeFileSync') && fs.writeFileSync === G.installed.get('writeFileSync'), `two copies in one process: one wrapper (found by the process-wide key, not a mark on a function), and one write drops every copy's memo (${r.asks} asks; ${G ? G.copies.size : 0} copies)`, { asks: r.asks });
}

console.log('⑧ A TICK CALLBACK AND AN ALREADY-QUEUED CONTINUATION SHARE THE RUN\'S ANSWERS (nothing outside the process can have been heard)');
{
  const w = world({ S: 1, M: 1 });
  const p = path.join(w.cacheDir, w.ids[0] + '.json');
  const seenBy = [];
  // a run begun in a MACROTASK — where the pool pass (a timer), a record (an I/O callback) and a broadcast run
  await new Promise((done) => setImmediate(() => {
    counting = { root: w.root, epoch: 0, by: new Map(), writes: [] };
    Promise.resolve().then(() => { RR.readText(p); seenBy.push('continuation'); });   // queued BEFORE the run's first ask
    RR.readText(p);                                                                     // the run's first ask: its drop queued after
    process.nextTick(() => { RR.readText(p); seenBy.push('tick'); });
    setImmediate(done);
  }));
  const n = (counting.by.get('0\0' + path.resolve(p)) || new Map()).get('readFileSync') || 0; counting = null;
  ok(n === 1 && seenBy.length === 2, `a nextTick callback of the run and a promise continuation queued before it began read from the run's answers — ONE ask (${n}; ${seenBy.join(', ')})`);
}

console.log('⑨ NO MODULE HOLDS AN fs WRITE FUNCTION FROM BEFORE THE WRAP — a census derived by search over src and server.js');
{
  const files = execFileSync('git', ['-C', REPO, 'ls-files', '-z', '--', 'src', 'server.js'], { encoding: 'utf8' }).split('\0').filter((f) => /\.(c|m)?js$/.test(f));
  const W = [...Object.keys(RR.WRITES), ...RR.FD_WRITES, 'closeSync'].join('|');
  const DESTR = /\{([^{}]*)\}\s*=\s*(?:require\(\s*['"](?:node:)?fs['"]\s*\)|fs\b)/g;
  const ALIAS = new RegExp(`=\\s*(?:require\\(\\s*['"](?:node:)?fs['"]\\s*\\)|fs)\\.(?:${W})\\b(?!\\s*\\()`, 'g');
  const scan = (text) => [...[...text.matchAll(DESTR)].filter((m) => new RegExp(`\\b(?:${W})\\b`).test(m[1])).map((m) => `{ ${m[1].trim().slice(0, 60)} }`), ...[...text.matchAll(ALIAS)].map((m) => m[0].slice(0, 60))];
  // the two modules that wrap fs's functions by design hold the function they wrap inside their wrapper
  const BY_DESIGN = new Set(['src/run-reads.js', 'src/server/loop-blame.js']);
  const hits = [];
  for (const f of files) {
    if (BY_DESIGN.has(f)) continue;
    let text = ''; try { text = fs.readFileSync(path.join(REPO, f), 'utf8'); } catch { continue; }
    for (const h of scan(text)) hits.push(`${f}: ${h}`);
  }
  ok(files.length > 300 && !hits.length, `no module destructures or aliases an fs write function (${files.length} files searched; by design: ${[...BY_DESIGN].join(', ')})`, hits);
  const planted = scan('const { writeFileSync } = require(\'fs\');\nconst w2 = fs.renameSync;\nconst { writeSync: ws } = fs;\n');
  ok(planted.length === 3, `CONTROL: a planted destructured write (from require and from fs), and a planted alias are all found by the census (${planted.length})`, planted);
}

console.log('⑩ THE LOOP WITNESS INSTALLED AFTER THIS MODULE KEEPS ITS WRAPPER INSIDE');
{
  const w = world({ S: 1, M: 1 });
  const p = path.join(w.cacheDir, w.ids[0] + '.json');
  const LB = require(path.join(REPO, 'src/server/loop-blame.js'));
  LB.install({ fsMod: fs });
  await turn();
  const r = countRun(w.root, () => { RR.readText(p); fs.writeFileSync(p, JSON.stringify({ fetchedAt: 3 })); RR.readText(p); });
  ok(LB.isWrapped(fs.writeFileSync) && r.asks === 2, `with the witness wrapped around it, a write still drops the memo (${r.asks} asks)`);
}

console.log('⑪ WHAT IS SAID MEMOIZED IS WHAT IS WATCHED — every path the routed readers ask in a pass, a record and a broadcast is under a watched folder');
async function routedPaths(mods) {
  const w = world({ S: 3, M: 2, mods });
  const seen = new Set();
  const rec = {};
  for (const k of ASK_FNS) { const f = RR[k]; rec[k] = (p, ...r) => { if (typeof p === 'string') seen.add(path.resolve(p)); return f(p, ...r); }; }
  await withAsks(rec, () => runs(w));
  const mine = [...seen].filter((p) => p.startsWith(w.root + path.sep));
  const folders = [...new Set(mine.map((p) => path.relative(w.root, p).split(path.sep).slice(0, 2).join('/')))].sort();
  return { n: mine.length, folders, unwatched: mine.filter((p) => !RR.watched(p)).map((p) => path.relative(w.root, p)) };
}
{
  const real = await routedPaths({ AccountManager, engMod });
  ok(real.n > 10 && ['data/pool-links', 'data/subs', 'data/usage-cache'].every((f) => real.folders.includes(f)) && !real.unwatched.length, `the routed readers asked ${real.n} paths in ${real.folders.join(', ')} — every one under a folder its owner watches`, real.unwatched.slice(0, 6));
  const f = copyOf('src/server/usage-pool-engine.js', ENG_SRC, '  RR.watch(USAGE_CACHE_DIR);', '  void USAGE_CACHE_DIR;', 'unwatched');
  ok(!!f, 'RED CONTROL: the engine\'s watch line hits once in a copy of it');
  if (f) {
    const red = await routedPaths({ AccountManager, engMod: require(f) });
    ok(red.unwatched.some((p) => p.startsWith('data/usage-cache' + path.sep)), `RED CONTROL: an engine that does not watch its readings (a5bab1744) routes ${red.unwatched.length} reading path(s) nobody watches — red by name`, red.unwatched.slice(0, 3));
  }
}

console.log('⑫ A SIGN-IN FILE WHOSE STAT ANSWERS KEEPS ITS SIGNATURE — memberLoginState across runs, exactly as at the release');
/** the mount's moment: an open of `fp` for reading fails (EIO) while its stat still answers */
const failOpen = (fp, fn) => {
  const o = fs.openSync;
  fs.openSync = function (p, f, ...r) { if (typeof p === 'string' && path.resolve(p) === path.resolve(fp) && !writesOpen(f)) throw Object.assign(new Error(`EIO: i/o error, open '${p}'`), { code: 'EIO', errno: -5, syscall: 'open', path: p }); return o.call(this, p, f, ...r); };
  try { return fn(); } finally { fs.openSync = o; }
};
async function loginScenes(mod) {
  const mods = { AccountManager, engMod: mod };
  // SCENE ONE: a live member; then its open fails for a moment while the stat answers (unchanged)
  const w1 = world({ S: 1, M: 1, mods });
  const id1 = w1.ids[0], fp1 = w1.am.subCredsPath(id1);
  await turn(); const a = quiet(() => w1.eng.memberLoginState(id1));
  await turn(); const b = failOpen(fp1, () => quiet(() => w1.eng.memberLoginState(id1)));
  // SCENE TWO: a missing sign-in file; then it is written and cannot be read
  const w2 = world({ S: 1, M: 1, mods });
  const id2 = w2.ids[0], fp2 = w2.am.subCredsPath(id2);
  const body = fs.readFileSync(fp2, 'utf8'); fs.unlinkSync(fp2);
  await turn(); const c = quiet(() => w2.eng.memberLoginState(id2));
  fs.writeFileSync(fp2, body);
  await turn(); const d = failOpen(fp2, () => quiet(() => w2.eng.memberLoginState(id2)));
  return { one: [a && a.state, b && b.state], two: [c && c.state, d && d.state] };
}
{
  const r = await loginScenes(engMod);
  ok(r.one[0] === 'live' && r.one[1] === 'live', `scene one: a live member whose open fails for a moment while its stat answers stays «live» (the release's answer: the signature did not move) — ${r.one.join(' → ')}`);
  ok(r.two[0] === 'missing' && r.two[1] === 'unreadable', `scene two: a missing sign-in file that appears and cannot be read is «unreadable», never the remembered «missing» — ${r.two.join(' → ')}`);
  const f = copyOf('src/server/usage-pool-engine.js', ENG_SRC, 'catch (e) { if (e && Number.isFinite(e.mtimeMs)) sig = `${e.mtimeMs}:${e.size}`; }', 'catch { }', 'sig-from-read');
  ok(!!f, 'RED CONTROL: the signature line hits once in a copy of the engine');
  if (f) {
    const red = await loginScenes(require(f));
    ok(red.one[1] !== 'live' && red.two[1] === 'missing', `RED CONTROL: with the signature taken from the read (a5bab1744) the healthy member reads ${red.one[1]} for that run and the unreadable file stays «${red.two[1]}»`, red);
  }
}

console.log('⑬ NOTHING AT LOAD, AND THE HELPER\'S OWN MUTANTS — each in a child process (the wrappers are process-wide)');
{
  const dir = tmpdir('vs-pool-reads-child-');
  const probeFile = path.join(dir, 'probe.cjs');
  fs.writeFileSync(probeFile, `'use strict';
const fs = require('fs'); const path = require('path');
const [rrPath, probe, dir, extra] = process.argv.slice(2);
const out = (o) => process.stdout.write(JSON.stringify(o));
const names = Object.keys(fs).filter((k) => typeof fs[k] === 'function');
const before = new Map(names.map((k) => [k, fs[k]]));
const same = () => names.every((k) => fs[k] === before.get(k));
const RR = require(rrPath);
if (probe === 'load') {
  const untouched = same() && !globalThis[Symbol.for('vibespace.run-reads.writes')];
  if (extra) require(extra);
  const descriptor = same();
  RR.watch(dir);
  out({ pass: untouched && descriptor && ['writeFileSync', 'renameSync', 'openSync', 'writeSync', 'closeSync'].every((k) => fs[k] !== before.get(k)), untouched, descriptor });
  return;
}
RR.watch(dir);
const f = path.join(dir, 'f'); fs.writeFileSync(f, 'one');
let n = 0; const r0 = fs.readFileSync; fs.readFileSync = function (...a) { if (typeof a[0] === 'string') n++; return r0.apply(this, a); };
if (probe === 'open-write') { const a = RR.readText(f); const fd = fs.openSync(f, 'w'); fs.writeSync(fd, 'two'); fs.closeSync(fd); const b = RR.readText(f); out({ pass: a === 'one' && b === 'two', a, b }); }
else if (probe === 'sibling') { const s = dir + '-sib'; fs.mkdirSync(s, { recursive: true }); const g = path.join(s, 'g'); fs.writeFileSync(g, 'x'); n = 0; RR.readText(g); RR.readText(g); fs.rmSync(s, { recursive: true, force: true }); out({ pass: n === 2, n }); }
else if (probe === 'stat-on-error') { const o = fs.openSync; fs.openSync = function (p, fl, ...r) { if (p === f) throw Object.assign(new Error('EIO'), { code: 'EIO' }); return o.call(this, p, fl, ...r); }; let e = null; try { RR.facts(f); } catch (x) { e = x; } fs.openSync = o; out({ pass: !!e && e.code === 'EIO' && Number.isFinite(e.mtimeMs) && e.size === 3 }); }
else if (probe === 'not-a-link') { out({ pass: RR.entryExists(f) === true && RR.entryExists(path.join(dir, 'nope')) === false }); }
else if (probe === 'listing-copy') { const a = RR.readdir(dir); a.push('planted'); const b = RR.readdir(dir); out({ pass: !b.includes('planted') }); }
else out({ pass: false, err: 'unknown probe ' + probe });
`);
  const child = (rr, probe) => { try { return JSON.parse(execFileSync(process.execPath, [probeFile, rr, probe, fs.mkdtempSync(path.join(dir, 'p-')), path.join(REPO, 'src/harnesses/claude.js')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); } catch (e) { return { pass: false, err: String(e.stderr || e.message).slice(0, 200) }; } };
  const MUTANTS = [
    ['load', 'module.exports = {', 'arm();\nmodule.exports = {', 'a require wraps fs (the wrap at load, a5bab1744)'],
    ['open-write', 'lchownSync: [0], openSync: [0],', 'lchownSync: [0],', 'the write-flagged open\'s row removed'],
    ['sibling', 'r.startsWith(root + path.sep)', 'r.startsWith(root)', 'the folder test without its separator (a sibling folder with the same prefix)'],
    ['stat-on-error', 'try { const st = fs.statSync(p); e.mtimeMs = st.mtimeMs; e.size = st.size; } catch { }', 'try { } catch { }', 'the stat dropped from an ask\'s error'],
    ['not-a-link', 'catch (e) { return !!(e && e.code === \'EINVAL\'); }', 'catch (e) { return false; }', '«not a link» read as «no entry»'],
    ['listing-copy', 'fs.readdirSync(p)).slice();', 'fs.readdirSync(p));', 'the folder listing returned without its copy'],
  ];
  const real = {}, caught = [], missed = [];
  for (const [probe, from, to, what] of MUTANTS) {
    real[probe] = child(RRpath, probe);
    const f = copyOf('src/run-reads.js', RR_SRC, from, to, 'mut-' + probe);
    if (!f) { missed.push(`${probe}: needle moved`); continue; }
    const m = child(f, probe);
    (m.pass ? missed : caught).push(`${what}${m.pass ? '' : ''}`);
  }
  ok(real.load && real.load.pass, 'NOTHING AT LOAD: in a fresh process, requiring the helper — and the claude harness descriptor the device agent\'s bundle loads — leaves every fs function the runtime\'s own; the first watch() wraps the writes', real.load);
  ok(MUTANTS.every(([p]) => real[p] && real[p].pass), 'the real helper passes every probe (an open for writing, a sibling folder, a failed open\'s stat, a non-link entry, a listing\'s copy)', real);
  ok(!missed.length && caught.length === MUTANTS.length, `RED CONTROLS: every mutant of the helper is caught by its probe — ${caught.join(' · ')}`, missed);
}

console.log('⑭ A LOOK-AGAIN READ ASKS THE MOUNT ITSELF — another process changes a sign-in folder or a link in the middle of a run');
{
  const otherProcess = (code) => execFileSync(process.execPath, ['-e', code], { stdio: ['ignore', 'pipe', 'pipe'] });
  const writes = (p, text) => otherProcess(`const fs = require('fs'); fs.mkdirSync(require('path').dirname(${JSON.stringify(p)}), { recursive: true }); fs.writeFileSync(${JSON.stringify(p)}, ${JSON.stringify(text)})`);
  const refused = (fn) => { try { fn(); return 'written'; } catch (e) { return /not logged in/.test(e.message) ? 'refused' : 'threw: ' + e.message; } };
  const SITES = [
    ['ensureSessionPoolLink — a billing link written to a member another process just signed out', (w) => {
      const m = w.ids[1];
      return { prime: () => w.am.readSubCreds(m).loggedIn, change: () => writes(w.am.subCredsPath(m), loginBody('gone', false)), act: () => refused(() => w.am.ensureSessionPoolLink(w.P, 'conv-0', m, { why: 'leg' })), want: 'refused' };
    }],
    ['setPoolTarget — the pool default written to a member another process just signed out', (w) => {
      const m = w.ids[1];
      return { prime: () => w.am.readSubCreds(m).loggedIn, change: () => writes(w.am.subCredsPath(m), loginBody('gone', false)), act: () => refused(() => w.am.setPoolTarget(w.P, m)), want: 'refused' };
    }],
    ['discardPendingSignin — a row removed that another process just signed in', (w) => {
      const id = w.am.createSubscription({ signinPending: true }).id;
      return { prime: () => w.am.readSubCreds(id).loggedIn, change: () => writes(w.am.subCredsPath(id), loginBody('late')), act: () => (w.am.discardPendingSignin(id) ? 'removed' : 'kept'), want: 'kept' };
    }],
    ['pendingSignin — a row handed to a new sign-in that another process just signed in', (w) => {
      const id = w.am.pendingSignin().id;
      return { prime: () => w.am.readSubCreds(id).loggedIn, change: () => writes(w.am.subCredsPath(id), loginBody('late')), act: () => (w.am.pendingSignin().id === id ? 'handed out again' : 'a new row'), want: 'a new row' };
    }],
    ['reloginResolve — a login another process just completed', (w) => {
      const id = w.am.createSubscription({ signinPending: true }).id;
      return { prime: () => w.am.readSubCreds(id).loggedIn, change: () => writes(w.am.subCredsPath(id), loginBody('late')), act: () => w.am.reloginResolve(id).outcome, want: 'same' };
    }],
    ['the ledger\'s «from» before a link re-point — a link another process just re-pointed', (w) => {
      const link = w.am.sessionPoolLinkPath(w.P, 'conv-0'), to = w.am.subDir(w.ids[1]);
      return {
        prime: () => w.am.poolCurrentFor(w.P, 'conv-0'),
        change: () => otherProcess(`const fs = require('fs'); const t = ${JSON.stringify(link + '.other')}; try { fs.unlinkSync(t); } catch { } fs.symlinkSync(${JSON.stringify(to)}, t); fs.renameSync(t, ${JSON.stringify(link)});`),
        act: () => { w.am.ensureSessionPoolLink(w.P, 'conv-0', w.ids[0], { why: 'leg' }); const rows = w.am.slotTransitions.all(); return rows.length ? rows[rows.length - 1].from : null; },
        want: w.ids[1],
      };
    }],
  ];
  for (const [label, make] of SITES) {
    const w = world({ S: 1, M: 2 });
    const s = make(w);
    await turn();
    let r = null;
    quiet(() => { const before = s.prime(); s.change(); const memo = s.prime(); const got = s.act(); r = { before, memo, got }; });   // ONE synchronous run
    ok(r.got === s.want && r.memo === r.before, `${label}: the check looks again (${JSON.stringify(r.got)}) while the run's memo still answers the old state (${JSON.stringify(r.memo)} — the control in kind)`, r);
  }
}

console.log('⑮ dropRun() — the hand-off for a write no wrapper sees — drops every copy\'s memo');
{
  const w = world({ S: 1, M: 1 });
  const p = path.join(w.cacheDir, w.ids[0] + '.json');
  const B = require(MU.write('src/run-reads.js', RR_SRC, 'drop-second'));
  B.watch(w.cacheDir);
  await turn();
  const r = countRun(w.root, () => { RR.readText(p); B.readText(p); RR.dropRun(); RR.readText(p); B.readText(p); });
  await turn();
  const c = countRun(w.root, () => { RR.readText(p); B.readText(p); RR.readText(p); B.readText(p); });
  ok(r.asks === 4 && c.asks === 2, `two copies, two asks each with dropRun() between: 4 asks of the mount (without it: ${c.asks})`, { r: r.asks, c: c.asks });
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

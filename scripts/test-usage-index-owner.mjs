#!/usr/bin/env node
// THE USAGE INDEX SHADOW — THE OWNER (design 011 lane 3, L1): the index is
// rebuildable and feeds nothing, so every way it can fail must leave the
// server untouched and SAY which way it failed. Against the REAL worker on
// scratch HOMEs (child processes where a process must die):
//  §1 kill -9 in the middle of the first build, and in a stream of pushes →
//     the next start recovers from its shard marks to parity
//  §2 a deleted usage.db, a newer and an older user_version, a file that is
//     not a database → rebuilt, parity
//  §3 a second server on the same data/ is refused at once and says so by
//     name; the first keeps answering
//  §4 a query past its deadline answers 503 "unresponsive" and the worker
//     LIVES (same thread answers the next call)
//  §5 SIGTERM returns within the bound even with the worker wedged in a
//     syscall (CONTROL: without the exit hook process.exit() never returns);
//     the real worker closes clean on SIGTERM
//  §6 a write failure (SQLITE_FULL — the max_page_count stand-in for ENOSPC)
//     turns the shadow off by name; a Node without node:sqlite is off by
//     name; a worker that dies is named; the ledger never notices
//  §7 scripts/ci.mjs sweeps index directories whose data/ is gone, and only those
//  §8 verify r1, each with its pre-fix CONTROL: an unmounted transcript root
//     (an EMPTY mount point) drops no live cursor; a full disk gets its room
//     back; the worker's heap is capped; a wall-clock step back after a
//     deadline does not keep the index "unresponsive"
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { UsageHistory } = require(path.join(REPO, 'src/usage-history.js'));
const UI = require(path.join(REPO, 'src/server/usage-index.js'));
const M = require(path.join(REPO, 'src/usage-index-model.js'));
const emit = process.emitWarning; // node:sqlite's one ExperimentalWarning is expected here
process.emitWarning = function (w, ...a) { if (/SQLite is an experimental feature/.test(String((w && w.message) || w))) return; return emit.call(this, w, ...a); };
const { DatabaseSync } = require('node:sqlite'); // the SUITE inspects files the owner left — src/ names node:sqlite in one file only
process.emitWarning = emit;
const { sweepUsageIndexDirs } = await import(path.join(REPO, 'scripts/ci.mjs'));

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-uidx-own-'));
const T0 = Date.now(), el = () => `(+${Date.now() - T0} ms)`;
const quiet = { log() { }, error() { } };
const owners = [];
const mkOwner = (uh, home, extra = {}) => { const ix = UI.create({ getLedger: () => uh, homeDir: home, log: quiet, ...extra }); owners.push(ix); return ix; };
async function until(f, what, ms = 30000) { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timed out waiting for ' + what); await sleep(10); } }
const readyOf = (ix) => until(() => ix.available().ok, 'ready (' + JSON.stringify(ix.stats().reason) + ')');
const T = (y, m, d, h = 0) => Date.UTC(y, m - 1, d, h);
const PIV = [['session', 'origin'], ['day', 'account'], ['hour', 'model']];
async function same(uh, ix, q = { pivots: PIV }) {
  const r = M.compareAggregates(uh.aggregate(q), M.finalizeAggregate(await ix.queryAggregate(q), (c) => uh._cost(c, c.prompt)));
  return r.same ? '' : JSON.stringify(r.diffs.slice(0, 3));
}
const SIDS = Array.from({ length: 30 }, (_, i) => `${String(i).padStart(8, '0')}-aaaa-4bbb-8ccc-dddd00000000`);
let seed = 5; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const line = (k, ts) => JSON.stringify({ rid: 'req_' + k, mid: 'msg_' + k, ts, sid: SIDS[k % 30], be: k % 9 ? 'claude' : 'codex', model: ['claude-opus-5-5', 'claude-fable-5-1', 'gpt-5.6-sol'][k % 3], acct: ['sub-a', 'sub-b', null][k % 3], pool: k % 4 ? undefined : 'pool-1', atype: ['subscription', 'subscription', 'global'][k % 3], aname: null, mode: 'chat', host: null, cwd: '/w/p' + (k % 7), origin: ['main', 'subagent', 'workflow'][k % 3], i: k % 997, cw5: k % 5 ? 0 : 2000, cw1: 0, cr: 30000 + (k % 13), o: 400 + (k % 31), tier: 'standard', pad: 'x'.repeat(120) });
function ledger(name, n, { months = [8, 9] } = {}) {
  const data = path.join(root, name, 'data'), home = path.join(root, name, 'home');
  const hist = path.join(data, 'usage-history');
  fs.mkdirSync(hist, { recursive: true }); fs.mkdirSync(home, { recursive: true });
  const per = Math.ceil(n / months.length);
  months.forEach((m, j) => {
    const fd = fs.openSync(path.join(hist, `events-2026-${String(m).padStart(2, '0')}.ndjson`), 'w');
    let buf = [];
    for (let k = j * per; k < Math.min(n, (j + 1) * per); k++) { buf.push(line(k, T(2026, m, 1) + Math.floor(rnd() * 28 * 86400000))); if (buf.length >= 5000) { fs.writeSync(fd, buf.join('\n') + '\n'); buf = []; } }
    if (buf.length) fs.writeSync(fd, buf.join('\n') + '\n');
    fs.closeSync(fd);
  });
  return { data, home, hist, uh: () => new UsageHistory({ dataDir: data, homeDir: home }) };
}
const remote = (k, ts) => JSON.stringify({ rid: 'rr_' + k, ts, sid: SIDS[k % 30], model: 'claude-opus-5-5', i: 100 + k, cw5: 0, cw1: 0, cr: 5, o: 7, origin: 'main', cwd: '/r' });

// A child process holding an owner — what a server is, as far as the index can tell.
const childFile = path.join(root, 'child.cjs');
fs.writeFileSync(childFile, `'use strict';
const UI = require(${JSON.stringify(path.join(REPO, 'src/server/usage-index.js'))});
const { UsageHistory } = require(${JSON.stringify(path.join(REPO, 'src/usage-history.js'))});
const [data, home, extra] = process.argv.slice(2);
const opts = extra ? JSON.parse(extra) : {};
const uh = new UsageHistory({ dataDir: data, homeDir: home });
const ix = UI.create({ getLedger: () => uh, homeDir: home, log: { log() {}, error() {} }, onState: (s, r, x) => console.log('STATE ' + JSON.stringify({ s, r, code: (x && x.code) || null })), ...(opts.owner || {}) });
process.on('SIGTERM', () => process.exit(0)); // server.js's shape: shutdown ends in process.exit
ix.start();
if (opts.pushLoop) { let k = 0; setInterval(() => { const lines = []; for (let j = 0; j < 200; j++, k++) lines.push(JSON.stringify({ rid: 'loop_' + k, ts: Date.UTC(2026, 8, 2) + k * 1000, sid: 'loop', model: 'claude-opus-5-5', i: 1, cw5: 0, cw1: 0, cr: 0, o: 1 })); uh.ingestRemoteEvents('host-l', 'L', lines.join('\\n') + '\\n'); console.log('PUSHED ' + k); }, 5); }
setInterval(() => {}, 1000);
`);
const children = [];
process.on('exit', () => { for (const c of children) { try { c.kill('SIGKILL'); } catch { } } }); // an aborted run leaves no child behind
function child(data, home, extra = {}) {
  const c = spawn(process.execPath, [childFile, data, home, JSON.stringify(extra)], { stdio: ['ignore', 'pipe', 'pipe'] });
  c.out = ''; c.err = '';
  c.stdout.on('data', (d) => { c.out += d; });
  c.stderr.on('data', (d) => { c.err += d; });
  c.done = new Promise((r) => c.on('exit', (code, signal) => r({ code, signal, at: Date.now() })));
  children.push(c);
  return c;
}
const stateOf = (c) => [...c.out.matchAll(/^STATE (.*)$/gm)].map((m) => JSON.parse(m[1]));
async function killAndWait(c, sig = 'SIGKILL') { try { c.kill(sig); } catch { } return c.done; }

// ── §1 kill -9 ─────────────────────────────────────────────────────────────
console.log('§1 kill -9 mid-build and mid-push-stream → the next start recovers from its marks to parity', el());
{
  const N1 = 90000;
  const L = ledger('kill', N1); // ~34 MB: chunks of 16 + 16 + 2 MiB
  const c = child(L.data, L.home);
  const dir = UI.indexDirFor(L.data, L.home).dir;
  const size = (f) => { try { return fs.statSync(path.join(dir, f)).size; } catch { return 0; } };
  // the first 16 MiB chunk has COMMITTED: the main file grows only when a commit's auto-checkpoint copies
  // pages into it (the WAL also grows mid-transaction, when the page cache spills — not a commit signal);
  // then a random moment inside the next chunks (the whole build takes ~0.7 s here)
  await until(() => size('usage.db') > 4 * 1024 * 1024, 'the first committed chunk', 60000);
  await sleep(Math.floor(rnd() * 120));
  const ex = await killAndWait(c);
  ok(ex.signal === 'SIGKILL' && !stateOf(c).some((s) => s.s === 'ready'), 'the build was killed by SIGKILL before it said ready');
  // inspect a COPY of what the dead process left (never the original — the owner must recover THAT)
  const cp = path.join(root, 'kill', 'inspect'); fs.mkdirSync(cp);
  for (const f of ['usage.db', 'usage.db-wal']) if (fs.existsSync(path.join(dir, f))) fs.copyFileSync(path.join(dir, f), path.join(cp, f));
  const idb = new DatabaseSync(path.join(cp, 'usage.db'));
  const left = idb.prepare('SELECT COUNT(*) AS n FROM usage_event').get().n, marks = idb.prepare('SELECT shard, offset FROM shard_mark').all();
  idb.close();
  ok(left > 0 && left < N1 && marks.length >= 1, `the dead build left a committed prefix: ${left} of ${N1} rows, marks ${JSON.stringify(marks)}`);
  const uh = L.uh(); const ix = mkOwner(uh, L.home); ix.start(); await readyOf(ix);
  const st = await ix.workerStats({ check: true });
  ok(st.rows === N1 && st.integrity === 'ok', `the next start resumed from the marks: ${st.rows} rows, quick_check ${st.integrity}`);
  const d = await same(uh, ix); ok(!d, 'memory == index after the killed build', d);
  await ix.close();
  // a stream of pushes killed at a random moment (its own small ledger: the point is the pushes)
  const P = ledger('killpush', 2000);
  const c2 = child(P.data, P.home, { pushLoop: true });
  await until(() => /PUSHED \d{4,}/.test(c2.out), 'a few thousand pushed rows', 30000);
  await sleep(Math.floor(rnd() * 80));
  await killAndWait(c2);
  const uh2 = P.uh(); const ix2 = mkOwner(uh2, P.home); ix2.start(); await readyOf(ix2);
  const d2 = await same(uh2, ix2, { pivots: PIV }); const n2 = uh2.aggregate({}).totals.requests;
  ok(!d2 && n2 > 3000, `memory == index after kill -9 inside a push stream (${n2} requests)`, d2);
  await ix2.close();
}

// ── §2 rebuilds ────────────────────────────────────────────────────────────
console.log('§2 a deleted .db, a newer / older user_version, a file that is not a database → rebuilt', el());
{
  const L = ledger('rebuild', 6000);
  const uh = L.uh();
  let ix = mkOwner(uh, L.home); ix.start(); await readyOf(ix);
  const dir = ix.dir, dbf = path.join(dir, 'usage.db');
  await ix.close();
  for (const f of ['usage.db', 'usage.db-wal']) { try { fs.unlinkSync(path.join(dir, f)); } catch { } }
  ix = mkOwner(uh, L.home); ix.start(); await readyOf(ix);
  ok((await ix.workerStats()).rows === 6000 && !(await same(uh, ix)), 'a deleted usage.db is rebuilt from the shards (6000 rows, parity)');
  await ix.close();
  const plant = (sql) => { const db = new DatabaseSync(dbf); db.exec(sql); db.close(); };
  plant("INSERT INTO usage_event (rid, ts, acct_key, shard, i) VALUES ('bogus', 1788000000000, 'sub-a', 'events-2026-08.ndjson', 999999); PRAGMA user_version = 99;");
  ix = mkOwner(uh, L.home); ix.start(); await readyOf(ix);
  let st = await ix.workerStats();
  ok(st.userVersion === M.SCHEMA_VERSION && st.rows === 6000 && !(await same(uh, ix)), `a NEWER user_version (99) is deleted and rebuilt (user_version ${st.userVersion}, the planted row gone)`);
  await ix.close();
  plant("DROP TABLE usage_event; CREATE TABLE usage_event (rid TEXT PRIMARY KEY, ts INTEGER); INSERT INTO usage_event VALUES ('old', 1); PRAGMA user_version = 0;");
  ix = mkOwner(uh, L.home); ix.start(); await readyOf(ix);
  st = await ix.workerStats();
  ok(st.userVersion === M.SCHEMA_VERSION && st.rows === 6000 && !(await same(uh, ix)), 'an OLDER layout (user_version 0 with tables) is deleted and rebuilt');
  await ix.close();
  for (const f of ['usage.db-wal']) { try { fs.unlinkSync(path.join(dir, f)); } catch { } }
  fs.writeFileSync(dbf, 'this is not a database '.repeat(400));
  ix = mkOwner(uh, L.home); ix.start(); await readyOf(ix);
  ok((await ix.workerStats({ check: true })).integrity === 'ok' && !(await same(uh, ix)), 'a usage.db that is not a database (SQLITE_NOTADB) is deleted and rebuilt');
  await ix.close();
}

// ── §3 a second server ─────────────────────────────────────────────────────
console.log('§3 a second opener on the same data/ is refused and degrades by name', el());
{
  const L = ledger('second', 3000);
  const uh = L.uh(); const ix = mkOwner(uh, L.home); ix.start(); await readyOf(ix);
  const b = child(L.data, L.home);
  await until(() => stateOf(b).some((s) => s.s === 'disabled'), 'the second server to give up', 20000);
  const sb = stateOf(b).find((s) => s.s === 'disabled');
  ok(sb.r === UI.REASON.LOCKED && sb.code === 'SQLITE_BUSY', `the second server's index is off BY NAME: ${JSON.stringify(sb)}`);
  await sleep(600);
  ok(stateOf(b).filter((s) => s.s !== 'disabled').length <= 1 && !stateOf(b).some((s) => s.s === 'ready'), 'it never retries for the lock (no further state, never ready)');
  ok(ix.available().ok && !(await same(uh, ix)), 'the first server\'s index keeps answering (parity)');
  await killAndWait(b);
  await ix.close();
}

// ── §4 deadline ────────────────────────────────────────────────────────────
console.log('§4 a deadline answers 503 without killing the worker', el());
{
  const L = ledger('deadline', 25000);
  const uh = L.uh(); const ix = mkOwner(uh, L.home); ix.start(); await readyOf(ix);
  const t0 = (await ix.workerStats()).threadId;
  let err = null;
  try { await ix.queryAggregate({ pivots: PIV }, { timeoutMs: 1 }); } catch (e) { err = e; }
  ok(err && err.status === 503 && err.reason === UI.REASON.UNRESPONSIVE, `a query past its 1 ms deadline is answered 503 "${err && err.reason}"`);
  ok(ix.available().reason === UI.REASON.UNRESPONSIVE && ix.compare(uh.aggregate({}), {}) === null && ix.stats().skipped.unresponsive === 1, 'meanwhile the index says unresponsive and the comparer skips under that name');
  await until(() => ix.available().ok, 'the late answer to clear the state', 20000);
  const t1 = (await ix.workerStats()).threadId;
  ok(t1 === t0 && !(await same(uh, ix)), `the SAME worker thread answers the next calls (threadId ${t0} → ${t1}) — never terminated on a deadline`);
  await ix.close();
}

// ── §5 SIGTERM ─────────────────────────────────────────────────────────────
console.log('§5 SIGTERM returns within the bound, wedged worker or not', el());
{
  const fifo = path.join(root, 'wedge.fifo');
  execFileSync('mkfifo', [fifo]);
  const stub = path.join(root, 'wedged-worker.js');
  fs.writeFileSync(stub, `'use strict';
// a worker wedged in a syscall on its file (here: open() of a FIFO nobody writes) — the case a D-state disk leaves
const { parentPort } = require('worker_threads');
parentPort.postMessage({ ev: 'state', state: 'ready', ms: 0, rows: 0, bytes: 0 });
setTimeout(() => { parentPort.postMessage({ ev: 'progress' }); require('fs').openSync(${JSON.stringify(fifo)}, 'r'); }, 50);
`);
  const L = ledger('term', 2000);
  const BOUND = 700;
  // three servers at once (only the real one opens the index): wedged + exit hook, wedged without it (the CONTROL), real
  const w = child(L.data, L.home, { owner: { workerFile: stub, closeBoundMs: BOUND } });
  const ctl = child(L.data, L.home, { owner: { workerFile: stub, closeBoundMs: BOUND, exitHook: false } });
  const real = child(L.data, L.home);
  await until(() => [w, ctl, real].every((c) => stateOf(c).some((x) => x.s === 'ready')), 'the three children to be up');
  await sleep(300); // the stubs are inside their open() by now
  const t = Date.now();
  for (const c of [w, ctl, real]) c.kill('SIGTERM');
  const [ex, ex2, ex3] = await Promise.all([w, ctl, real].map((c) => Promise.race([c.done, sleep(c === ctl ? 1500 : 8000).then(() => null)])));
  ok(ex && ex.at - t < BOUND + 2500 && ex.signal === 'SIGTERM', `with the worker wedged, SIGTERM ends the process in ${ex ? ex.at - t : '>8000'} ms (bound ${BOUND} ms; re-raised: ${ex && ex.signal})`);
  ok(ex2 === null, 'CONTROL: without the exit hook the same SIGTERM leaves process.exit() joining the wedged worker — still alive after 1.5 s (twice the bound)');
  ok(ex3 && ex3.code === 0 && ex3.at - t < 3000, `the real worker closes on SIGTERM and the server exits 0 (${ex3 ? ex3.at - t : '>8000'} ms)`);
  for (const c of [w, ctl, real]) await killAndWait(c);
  const uh = L.uh(); const ix = mkOwner(uh, L.home); ix.start(); await readyOf(ix);
  const st = await ix.workerStats();
  ok(st.rows === 2000 && st.marks.every((m) => m.offset === fs.statSync(path.join(L.hist, m.shard)).size) && !(await same(uh, ix)), 'the index it closed reopens level with the shards (marks at each shard\'s end, parity)');
  await ix.close();
}

// ── §6 off by name ─────────────────────────────────────────────────────────
console.log('§6 a write failure, a Node without node:sqlite, a dead worker — each off by name; the ledger never notices', el());
{
  const L = ledger('full', 8000);
  const uh = L.uh();
  const ix = mkOwner(uh, L.home, { maxPages: 40 }); ix.start();
  await until(() => ix.stats().state === 'disabled', 'the index to give up');
  ok(ix.available().reason === UI.REASON.WRITE_FAILED && ix.available().code === 'SQLITE_FULL', `a full disk (SQLITE_FULL via max_page_count) turns the shadow off by name: ${JSON.stringify(ix.available())}`);
  const before = uh.aggregate({}).totals.requests;
  let threw = null; try { uh.ingestRemoteEvents('host-1', 'One', remote(1, T(2026, 9, 9)) + '\n'); } catch (e) { threw = e; }
  ok(!threw && uh.aggregate({}).totals.requests === before + 1 && ix.compare(uh.aggregate({}), {}) === null && ix.stats().skipped['write-failed'] === 1, 'the ledger appends and answers as before; the comparer skips under "write-failed"');
  await sleep(300);
  ok(ix.stats().state === 'disabled', 'it stays off (no retry loop against a full disk)');
  await ix.close();
  // node:sqlite missing (a Node below 22.13): the module load is what fails
  const noSql = path.join(root, 'no-sqlite-worker.js');
  fs.writeFileSync(noSql, `'use strict';
const Module = require('module'); const load = Module._load;
Module._load = function (req, ...a) { if (req === 'node:sqlite') { const e = new Error('No such built-in module: node:sqlite'); e.code = 'ERR_UNKNOWN_BUILTIN_MODULE'; throw e; } return load.call(this, req, ...a); };
require(${JSON.stringify(path.join(REPO, 'src/usage-index-worker.js'))});
`);
  const L2 = ledger('nosql', 500); const uh2 = L2.uh();
  const ix2 = mkOwner(uh2, L2.home, { workerFile: noSql }); ix2.start();
  await until(() => ix2.stats().state === 'disabled', 'the no-sqlite verdict');
  ok(ix2.available().reason === UI.REASON.NO_SQLITE && ix2.available().code === 'ERR_UNKNOWN_BUILTIN_MODULE', `a Node without node:sqlite: the shadow is off BY NAME (${ix2.available().reason})`);
  ok(!fs.existsSync(path.join(ix2.dir, 'usage.db')) && uh2.aggregate({}).totals.requests === 500, '…no database is created and the ledger answers as before');
  await ix2.close();
  const dies = path.join(root, 'dying-worker.js');
  fs.writeFileSync(dies, `'use strict';\nrequire(${JSON.stringify(path.join(REPO, 'src/usage-index-worker.js'))});\nsetTimeout(() => process.exit(3), 150);\n`);
  const ix3 = mkOwner(uh2, L2.home, { workerFile: dies }); ix3.start();
  await until(() => ix3.stats().state === 'disabled', 'the dead worker to be noticed');
  ok(ix3.available().reason === UI.REASON.EXITED, `a worker that dies is named: ${ix3.available().reason}`);
  let r3 = null; try { await ix3.queryAggregate({}); } catch (e) { r3 = e; }
  ok(r3 && r3.status === 503 && r3.reason === UI.REASON.EXITED, 'a query then answers 503 with that name');
  await ix3.close();
  const L4 = ledger('exitlisteners', 200); const uh4 = L4.uh();
  const n0 = process.listenerCount('exit');
  const ix4 = mkOwner(uh4, L4.home); ix4.start(); await readyOf(ix4);
  ok(process.listenerCount('exit') === n0 + 1, 'a started owner holds ONE exit hook');
  await ix4.close();
  ok(process.listenerCount('exit') === n0, '…and close() takes it away');
  ok(UI.create({ getLedger: () => null, homeDir: L4.home, log: quiet }).start().available().reason === UI.REASON.NO_LEDGER, 'no ledger: off by name (no-ledger)');
}

// ── §7 the ci.mjs sweep ────────────────────────────────────────────────────
console.log('§7 scripts/ci.mjs sweeps index directories whose data/ is gone', el());
{
  const dbRoot = path.join(root, 'sweep', '.vibespace', 'db');
  const live = path.join(root, 'sweep', 'live-data'); fs.mkdirSync(live, { recursive: true });
  const mk = (name, owner) => { const d = path.join(dbRoot, name); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'usage.db'), 'x'); if (owner !== undefined) fs.writeFileSync(path.join(d, 'owner.json'), typeof owner === 'string' ? owner : JSON.stringify(owner)); return d; };
  const keep = mk('a1', { dataDir: live }), gone = mk('b2', { dataDir: path.join(root, 'sweep', 'removed-data') }), bare = mk('c3'), junk = mk('d4', '{not json'), rel = mk('e5', { dataDir: 'relative/data' });
  const removed = sweepUsageIndexDirs({ root: dbRoot });
  ok(removed.length === 1 && removed[0] === gone && !fs.existsSync(gone), 'the directory whose owner.json names a data/ that is gone is removed');
  ok([keep, bare, junk, rel].every((d) => fs.existsSync(d)), 'kept: a live data/, no owner.json, an unreadable owner.json, a relative path');
  ok(sweepUsageIndexDirs({ root: path.join(root, 'sweep', 'nowhere') }).length === 0, 'a HOME without ~/.vibespace/db is a no-op');
}

// ── §8 verify r1 ───────────────────────────────────────────────────────────
console.log('§8 verify r1: the unmounted root, the full disk, the heap cap, the wall clock', el());
// a pre-fix copy of a src file in the suite's scratch (its relative requires made absolute) — the CONTROL
const mutant = (rel, from, to) => {
  let s = fs.readFileSync(path.join(REPO, rel), 'utf8');
  s = s.replace(/require\('(\.\.?\/[^']+)'\)/g, (m, p) => `require(${JSON.stringify(path.resolve(path.dirname(path.join(REPO, rel)), p))})`);
  if (!s.includes(from)) throw new Error('mutant anchor gone: ' + from);
  const f = path.join(root, 'mut-' + path.basename(rel)); fs.writeFileSync(f, s.split(from).join(to)); return f;
};
{
  // L0: an unmounted FUSE root is an EMPTY mount point — every key under it answers ENOENT
  const H = path.join(root, 'l0', 'home'), proj = path.join(H, '.claude', 'projects'), slug = path.join(proj, '-w-p');
  fs.mkdirSync(slug, { recursive: true }); fs.writeFileSync(path.join(slug, 'live.jsonl'), '{}\n');
  const uh = new UsageHistory({ dataDir: path.join(root, 'l0', 'data'), homeDir: H });
  const LIVE = path.join(slug, 'live.jsonl'), DEAD = path.join(slug, 'gone.jsonl');
  const seed = () => { uh._cursors[LIVE] = { offset: 3, lastRid: null }; uh._cursors[DEAD] = { offset: 9, lastRid: null }; };
  const oldPrune = function () { // the lane head's rule, verbatim
    const roots = [this.projectsDir, this.codexSessionsDir].filter((r) => { try { return fs.statSync(r).isDirectory(); } catch { return false; } });
    if (!roots.length) return 0;
    let dropped = 0;
    for (const k of Object.keys(this._cursors)) { if (!roots.some((r) => k.startsWith(r + path.sep))) continue; try { fs.statSync(k); } catch (e) { if (e && e.code === 'ENOENT') { delete this._cursors[k]; dropped++; } } }
    return dropped;
  };
  fs.renameSync(proj, proj + '.mounted'); fs.mkdirSync(proj); // unmounted: the empty mount point answers
  seed(); uh._pruneDeadCursors();
  ok(uh._cursors[LIVE] && uh._cursors[DEAD], 'an unmounted transcript root (an EMPTY mount point) drops no cursor');
  seed(); oldPrune.call(uh);
  ok(!uh._cursors[LIVE], 'CONTROL: the pre-fix proof (a directory root + ENOENT) drops the LIVE cursor there — its transcript is walked again (a 1.1 GB one: 21 MB of duplicate rows)');
  fs.rmdirSync(proj); fs.renameSync(proj + '.mounted', proj);
  seed(); const n = uh._pruneDeadCursors();
  ok(n === 1 && uh._cursors[LIVE] && !uh._cursors[DEAD], 'mounted again: the key whose file left its directory is dropped, the live one kept');
}
{
  // a full disk: the disabled index gives the room back
  const files = (d) => fs.readdirSync(d).filter((f) => f.startsWith('usage.db'));
  const L = ledger('full2', 3000);
  const ix = mkOwner(L.uh(), L.home, { maxPages: 40 }); ix.start();
  await until(() => ix.stats().state === 'disabled', 'disabled');
  ok(ix.available().code === 'SQLITE_FULL' && files(ix.dir).length === 0, `SQLITE_FULL: off by name and no usage.db* left on the full disk (${files(ix.dir)})`);
  const L2 = ledger('full3', 3000);
  const ixc = mkOwner(L2.uh(), L2.home, { maxPages: 40, workerFile: mutant('src/usage-index-worker.js', "  if (code === 'SQLITE_FULL' || code === 'ENOSPC' || code === 'EDQUOT') removeDbFiles();\n", '') }); ixc.start();
  await until(() => ixc.stats().state === 'disabled', 'disabled (control)');
  ok(ixc.available().code === 'SQLITE_FULL' && files(ixc.dir).length > 0, `CONTROL: the pre-fix worker leaves ${files(ixc.dir).join(', ')} on the full disk`);
}
{
  // the worker's heap is capped (uncapped, a first build of the real 296 MB ledger kept the server +262 MB RSS)
  const L = ledger('heap', 500), L2 = ledger('heap0', 500);
  const ix = mkOwner(L.uh(), L.home), ix0 = mkOwner(L2.uh(), L2.home, { heapMb: 0 });
  ix.start(); ix0.start(); await readyOf(ix); await readyOf(ix0);
  const lim = (await ix.workerStats()).heapLimitMb, lim0 = (await ix0.workerStats()).heapLimitMb;
  ok(lim > 0 && lim <= 256 && lim0 > 2 * lim, `the worker's V8 heap is capped at ${lim} MB (CONTROL heapMb 0: ${lim0} MB)`);
}
{
  // liveness on the monotonic clock: a deadline, then the wall clock steps back an hour, then the worker answers
  const L = ledger('clock', 20000);
  const realNow = Date.now, res = [];
  for (const [i, file] of [[0, null], [1, mutant('src/server/usage-index.js', 'performance.now()', 'Date.now()')]]) {
    const U = file ? require(file) : UI;
    const uh = L.uh();
    const ix = U.create({ getLedger: () => uh, homeDir: path.join(root, 'clock-home-' + i), workerFile: path.join(REPO, 'src/usage-index-worker.js'), log: quiet }); owners.push(ix);
    ix.start(); await readyOf(ix);
    const r = await ix.queryAggregate({ pivots: PIV }, { timeoutMs: 1 }).then(() => 'answered', (e) => e.reason);
    Date.now = () => realNow() - 3600e3;
    try { await sleep(300); await ix.workerStats(); res.push([r, ix.available()]); } finally { Date.now = realNow; }
  }
  ok(res[0][0] === 'unresponsive' && res[0][1].ok, `after a deadline and a 1 h step back, the next answer makes the index available again (${JSON.stringify(res[0])})`);
  ok(res[1][0] === 'unresponsive' && !res[1][1].ok && res[1][1].reason === 'unresponsive', `CONTROL: on the wall clock it stays "unresponsive" for the size of the step (${JSON.stringify(res[1])})`);
}

for (const o of owners) { try { await o.close(); } catch { } }
fs.rmSync(root, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

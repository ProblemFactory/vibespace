#!/usr/bin/env node
// THE USAGE INDEX SHADOW — PARITY (design 011 lane 3: L0 + L1). The index is a
// SQLite copy of the usage ledger that feeds nothing; this suite proves the
// REAL worker (src/usage-index-worker.js, on a scratch HOME) answers the Usage
// window's aggregate exactly as memory does (src/usage-history.js aggregate):
//  §0 L0 — the walk's cursor writer writes only when a cursor moved and drops
//     keys whose transcript is gone, only on proof (control: a forgotten
//     on-disk text rewrites at once)
//  §1 parity over a ledger with duplicate rids whose rows differ in account, a
//     rid-less row, an empty shard, a torn last line, every dimension, every
//     filter the window sends, pivots — hour and weekday in LOCAL time, day in
//     UTC; then a remote harvest appended into an OLD month, a push after a
//     torn line, a push that never arrived, a shard rewritten by a repair
//     (tmp + rename); the comparer's own negative controls
//  §2 READ-YOUR-WRITES — an append followed AT ONCE by a sum includes it,
//     through both commit points (the walk, the remote harvest); a CONTROL
//     worker that only tails the shards misses it (red by construction)
//  §3 the same parity under a second time zone with a DST change inside the
//     ledger (America/St_Johns, −03:30/−02:30) — a child of this suite
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { UsageHistory } = require(path.join(REPO, 'src/usage-history.js'));
const UI = require(path.join(REPO, 'src/server/usage-index.js'));
const M = require(path.join(REPO, 'src/usage-index-model.js'));
const TZ_CHILD = process.env.UIDX_TZ_CHILD === '1';

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-uidx-par-'));
const quiet = { log() { }, error() { } };
const owners = [];
const mkOwner = (uh, home, extra = {}) => { const ix = UI.create({ getLedger: () => uh, homeDir: home, log: quiet, ...extra }); owners.push(ix); return ix; };
async function until(f, what, ms = 20000) { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timed out waiting for ' + what); await sleep(15); } }
const readyOf = (ix) => until(() => ix.available().ok, 'the index to be ready (' + JSON.stringify(ix.stats().reason) + ')');
const T = (y, m, d, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi);
const totalOf = (folded) => folded.total.cells.reduce((n, c) => n + c.n, 0);

// ── the fixture ledger ─────────────────────────────────────────────────────
let seed = 11; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const WHO = [
  { acct: 'sub-a', atype: 'subscription', aname: 'Alice' }, { acct: 'sub-b', atype: 'subscription', aname: 'Bob' },
  { acct: 'acct-k', atype: 'api', aname: 'Key' }, { acct: 'cxs-1', atype: 'codex-subscription', aname: 'Cx', be: 'codex' },
  { acct: null, atype: 'global' }, { acct: null, atype: 'global', be: 'codex' }, { acct: 'host-9', atype: 'host', aname: 'Nine', host: 'host-9' },
  { acct: 'gone-1', atype: 'unknown' }, { acct: '', atype: 'global' },
];
const SIDS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(8, '0')}-1111-4222-8333-444455556666`);
function row(k, ts, over = {}) {
  const w = pick(WHO);
  const r = {
    rid: 'req_' + k, mid: rnd() < 0.8 ? 'msg_' + k : undefined, ts, sid: pick(SIDS), be: w.be || 'claude',
    model: pick(['claude-opus-5-5', 'claude-fable-5-1', 'claude-sonnet-5-5', 'gpt-5.6-sol', '', null]),
    acct: w.acct, pool: rnd() < 0.3 ? pick(['pool-1', 'pool-2']) : undefined, atype: w.atype, aname: w.aname || null,
    mode: pick(['chat', 'terminal', null]), host: w.host || (rnd() < 0.1 ? '' : null), cwd: pick(['/w/p1', '/w/p2', '/w/中文', '']),
    origin: pick(['main', 'subagent', 'workflow', undefined]), i: Math.floor(rnd() * 900), cw5: rnd() < 0.3 ? 2000 : 0, cw1: rnd() < 0.1 ? 900 : 0,
    cr: Math.floor(rnd() * 50000), o: Math.floor(rnd() * 3000), tier: 'standard',
  };
  return JSON.stringify({ ...r, ...over });
}
function buildLedger(dataDir) {
  const hist = path.join(dataDir, 'usage-history');
  fs.mkdirSync(hist, { recursive: true });
  const aug = [], sep = [], nov = [];
  for (let k = 0; k < 900; k++) aug.push(row(k, T(2026, 8, 1) + Math.floor(rnd() * 31 * 86400000)));
  // duplicate rids whose two rows differ in ACCOUNT: the first row wins on both sides
  aug.splice(100, 0, row('dup1', T(2026, 8, 9, 4), { acct: 'sub-a', atype: 'subscription', aname: 'Alice' }));
  aug.splice(400, 0, row('dup1', T(2026, 8, 9, 4), { acct: 'sub-b', atype: 'subscription', aname: 'Bob', i: 77777 }));
  aug.push(row('dup2', T(2026, 8, 31, 23), { acct: 'acct-k', atype: 'api' }));
  // rows without a rid (memory keeps every one) and an unparsable line
  aug.push(JSON.stringify({ ts: T(2026, 8, 12, 3), sid: SIDS[1], be: 'claude', model: 'claude-opus-5-5', acct: 'sub-a', atype: 'subscription', i: 5, cw5: 0, cw1: 0, cr: 0, o: 5 }));
  aug.push(JSON.stringify({ ts: T(2026, 8, 12, 4), sid: SIDS[1], be: 'claude', model: 'claude-opus-5-5', acct: 'sub-a', atype: 'subscription', i: 6, cw5: 0, cw1: 0, cr: 0, o: 6 }));
  aug.push('{"rid":"broken"');
  for (let k = 900; k < 1700; k++) sep.push(row(k, T(2026, 9, 1) + Math.floor(rnd() * 30 * 86400000)));
  sep.push(row('dup2', T(2026, 9, 1, 1), { acct: 'sub-b', atype: 'subscription', i: 99999 })); // the cross-shard twin: August's row wins
  sep.push(row('nullsid', T(2026, 9, 3), { sid: null }));
  // around a DST end (America/St_Johns 2026-11-01 02:00 local) and a UTC midnight
  for (let k = 1700; k < 1800; k++) nov.push(row(k, T(2026, 11, 1, 2) + Math.floor(rnd() * 8 * 3600000)));
  fs.writeFileSync(path.join(hist, 'events-2026-07.ndjson'), ''); // an EMPTY shard
  fs.writeFileSync(path.join(hist, 'events-2026-08.ndjson'), aug.join('\n') + '\n');
  fs.writeFileSync(path.join(hist, 'events-2026-09.ndjson'), sep.join('\n') + '\n' + row('torn', T(2026, 9, 20)).slice(0, 40)); // a TORN last line
  fs.writeFileSync(path.join(hist, 'events-2026-11.ndjson'), nov.join('\n') + '\n');
  return hist;
}
const PIVOTS = [['session', 'origin'], ['project', 'origin'], ['day', 'account'], ['hour', 'model'], ['weekday', 'pool'], ['pool', 'origin'], ['billing', 'host'], ['mode', 'day']];
const QUERIES = [
  ['everything', {}], ['every dimension + 8 pivots', { pivots: PIVOTS }],
  ['from only', { from: T(2026, 8, 20) }], ['to only', { to: T(2026, 9, 5, 12, 30) }], ['a 30-day range', { from: T(2026, 8, 15), to: T(2026, 9, 14) }],
  ['backend claude', { backend: 'claude' }], ['backend codex', { backend: 'codex' }],
  ['one account', { accounts: new Set(['sub-a']) }], ['an account + its global', { accounts: new Set(['sub-b', '__global__']) }], ['an EMPTY account set', { accounts: new Set() }],
  ['device local', { hostFilter: 'local' }], ['device host-9', { hostFilter: 'host-9' }],
  ['everything at once', { from: T(2026, 8, 5), to: T(2026, 11, 30), backend: 'claude', accounts: new Set(['sub-a', 'sub-b', '__global__']), hostFilter: 'local', pivots: [['day', 'session'], ['hour', 'weekday']] }],
  ['the DST morning', { from: T(2026, 11, 1), to: T(2026, 11, 2), pivots: [['hour', 'day']] }],
];
async function parityAll(uh, ix, tag) {
  const bad = [];
  let checked = 0;
  for (const [name, q] of QUERIES) {
    const mem = uh.aggregate(q);
    const idx = M.finalizeAggregate(await ix.queryAggregate(q), (c) => uh._cost(c, c.prompt));
    const r = M.compareAggregates(mem, idx);
    checked += r.checked;
    if (!r.same) bad.push(`${name}: ${JSON.stringify(r.diffs.slice(0, 3))}`);
  }
  ok(bad.length === 0 && checked > 5000, `${tag}: memory == index for ${QUERIES.length} query shapes (${checked} numbers compared)`, bad.join(' | '));
}

// §3's child: the same parity, under the time zone the parent gave it
if (TZ_CHILD) {
  const data = path.join(root, 'data'), home = path.join(root, 'home');
  buildLedger(data); fs.mkdirSync(home);
  const uh = new UsageHistory({ dataDir: data, homeDir: home });
  const ix = mkOwner(uh, home); ix.start();
  await readyOf(ix);
  await parityAll(uh, ix, `${process.env.TZ}`);
  const hours = new Set(uh.aggregate({}).groups.hour.map((g) => g.key));
  ok(hours.size >= 20, `${process.env.TZ}: the hour dimension is populated (${hours.size} local hours)`);
  for (const o of owners) await o.close();
  fs.rmSync(root, { recursive: true, force: true });
  console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
  process.exit(fail ? 1 : 0);
}

// ── §0 L0: the cursor store ────────────────────────────────────────────────
console.log('§0 L0 — the walk writes _cursors.json only when a cursor moved, and drops dead keys only on proof');
const l0 = path.join(root, 'l0'), l0home = path.join(l0, 'home'), l0data = path.join(l0, 'data');
const proj = path.join(l0home, '.claude', 'projects', '-w-l0');
fs.mkdirSync(proj, { recursive: true });
const tr = (sid) => path.join(proj, sid + '.jsonl');
const turn = (n, ts) => JSON.stringify({ type: 'assistant', requestId: 'req_l0_' + n, timestamp: new Date(ts).toISOString(), cwd: '/w/l0', message: { id: 'msg_l0_' + n, model: 'claude-opus-5-5', usage: { input_tokens: 10 + n, output_tokens: 5, cache_read_input_tokens: 100 } } }) + '\n';
fs.writeFileSync(tr(SIDS[0]), turn(1, T(2026, 9, 2, 10)));
fs.writeFileSync(tr(SIDS[1]), turn(2, T(2026, 9, 2, 11)));
const uh0 = new UsageHistory({ dataDir: l0data, homeDir: l0home, scanYield: () => Promise.resolve() });
const curFile = path.join(l0data, 'usage-history', '_cursors.json');
const inoOf = (f) => fs.statSync(f).ino;
await uh0.scan(true);
const cur1 = JSON.parse(fs.readFileSync(curFile, 'utf8'));
ok(Object.keys(cur1).length === 2, 'the first walk writes both transcripts\' cursors');
// the walker's unchanged-file path stamps `sid` into an entry once (parity-pinned with the shipped
// scanner), so the first idle walk after a scan still changes the bytes; from then on nothing moves
await uh0.scan(true);
const ino1 = inoOf(curFile);
await uh0.scan(true);
ok(inoOf(curFile) === ino1, 'a walk that moved no cursor writes NOTHING (the file is the same inode — every write is tmp + rename)');
uh0._cursorsJson = null; // CONTROL: forget the on-disk text — the next walk must write
await uh0.scan(true);
ok(inoOf(curFile) !== ino1, 'CONTROL: with the on-disk text forgotten the same walk rewrites the file (the inode check can see a write)');
const ino2 = inoOf(curFile);
fs.appendFileSync(tr(SIDS[0]), turn(3, T(2026, 9, 2, 12)));
await uh0.scan(true);
ok(inoOf(curFile) !== ino2 && JSON.parse(fs.readFileSync(curFile, 'utf8'))[tr(SIDS[0])].offset === fs.statSync(tr(SIDS[0])).size, 'a moved cursor is written');
// dead keys
fs.unlinkSync(tr(SIDS[1]));
uh0._cursors['/nonexistent-root-uidx/x/y.jsonl'] = { offset: 9 }; // outside both walk roots: no proof either way
uh0._cursors[path.join(proj, 'never-there.jsonl')] = { offset: 1 };
await uh0.scan(true); // within the hour of the first prune: nothing is dropped yet
let cur = JSON.parse(fs.readFileSync(curFile, 'utf8'));
ok(cur[tr(SIDS[1])] && cur[path.join(proj, 'never-there.jsonl')], 'the dead-key sweep runs at most hourly (a key whose file left an hour-young sweep ago stays)');
uh0._cursorsPrunedAt = 0;
await uh0.scan(true);
cur = JSON.parse(fs.readFileSync(curFile, 'utf8'));
ok(!cur[tr(SIDS[1])] && !cur[path.join(proj, 'never-there.jsonl')], 'a key whose transcript is gone (stat ENOENT under a readable root) is dropped by the walk\'s writer');
ok(cur[tr(SIDS[0])] && cur['/nonexistent-root-uidx/x/y.jsonl'], 'a live key stays; a key outside the walk\'s roots stays');
// an unreadable root drops nothing
const moved = path.join(l0home, '.claude', 'projects-away');
fs.renameSync(path.join(l0home, '.claude', 'projects'), moved);
uh0._cursorsPrunedAt = 0;
await uh0.scan(true);
cur = JSON.parse(fs.readFileSync(curFile, 'utf8'));
ok(cur[tr(SIDS[0])], 'with the projects directory missing (an unmounted HOME) NO key is dropped — a dropped live cursor would re-append a whole transcript');
fs.renameSync(moved, path.join(l0home, '.claude', 'projects'));

// ── §1 parity ──────────────────────────────────────────────────────────────
console.log('§1 parity — memory == index over every dimension, filter and pivot the Usage window sends');
const data = path.join(root, 'data'), home = path.join(root, 'home');
const hist = buildLedger(data); fs.mkdirSync(home);
const uh = new UsageHistory({ dataDir: data, homeDir: home });
const ix = mkOwner(uh, home);
ok(ix.available().reason === UI.REASON.OFF, 'before start the index says why it is not answering: not-started');
ix.start();
await readyOf(ix);
const dir = ix.dir;
ok(dir.startsWith(path.join(home, '.vibespace', 'db') + path.sep) && fs.existsSync(path.join(dir, 'usage.db')), 'the index lives under the scratch HOME\'s ~/.vibespace/db/<hash>/ — never another home');
ok(JSON.parse(fs.readFileSync(path.join(dir, 'owner.json'), 'utf8')).dataDir === fs.realpathSync(data), 'owner.json names the data/ (real path) the index belongs to');
ok(!fs.existsSync(path.join(dir, 'usage.db-shm')), 'EXCLUSIVE + WAL: no -shm file');
const mem0 = uh.aggregate({});
for (const d of M.DIMS) ok(mem0.groups[d].length >= 2, `the fixture exercises the ${d} dimension (${mem0.groups[d].length} keys)`);
const dupRow = mem0.groups.account.find((g) => g.key === 'sub-a');
ok(uh.aggregate({}).totals.requests === (await ix.queryAggregate({}).then(totalOf)), 'the index holds the same number of unique requests as memory');
await parityAll(uh, ix, 'the first build');
const st0 = await ix.workerStats({ check: true });
ok(st0.integrity === 'ok' && st0.userVersion === M.SCHEMA_VERSION, `the built index is sound (quick_check ${st0.integrity}, user_version ${st0.userVersion})`);
ok(st0.marks.find((m) => m.shard === 'events-2026-07.ndjson')?.offset === 0, 'the EMPTY shard is marked at 0 (not re-read as new at every recovery)');
const sepMark = st0.marks.find((m) => m.shard === 'events-2026-09.ndjson');
ok(sepMark && sepMark.offset < fs.statSync(path.join(hist, 'events-2026-09.ndjson')).size, 'the torn last line is left unconsumed (the mark stops at the last newline, as memory does)');
void dupRow;

// the comparer's own negative controls
{
  const idx = M.finalizeAggregate(await ix.queryAggregate({ pivots: PIVOTS }), (c) => uh._cost(c, c.prompt));
  const mem = uh.aggregate({ pivots: PIVOTS });
  const clone = () => JSON.parse(JSON.stringify(idx));
  const a = clone(); a.groups.model[0].input += 1;
  const b = clone(); b.groups.session.pop();
  const c = clone(); c.totals.cost *= 1 + 1e-6;
  const d = clone(); d.pivots['session:origin'][0].cells[Object.keys(d.pivots['session:origin'][0].cells)[0]].sessions += 1;
  const e = clone(); e.range.to += 1;
  const f = clone(); f.totals.cost *= 1 + 1e-12;
  ok(M.compareAggregates(mem, idx).same && [a, b, c, d, e].every((x) => !M.compareAggregates(mem, x).same) && M.compareAggregates(mem, f).same,
    'NEGATIVE CONTROLS: one token, a missing session row, a cost 1e-6 off, a pivot cell\'s session count, the range end — each is a difference; a cost 1e-12 off (rounding) is not');
}

// a remote harvest appended into an OLD month (August) while September is newer
const remote = (k, ts, sid = SIDS[3]) => JSON.stringify({ rid: 'rr_' + k, ts, sid, model: 'claude-opus-5-5', i: 1000 + k, cw5: 0, cw1: 0, cr: 10, o: 20, origin: 'main', cwd: '/r' });
uh.ingestRemoteEvents('host-7', 'Seven', [remote(1, T(2026, 8, 3, 5)), remote(2, T(2026, 8, 30, 22)), remote(1, T(2026, 8, 3, 5))].join('\n') + '\n');
await parityAll(uh, ix, 'after a remote harvest appended into an OLD month (a re-emitted rid inside it)');
// a push straight after the torn line: the append merges with the fragment, the merged line is lost on BOTH sides
uh.ingestRemoteEvents('host-7', 'Seven', [remote(3, T(2026, 9, 21)), remote(4, T(2026, 9, 22))].join('\n') + '\n');
await parityAll(uh, ix, 'after a push that lands on a torn line (the worker re-reads from its mark)');
{
  const rids = new Set(uh._loadEvents().map((e) => e.rid));
  ok(!rids.has('h:host-7:rr_3') && rids.has('h:host-7:rr_4'), '…and the torn fragment swallowed exactly the first pushed row (memory\'s line rule — the parity above says the index agrees)');
}
// a push that never arrived (the index detached for one append)
uh.setIndex(null);
uh.ingestRemoteEvents('host-7', 'Seven', remote(5, T(2026, 11, 1, 6)) + '\n');
uh.setIndex(ix);
uh.ingestRemoteEvents('host-7', 'Seven', remote(6, T(2026, 11, 1, 7)) + '\n');
await parityAll(uh, ix, 'after a push that never arrived (the next push does not start at the mark ⇒ re-read from the mark)');
// a shard rewritten by a repair (tmp + rename: a new inode), then reloadEvents (what boot does after runLocalMigrations)
{
  const fp = path.join(hist, 'events-2026-08.ndjson');
  const lines = fs.readFileSync(fp, 'utf8').split('\n').filter(Boolean);
  const out = lines.map((l, n) => { if (n === 5) return null; try { const e = JSON.parse(l); if (e.acct === 'sub-a' && n % 2) { e.acct = 'sub-b'; e.aname = 'Bob'; } return JSON.stringify(e); } catch { return l; } }).filter((x) => x !== null);
  fs.writeFileSync(fp + '.tmp', out.join('\n') + '\n'); fs.renameSync(fp + '.tmp', fp);
  uh.reloadEvents();
  await parityAll(uh, ix, 'after a repair rewrote the August shard in place (re-attributed rows, one row gone)');
}

// ── §2 READ-YOUR-WRITES ────────────────────────────────────────────────────
console.log('§2 read-your-writes — an append followed at once by a sum includes it; a tail-only worker misses it');
{
  const before = await ix.queryAggregate({}).then(totalOf);
  uh.ingestRemoteEvents('host-8', 'Eight', remote(10, T(2026, 9, 25, 9), SIDS[4]) + '\n');
  const q = ix.queryAggregate({}); // posted in the same synchronous step as the append
  const memNow = uh.aggregate({}).totals.requests;
  const after = await q.then(totalOf);
  ok(after === before + 1 && after === memNow, `the remote harvest's commit point: the sum asked right after the append includes it (${before} → ${after}, memory ${memNow})`);
  // the walk's commit point: a transcript grows, the walk appends, the sum follows at once
  const walkHome = path.join(root, 'walkhome'), wproj = path.join(walkHome, '.claude', 'projects', '-w-rw');
  fs.mkdirSync(wproj, { recursive: true });
  const wd = path.join(root, 'walkdata');
  const uhw = new UsageHistory({ dataDir: wd, homeDir: walkHome, scanYield: () => Promise.resolve() });
  fs.writeFileSync(path.join(wproj, SIDS[5] + '.jsonl'), turn(50, T(2026, 9, 26, 8)));
  await uhw.scan(true);
  const ixw = mkOwner(uhw, walkHome); ixw.start(); await readyOf(ixw);
  fs.appendFileSync(path.join(wproj, SIDS[5] + '.jsonl'), turn(51, T(2026, 9, 26, 9)) + turn(52, T(2026, 9, 26, 10)));
  await uhw.scan(true);
  const n = await ixw.queryAggregate({}).then(totalOf);
  ok(n === 3 && uhw.aggregate({}).totals.requests === 3, `the walk's commit point: right after the walk, the index sums all 3 requests (${n})`);
  // CONTROL: the same worker, but pushes are not taken — it only re-reads shards from their marks every 300 ms
  const ctlFile = path.join(root, 'tail-only-worker.js');
  fs.writeFileSync(ctlFile, `'use strict';
// CONTROL (scripts/test-usage-index-parity.mjs §2): the real worker, but a push is acknowledged and DROPPED;
// the shards are re-read from their marks on a timer instead — the tail-only design design 011 §2 rules out.
const wt = require('worker_threads');
let handler = null;
const realOn = wt.parentPort.on.bind(wt.parentPort);
wt.parentPort.on = (ev, fn) => (ev !== 'message' ? realOn(ev, fn) : realOn(ev, (handler = fn, (m) => {
  if (m && m.op === 'ingest') { wt.parentPort.postMessage({ id: m.id, ok: true, result: { mode: 'dropped' } }); return; }
  fn(m);
})));
require(${JSON.stringify(path.join(REPO, 'src/usage-index-worker.js'))});
setInterval(() => { if (handler) handler({ id: -1, op: 'recover' }); }, 300);
`);
  const cd = path.join(root, 'ctldata'), ch = path.join(root, 'ctlhome');
  buildLedger(cd); fs.mkdirSync(ch);
  const uhc = new UsageHistory({ dataDir: cd, homeDir: ch });
  const ixc = mkOwner(uhc, ch, { workerFile: ctlFile }); ixc.start(); await readyOf(ixc);
  const b0 = await ixc.queryAggregate({}).then(totalOf);
  uhc.ingestRemoteEvents('host-8', 'Eight', remote(11, T(2026, 8, 25, 9), SIDS[6]) + '\n');
  const missed = await ixc.queryAggregate({}).then(totalOf);
  ok(missed === b0 && uhc.aggregate({}).totals.requests === b0 + 1, `CONTROL: a worker that only TAILS answers the same immediate sum WITHOUT the append (${b0} → ${missed}; memory ${b0 + 1}) — the push is what makes the invariant`);
  await sleep(700);
  ok(await ixc.queryAggregate({}).then(totalOf) === b0 + 1, 'CONTROL: …and catches up later by its marks (it is a tailer, not a broken worker)');
}

// ── §3 a second time zone ──────────────────────────────────────────────────
console.log('§3 the same parity in America/St_Johns (−03:30, a DST change inside the ledger)');
{
  const r = spawnSync(process.execPath, [new URL(import.meta.url).pathname], { env: { ...process.env, TZ: 'America/St_Johns', UIDX_TZ_CHILD: '1' }, encoding: 'utf8', timeout: 120000 });
  const tail = (r.stdout || '').trim().split('\n').slice(-4).join(' / ');
  ok(r.status === 0 && /ALL PASS/.test(r.stdout || ''), `the child under TZ=America/St_Johns: ${tail}`, (r.stderr || '').slice(-600));
}

for (const o of owners) await o.close();
fs.rmSync(root, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

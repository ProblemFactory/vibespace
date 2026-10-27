#!/usr/bin/env node
// usage-events PUSH stream (R4 finale) against a REAL daemon: transcript
// growth → walker child → batched chan-0 push → server ack commits the
// device-side cursor (two-phase). Proves: initial drain, incremental (only
// NEW events after a cursor commit), and that an UNACKED batch does NOT
// advance the cursor (the loss-window closure the whole design rests on).
// lane ledger-dedup-law r5 (the acceptance of ff094d46): THE ACK IS DURABILITY on the push road too — the hub's real half
// (src/hosts.js's push handler + server.js's `hosts.onUsageEvents`, its own source, over a real UsageHistory) against a
// second real daemon: a proven-over October + a push of 5 October + 5 November events ⇒ acked, the daemon's cursor
// committed, the next push carries only the new event (ff094d46: never acked — every push re-sends the window).
// r6 (the acceptance of d2ff4026): what this suite spawns is stopped on EVERY path — one cleanup (each daemon by its own
// pid, every scratch dir) run by the process's exit and by a signal (d2ff4026: a probe that threw skipped the kill — both
// detached daemons kept running).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(dir, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-uep-'));
const ROOT = path.join(tmp, 'agentd');
process.env.VIBESPACE_AGENTD_ROOT = ROOT;
const fakeHome = path.join(tmp, 'home');
const proj = path.join(fakeHome, '.claude', 'projects', '-home-u-x');
fs.mkdirSync(proj, { recursive: true });
process.env.HOME = fakeHome;
const dataDir = path.join(tmp, 'data'); fs.mkdirSync(dataDir, { recursive: true });

let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const pids = []; // the daemons this suite spawned — stopped by their own pid (never by a name), on every path
const pidLog = (m) => { const x = /spawned local daemon pid=(\d+)/.exec(String(m)); if (x) pids.push(Number(x[1])); };
const more = []; // …and the scratch dirs it made (tmp + each block's own)
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); } catch { } }
  for (const d of [tmp, ...more]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
};
process.on('exit', cleanup); // a throw, a rejected await, process.exit — the exit runs it (sync: kill + rm)
for (const [sig, n] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) process.on(sig, () => { cleanup(); process.exit(n); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SID = 'aaaa1111-2222-3333-4444-555566667777';
const jsonl = path.join(proj, SID + '.jsonl');
const rec = (rid) => JSON.stringify({ type: 'assistant', requestId: rid, timestamp: new Date().toISOString(), cwd: '/home/u/x', message: { id: 'msg_' + rid, model: 'claude-fable-5', usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0 } } }) + '\n';
fs.writeFileSync(jsonl, rec('r1') + rec('r2'));

const version = require('../package.json').version;
fs.writeFileSync(path.join(repo, 'src/agentd/version.js'), `module.exports = { VERSION: ${JSON.stringify(version)} };\n`);
const bundle = path.join(tmp, 'agentd.js');
execFileSync('npx', ['esbuild', 'src/agentd/agentd.js', '--bundle', '--platform=node', `--outfile=${bundle}`], { cwd: repo });

const { DeviceManager } = require('../src/agentd/client.js');
const dm = new DeviceManager({ dataDir, bundlePath: bundle, version, log: pidLog });
dm.installLocal();
const conn = await dm.connect();
check('hello-ack advertises usage-events', conn.info.capabilities.includes('usage-events'));

try {
  const got = []; // parsed events
  let acking = true;
  await dm.watchUsageEvents((m) => {
    for (const line of m.batch || []) { try { got.push(JSON.parse(line)); } catch { } }
    if (m.seq != null && acking) dm.ackUsageEvents(m.seq);
  });
  // initial drain
  for (let i = 0; i < 40 && got.length < 2; i++) await sleep(250);
  check(`initial drain pushes the existing events (${got.length})`, got.length === 2 && got.some((e) => e.rid === 'r1') && got.some((e) => e.rid === 'r2'));
  const cursorFile = path.join(ROOT, 'state', 'usage-push-cursor.json');
  for (let i = 0; i < 20 && !fs.existsSync(cursorFile); i++) await sleep(250);
  check('ack committed the device-side cursor file', fs.existsSync(cursorFile));
  let cur1 = {}; try { cur1 = JSON.parse(fs.readFileSync(cursorFile, 'utf8')); } catch { }
  check('cursor holds the transcript byte offset', (cur1[jsonl]?.offset || 0) > 0);

  // incremental: append ONE record → exactly one new event
  fs.appendFileSync(jsonl, rec('r3'));
  for (let i = 0; i < 40 && got.length < 3; i++) await sleep(250);
  check(`incremental push carries ONLY the new event (${got.length} total)`, got.length === 3 && got[2].rid === 'r3');

  // TWO-PHASE: with acks suppressed, the batch still arrives but the cursor
  // must NOT advance — an unacked batch would re-emit on the next walk and
  // rid dedup absorbs it. This is the loss-window closure.
  acking = false;
  let before = ''; try { before = fs.readFileSync(cursorFile, 'utf8'); } catch { }
  fs.appendFileSync(jsonl, rec('r4'));
  for (let i = 0; i < 40 && got.length < 4; i++) await sleep(250);
  check('unacked batch still delivers the event', got.length === 4 && got[3].rid === 'r4');
  await sleep(800);
  let after = ''; try { after = fs.readFileSync(cursorFile, 'utf8'); } catch { }
  check('…but the cursor did NOT advance without the ack (two-phase preserved)', after === before);
  if (failed) { try { console.error('--- daemon log tail ---\n' + fs.readFileSync(path.join(ROOT, 'agentd.out'), 'utf8').slice(-1500)); } catch { } }
} finally {
  try { await dm.stop?.(); } catch { }
}

// ── lane ledger-dedup-law r5: THE PUSH ROAD'S ACK IS DURABILITY ──
{
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-uep-ack-'));
  more.push(tmp2);
  const ROOT2 = path.join(tmp2, 'agentd'), home2 = path.join(tmp2, 'home'), proj2 = path.join(home2, '.claude', 'projects', '-home-u-y');
  fs.mkdirSync(proj2, { recursive: true });
  const was = { root: process.env.VIBESPACE_AGENTD_ROOT, home: process.env.HOME };
  process.env.VIBESPACE_AGENTD_ROOT = ROOT2; process.env.HOME = home2; // the second daemon's own root and HOME
  const SID2 = 'bbbb1111-2222-3333-4444-555566667777', jsonl2 = path.join(proj2, SID2 + '.jsonl');
  const recAt = (rid, ts) => JSON.stringify({ type: 'assistant', requestId: rid, timestamp: new Date(ts).toISOString(), cwd: '/home/u/y', message: { id: 'msg_' + rid, model: 'claude-fable-5', usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0 } } }) + '\n';
  const OCT = Date.UTC(2026, 9, 5, 12), NOV = Date.UTC(2026, 10, 5, 12);
  fs.writeFileSync(jsonl2, [0, 1, 2, 3, 4].map((k) => recAt('oct' + k, OCT + k * 1000)).join('') + [0, 1, 2, 3, 4].map((k) => recAt('nov' + k, NOV + k * 1000)).join(''));
  // the hub's ledger: October over the bound (the product's 2 GiB, scaled to 64 KiB) and PROVEN free of repeats — proven-over
  const { UsageHistory, ackOf } = require('../src/usage-history.js');
  const { HostManager } = require('../src/hosts.js');
  const hub = path.join(tmp2, 'hub'); fs.mkdirSync(path.join(hub, 'usage-history'), { recursive: true });
  const octShard = path.join(hub, 'usage-history', 'events-2026-10.ndjson'), novShard = path.join(hub, 'usage-history', 'events-2026-11.ndjson');
  fs.writeFileSync(octShard, Array.from({ length: 400 }, (_, i) => JSON.stringify({ rid: `h:host-x:req_${i}`, ts: OCT - 86400e3 + i * 1000, sid: 's', be: 'claude', model: 'claude-fable-5', acct: 'host-x', atype: 'host', aname: 'X', host: 'host-x', cwd: '/srv/app', origin: 'main', i: 10, cw5: 1, cw1: 0, cr: 5000, o: 300 })).join('\n') + '\n');
  const uh = new UsageHistory({ dataDir: hub, homeDir: path.join(hub, 'home') });
  uh.shapeMaxBytes = 64 * 1024;
  const say = console.log, warn = console.warn; console.log = () => { }; console.warn = () => { };
  try { await uh.dedupShard(octShard); } finally { console.log = say; console.warn = warn; }
  const v0 = uh._shapeVerdict(octShard);
  // server.js's own handler (its source, the ONE line the push road reads), over this ledger
  const src = fs.readFileSync(path.join(repo, 'server.js'), 'utf8');
  const m = /hosts\.onUsageEvents = (\(hostId, text\) => \{[\s\S]*?\n\});/.exec(src);
  const handler = m ? new Function('hosts', 'usageHistory', 'usageIdentityGroups', 'usageEstimator', 'kickPoolEval', 'usageAckOf', 'return ' + m[1])(
    { get: () => ({ name: 'M' }) }, uh, () => [], { invalidate() { } }, () => { }, ackOf) : null;
  const pushes = [], acks = [];
  const hostsLike = { invalidateDiscovery() { }, onDeviceDirty() { }, onSessionEvents() { }, onUsageEvents: (id, text) => { pushes.push(String(text).split('\n').filter(Boolean).length); const q = console.warn, l = console.log; console.warn = () => { }; console.log = () => { }; try { return handler(id, text); } finally { console.warn = q; console.log = l; } } };
  const dataDir2 = path.join(tmp2, 'data'); fs.mkdirSync(dataDir2, { recursive: true });
  const dm2 = new DeviceManager({ dataDir: dataDir2, bundlePath: bundle, version, log: pidLog });
  try {
    dm2.installLocal();
    await dm2.connect(); // spawned with ROOT2 + home2 (the env it is born with)
    process.env.VIBESPACE_AGENTD_ROOT = was.root; process.env.HOME = was.home;
    const realAck = dm2.ackUsageEvents.bind(dm2);
    dm2.ackUsageEvents = (seq) => { acks.push(seq); realAck(seq); };
    check('r5 the probe: October proven-over at the hub, server.js\'s handler read from its source', !!handler && v0 && v0.ok === false && v0.why === 'size' && v0.proven === true, JSON.stringify(v0));
    HostManager.prototype._armDirtyPush.call(hostsLike, 'host-m', dm2); // hosts.js's push handler — the real one
    for (let i = 0; i < 40 && !pushes.length; i++) await sleep(250);
    const cursor2 = path.join(ROOT2, 'state', 'usage-push-cursor.json');
    for (let i = 0; i < 12 && !fs.existsSync(cursor2); i++) await sleep(250);
    let c1 = {}; try { c1 = JSON.parse(fs.readFileSync(cursor2, 'utf8')); } catch { }
    const p = uh.ingestPaused()[0] || {};
    let novRows = 0; try { novRows = fs.readFileSync(novShard, 'utf8').split('\n').filter(Boolean).length; } catch { }
    check(`r5 a push of 5 October + 5 November with October proven-over: ACKED (${acks.length} ack(s)), the daemon's cursor committed (${(c1[jsonl2] && c1[jsonl2].offset) || 0} B) — November appended (${novRows}), October HELD (${p.held}) (ff094d46: acked=false, the cursor never committed)`,
      pushes[0] === 10 && acks.length >= 1 && (c1[jsonl2]?.offset || 0) > 0 && novRows === 5 && p.held === 5, JSON.stringify({ pushes, acks, cursor: c1[jsonl2] || null, novRows, held: p.held }));
    fs.appendFileSync(jsonl2, recAt('nov5', NOV + 9000));
    for (let i = 0; i < 40 && pushes.length < 2; i++) await sleep(250);
    let novRows2 = 0; try { novRows2 = fs.readFileSync(novShard, 'utf8').split('\n').filter(Boolean).length; } catch { }
    check(`r5 the next push carries ONLY the new event (${pushes[1]} event(s)), the November file 6 rows (${novRows2}) (ff094d46: the whole window again, 11 events, at every transcript change)`, pushes[1] === 1 && novRows2 === 6, JSON.stringify({ pushes, acks, novRows2 }));
    check('r5 the push road and the harvest road read ONE verdict: server.js returns usage-history ackOf(r) — a pause alone acks, a deferral or a month\'s unwritten hold does not', /return usageAckOf\(r\);/.test(m ? m[1] : '') && ackOf({ appended: 1, paused: {}, held: 5 }) === true && ackOf({ deferred: 'ledger-index-loading' }) === false && ackOf({ appended: 1, holdFailed: [{ month: '2026-10' }] }) === false);
  } finally {
    process.env.VIBESPACE_AGENTD_ROOT = was.root; process.env.HOME = was.home;
    try { dm2.stop?.(); } catch { }
    fs.rmSync(tmp2, { recursive: true, force: true });
  }
}
cleanup();
console.log(failed ? `FAIL (${failed})` : `ALL PASS (${passed})`);
process.exit(failed ? 1 : 0);

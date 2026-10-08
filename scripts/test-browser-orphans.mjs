#!/usr/bin/env node
// LANE DAEMON-ORPHAN-END (2026-10-08): an agent-browser daemon (and its Xvfb) with no browser, no lease and no
// conversation is ENDED by the keeper, by identity, after a said grace; a daemon the keeper did not start is REPORTED.
// ① the PURE verdict table (+ closed-world mutants: ending under a live lease / ending an unmarked daemon ⇒ red)
// ② the process-table reader's shape (Xvfb by child and by -auth, a client verb is not a daemon, the launch mark)
// ③ the REAL keeper over a fixture process table (ended by pid + starttime, leased / recent / running kept, unmarked
//    reported once, the boot sweep once, the row's words) ④ the browser-serve op + the agent's capability gate.
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const O = require('../src/browser-orphans.js');
const K = require('../src/server/browser-keeper.js');
const S = require('../src/browser-serve.js');
const F = require('../src/browser-facts.js');
const { DeviceManager } = require('../src/agentd/client.js');
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 400) : '')); } };
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-orphans-'));
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* none */ } });
const MIN = 60000, H = 60 * MIN, NOW = 1_800_000_000_000;

// ═══ ① THE VERDICT TABLE ═══
console.log('— ① the verdict table');
function table(V) {
  const bad = [];
  const d = (x = {}) => ({ pid: 7, starttime: 70, owned: true, stoppedIdleAt: NOW - 2 * H, noBrowserSince: NOW - 2 * H, ...x });
  const row = (want, inp, label) => { const v = V.daemonVerdict({ now: NOW, graceMs: O.GRACE_MS, ...inp }); if (v.act !== want) bad.push(`${label}: ${v.act} (${v.why})`); };
  for (const conv of ['gone', 'running', null]) {
    for (const [age, past] of [[O.GRACE_MS - 1, false], [O.GRACE_MS, true], [2 * H, true]]) {
      const base = { daemon: d({ noBrowserSince: NOW - age, stoppedIdleAt: NOW - age }), conversationAlive: conv };
      const endNow = past && conv !== 'running';
      row(endNow ? 'end' : 'keep', base, `${conv} no-browser ${age}`);
      row('keep', { ...base, browserAlive: true }, `${conv} chrome alive ${age}`);
      row('keep', { ...base, leases: 1 }, `${conv} leased ${age}`);
      row('keep', { ...base, lastVerbAt: NOW - O.GRACE_MS + 1 }, `${conv} verb within grace ${age}`);
      row('keep', { ...base, lastViewerAt: NOW - 1000 }, `${conv} viewer within grace ${age}`);
      row('report', { ...base, daemon: { ...base.daemon, owned: false } }, `${conv} unmarked ${age}`);
      row('keep', { ...base, daemon: { ...base.daemon, starttime: null } }, `${conv} no starttime ${age}`);
    }
  }
  // a stopped-idle daemon of a RUNNING conversation: kept for the next verb, ended past the 6 h cap
  row('keep', { daemon: d({ stoppedIdleAt: NOW - 5 * H, noBrowserSince: NOW - 5 * H }), conversationAlive: 'running', lastVerbAt: NOW - 5 * H }, 'running, idle 5 h');
  row('end', { daemon: d({ stoppedIdleAt: NOW - 7 * H, noBrowserSince: NOW - 7 * H }), conversationAlive: 'running', lastVerbAt: NOW - 7 * H }, 'running, idle 7 h');
  row('keep', { daemon: d({ stoppedIdleAt: null }), conversationAlive: 'running' }, 'running, live record');
  row('keep', { daemon: d({ stoppedIdleAt: null }), conversationAlive: null }, 'named profile, live record (the idle clock owns it)');
  row('end', { daemon: d({ stoppedIdleAt: null }), conversationAlive: 'gone' }, 'archived conversation, live record');
  return bad;
}
const bad = table(O);
ok(bad.length === 0, `the table holds (${3 * 3 * 7 + 5} rows: running / archived / none × the grace × every input)`, bad);
ok(O.rowNote(130 * MIN) === 'stopped — the daemon was ended after 2.2 h idle (restarts on the next command)', 'the row\'s words', O.rowNote(130 * MIN));
function mutant(from, to, name) {
  const src = fs.readFileSync(path.join(REPO, 'src/browser-orphans.js'), 'utf8');
  if (!src.includes(from)) return null;
  const f = path.join(ROOT, `mut-${name}.js`); fs.writeFileSync(f, src.replace(from, to));
  return table(require(f));
}
const m1 = mutant("  if (num(leases) > 0) return { act: 'keep', why: 'a lease holds it' };\n", '', 'lease');
ok(m1 && m1.some((x) => /leased/.test(x)), 'CONTROL: a patched copy that ends a daemon under a live lease is RED', m1);
const m2 = mutant("if (!d.owned) return { act: 'report'", "if (false) return { act: 'report'", 'unmarked');
ok(m2 && m2.some((x) => /unmarked/.test(x)), 'CONTROL: a patched copy that ends an unmarked daemon is RED', m2);

// ═══ ② THE PROCESS TABLE ═══
console.log('— ② the process table');
const CFG = path.join(ROOT, 'data', 'browser-env');
const AB = '/opt/x/agent-browser-linux-x64';
const dmn = (pid, st, ago, env = {}) => ({ pid, ppid: 1, starttime: st, startedAt: NOW - ago, argv: [AB], env: { AGENT_BROWSER_DAEMON: '1', ...env } });
{
  const rows = [dmn(10, 100, H, { XAUTHORITY: '/tmp/agent-browser-xauth-a' }), { pid: 11, ppid: 1, starttime: 110, argv: ['Xvfb', ':99', '-displayfd', '5', '-auth', '/tmp/agent-browser-xauth-a'] },
    dmn(20, 200, H), { pid: 21, ppid: 20, starttime: 210, argv: ['/usr/bin/Xvfb', '-auth', '/tmp/agent-browser-xauth-b'] }, { pid: 22, ppid: 20, starttime: 220, argv: ['/opt/chrome/chrome', '--user-data-dir=/x'] }, { pid: 23, ppid: 22, starttime: 230, argv: ['/opt/chrome/chrome', '--type=renderer'] },
    { pid: 30, ppid: 1, starttime: 300, argv: [AB, 'open', 'x'], env: {} }];
  const ds = O.daemonsFromRows(rows);
  ok(ds.length === 2 && !ds.some((x) => x.pid === 30), 'a client verb (no AGENT_BROWSER_DAEMON=1) is not a daemon', ds.map((x) => x.pid));
  ok(ds[0].xvfb.map((x) => x.pid).join() === '11' && ds[0].chrome.length === 0, 'the Xvfb whose -auth file the daemon\'s env names goes with it (not its child)', ds[0]);
  ok(ds[1].xvfb.map((x) => x.pid).join() === '21' && ds[1].chrome.map((x) => x.pid).join() === '22', 'its child Xvfb goes with it; its Chrome is the --type-less child (a renderer is not counted)', ds[1]);
  ok(JSON.stringify(O.daemonMark({ AGENT_BROWSER_CONFIG: path.join(CFG, 'machine-ephemeral-bk-0000000d.json') }, [CFG])) === '{"kind":"ephemeral","mark":"bk-0000000d"}'
    && O.daemonMark({ AGENT_BROWSER_CONFIG: path.join(CFG, 'machine.json') }, [CFG]) === null && O.daemonMark({ AGENT_BROWSER_CONFIG: '/elsewhere/machine-bp-00000001.json' }, [CFG]) === null,
  'the launch mark is read from the keeper\'s own config file (an unmarked machine.json / another directory is not ours)');
}

// ═══ ③ THE KEEPER OVER A FIXTURE PROCESS TABLE ═══
console.log('— ③ the keeper');
{
  const dataDir = path.join(ROOT, 'data'); fs.mkdirSync(CFG, { recursive: true });
  const prof = (n, label, extra = {}) => ({ id: `bp-0000000${n}`, label, dir: path.join(ROOT, 'prof-' + n), createdAt: NOW - 9 * H, ...extra });
  const recd = (n, pid, st) => ({ profileId: `bp-0000000${n}`, ns: `vs-bp-0000000${n}`, pid, starttime: st, state: 'stopped', stoppedBy: 'idle', endedAt: NOW - 2 * H, hostId: null, external: false });
  fs.writeFileSync(path.join(dataDir, 'browser-profiles.json'), JSON.stringify({ version: 1,
    profiles: [prof('a', 'Leased'), prof('b', 'Idle', { lastVerbAt: NOW - 2 * H }), prof('c', 'Recent', { lastVerbAt: NOW - MIN })],
    leases: [{ profileId: 'bp-0000000a', browserKey: 'bk-0000000a', at: NOW - 3 * H }],
    browsers: { 'bp-0000000a': recd('a', 9001, 111), 'bp-0000000b': recd('b', 9002, 222), 'bp-0000000c': recd('c', 9003, 333) } }));
  let rows = [dmn(9001, 111, 3 * H), dmn(9002, 222, 3 * H), dmn(9003, 333, 3 * H),
    dmn(9004, 444, 3 * H, { AGENT_BROWSER_CONFIG: path.join(CFG, 'machine-ephemeral-bk-0000000d.json') }), { pid: 9005, ppid: 9004, starttime: 555, argv: ['Xvfb', '-auth', '/tmp/agent-browser-xauth-d'] },
    dmn(9006, 666, 50 * H, { AGENT_BROWSER_CONFIG: '/home/someone/machine.json' }),
    dmn(9007, 777, 3 * H, { AGENT_BROWSER_CONFIG: path.join(CFG, 'machine-ephemeral-bk-0000000e.json') }),
    dmn(9008, 888, 3 * H, { AGENT_BROWSER_CONFIG: path.join(CFG, 'machine-ephemeral-bk-0000000f.json') }), { pid: 9009, ppid: 9008, starttime: 999, argv: ['/opt/chrome/chrome'] }];
  let clock = NOW, reads = 0; const ended = [], lines = [];
  const live = new Set(['bk-0000000a', 'bk-0000000e']);
  const log = { log: (l) => lines.push(l), warn: (l) => lines.push(l), error: (l) => lines.push(l) };
  const keeper = K.create({ dataDir, homeDir: ROOT, env: () => ({ PATH: path.join(ROOT, 'nobin'), HOME: ROOT }), liveKeys: () => live, install: false, log, now: () => clock,
    daemonTable: async () => { reads++; return rows; },
    endIdentity: async (pid, st) => { ended.push(`${pid}:${st}`); rows = rows.filter((r) => !(r.pid === pid && r.starttime === st)); return 'ended'; } });
  await keeper.boot();
  ok(reads === 1, 'the boot sweep read the process table once', reads);
  ok(ended.includes('9002:222') && ended.includes('9004:444') && ended.includes('9005:555'), 'ENDED by pid + starttime: the stopped-idle record\'s daemon (no lease, no verb for 2 h) and the archived conversation\'s daemon WITH its Xvfb', ended);
  ok(!ended.some((x) => /^900[13678]:/.test(x)), 'KEPT: the leased one, the recently-used one, the running conversation\'s, the one with a Chrome — and the unmarked one is never ended', ended);
  ok(lines.filter((l) => /pid 9006 .*reported, left running/.test(l)).length === 1, 'the unmarked daemon is REPORTED, once', lines.filter((l) => /9006/.test(l)));
  ok(lines.some((l) => /ended the browser daemon pid 9004 \(its conversation is gone; no browser for 3 h; conversation bk-0000000d\): ended; its Xvfb pid 9005 ended/.test(l)), 'ONE journal line per ending names the why, the conversation and its Xvfb', lines.filter((l) => /9004/.test(l)));
  const rb = JSON.parse(fs.readFileSync(path.join(dataDir, 'browser-profiles.json'), 'utf8')).browsers['bp-0000000b'];
  ok(rb && rb.note === 'stopped — the daemon was ended after 2 h idle (restarts on the next command)', 'the profile row says how long it idled and that the next command restarts it', rb && rb.note);
  await keeper.tick();
  ok(reads === 1, 'a tick inside the scan interval does not re-walk (the boot sweep ran once)', reads);
  clock = NOW + 7 * H; await keeper.tick();
  ok(reads === 2 && ended.includes('9007:777') && !ended.some((x) => /^9006:|^9001:|^9008:/.test(x)), 'idle past 6 h, a running conversation\'s stopped daemon is ended (the next verb restarts it); the leased, the unmarked and the one with a Chrome are not', { reads, ended });
  ok(lines.filter((l) => /pid 9006 .*reported/.test(l)).length === 1, 'the report is not repeated tick after tick');
  keeper.shutdown();
}

// ═══ ④ THE SERVE OP + THE CAPABILITY GATE ═══
console.log('— ④ browser-serve end-daemon + the capability gate');
{
  const kid = spawn('/bin/sleep', ['300'], { argv0: 'agent-browser-linux-x64', env: { AGENT_BROWSER_DAEMON: '1' }, stdio: 'ignore' });
  const other = spawn('/bin/sleep', ['300'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 150));
  const st = F.procStart(kid.pid);
  const bs = { homeDir: ROOT, runtime: { info: async () => ({ active: true, pid: kid.pid }) } };
  const s1 = await S.runBrowserServeOp(bs, 'status', { profileId: 'bp-0000000a' });
  ok(s1.ok && s1.daemon && s1.daemon.pid === kid.pid && s1.daemon.starttime === st && s1.daemon.chrome === false, 'status answers the daemon facts (pid, starttime, chrome)', s1.daemon);
  const w = await S.runBrowserServeOp(bs, 'end-daemon', { profileId: 'bp-0000000a', pid: kid.pid, starttime: st + 1 });
  ok(w.ok === false && w.code === 'not_that_daemon' && F.pidAlive(kid.pid), 'another starttime: refused, left running', w);
  const bo = { homeDir: ROOT, runtime: { info: async () => ({ active: true, pid: other.pid }) } };
  const n = await S.runBrowserServeOp(bo, 'end-daemon', { profileId: 'bp-0000000a', pid: other.pid, starttime: F.procStart(other.pid) });
  ok(n.ok === false && n.code === 'not_a_daemon' && F.pidAlive(other.pid), 'a process that is not a browser daemon: refused, left running', n);
  const e = await S.runBrowserServeOp(bs, 'end-daemon', { profileId: 'bp-0000000a', pid: kid.pid, starttime: st });
  await new Promise((r) => setTimeout(r, 100));
  ok(e.ok && e.result === 'ended' && !F.pidAlive(kid.pid), 'its daemon by pid + starttime: ended', e);
  try { other.kill('SIGKILL'); } catch { /* gone */ }
  const ask = async (caps, action) => { const self = { connect: async () => ({ info: { capabilities: caps } }), _request: async () => ({ result: { ok: true, asked: action } }) }; try { return await DeviceManager.prototype.browserServe.call(self, action, { profileId: 'bp-0000000a' }); } catch (x) { return { thrown: x.code, message: x.message }; } };
  const old = await ask(['browser-serve', 'browser-builds', 'browser-remove'], 'end-daemon');
  ok(old.thrown === 'end_daemon_unsupported' && /upgrade the agent/.test(old.message), 'an agent without `browser-end-daemon` is never asked: end_daemon_unsupported by name', old);
  ok((await ask(['browser-serve', 'browser-end-daemon'], 'end-daemon')).asked === 'end-daemon', 'with the capability it is asked');
  const daemonSrc = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8');
  ok(/capabilities: \[[^\]]*'browser-end-daemon'[^\]]*\]/.test(daemonSrc) && S.BROWSER_SERVE_OPS.includes('end-daemon'), 'the daemon announces `browser-end-daemon`; `end-daemon` is in the shared op table');
}

console.log(`\n${fail ? '✗' : '✓'} test-browser-orphans: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
// LANE DAEMON-ORPHAN-END (2026-10-08): an agent-browser daemon (and its Xvfb) with no browser, no lease and no
// conversation is ENDED by the keeper, by identity, after a said grace; a daemon the keeper did not start is REPORTED.
// ① the PURE verdict table (+ closed-world mutants: ending under a live lease / ending an unmarked daemon ⇒ red)
// ② the process-table reader's shape (Xvfb by child and by -auth, a client verb is not a daemon, the launch mark)
// ③ the REAL keeper over a fixture process table (ended by pid + starttime, leased / recent / running kept, unmarked
//    reported once, the boot sweep once, the row's words) ④ the browser-serve op + the agent's capability gate.
// LANE BROWSER-DAEMON-SURVIVES-UPDATE (B-1574, userW's four freezes after server auto-updates): THE OTHER HALF — a daemon no
// live record keeps whose browser ENDED (gone, or its endpoint silent) for the bound is ended whoever leases it; a SERVER
// RESTART re-owns each daemon of ours whose page answers and ends the rest. ① the table (kept / not kept × the bound) + the
// pre-fix control ⑤ the other half over time on a fake clock (a silent endpoint, a Chrome gone; the row + the journal say it;
// CONTROL the pre-fix verdict keeps both) ⑥ the boot (a stopped record's daemon whose page answers RE-OWNED, a silent one
// ENDED with its Chrome, a live record whose page answers nothing ENDED at adoption; CONTROL the pre-fix boot leaves them).
// LANE LEDGER-DEDUP-LAW r12 (test-boot-loop-hold's law, red at 272 ms on a busy box): ⑦ THE CENSUS READS THE TABLE ONCE — the
// real keeper's boot census over a busy box's table (1 500 processes, 40 daemons) calls daemonsFromRows ONCE a pass, the
// call O(processes); CONTROL the pre-fix reader (inline, its per-daemon filters) — the same answer on random tables, and
// once more per daemon seen: ~40× the cost of one loop turn's census. The claim is a COUNT (test-ci-gate: no wall-clock
// bound in a fast suite): the row reads one call makes, through proxied rows.
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { deadPorts } from './scratch.mjs';
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
  const E = V.BROWSER_ENDED_MS || 60000;
  const d = (x = {}) => ({ pid: 7, starttime: 70, owned: true, stoppedIdleAt: NOW - 2 * H, noBrowserSince: NOW - 2 * H, ...x });
  const row = (want, inp, label) => { const v = V.daemonVerdict({ now: NOW, graceMs: O.GRACE_MS, ...inp }); if (v.act !== want) bad.push(`${label}: ${v.act} (${v.why})`); };
  // NO LIVE RECORD KEEPS IT (a stopped record, or none — `stoppedIdleAt` set): its browser ENDED ≥ the bound ⇒ ended, whoever
  // leases it and however recent its last command (lane browser-daemon-survives-update); inside the bound the old rules
  for (const conv of ['gone', 'running', null]) {
    for (const [age, past] of [[E - 1, false], [E, true], [O.GRACE_MS, true], [2 * H, true]]) {
      const base = { daemon: d({ noBrowserSince: NOW - age, stoppedIdleAt: NOW - age }), conversationAlive: conv };
      row(past ? 'end' : 'keep', base, `${conv} no-browser ${age}`);
      row('keep', { ...base, browserAlive: true }, `${conv} chrome alive ${age}`);
      row(past ? 'end' : 'keep', { ...base, leases: 1 }, `${conv} leased ${age}`);
      row(past ? 'end' : 'keep', { ...base, lastVerbAt: NOW - 1000 }, `${conv} a command 1 s ago ${age}`);
      row(past ? 'end' : 'keep', { ...base, lastViewerAt: NOW - 1000 }, `${conv} a viewer 1 s ago ${age}`);
      row('report', { ...base, daemon: { ...base.daemon, owned: false } }, `${conv} unmarked ${age}`);
      row('keep', { ...base, daemon: { ...base.daemon, starttime: null } }, `${conv} no starttime ${age}`);
      row(past ? 'end' : 'keep', { ...base, browserAlive: true, silentSince: NOW - age, leases: 1 }, `${conv} chrome alive, its endpoint silent ${age}`);
      row('keep', { ...base, browserAlive: true, silentSince: null, leases: 1 }, `${conv} chrome alive and answering ${age}`);
    }
  }
  // A LIVE RECORD KEEPS IT (`stoppedIdleAt` null — the tick's: healed in place while leased, closed by name, its hang the
  // unresponsive verdict's — never ended here): the daemon-orphan-end rules
  const k = (x = {}) => d({ stoppedIdleAt: null, ...x });
  for (const conv of ['gone', 'running', null]) {
    for (const [age, pastGrace] of [[O.GRACE_MS - 1, false], [O.GRACE_MS, true], [2 * H, true]]) {
      const base = { daemon: k({ noBrowserSince: NOW - age }), conversationAlive: conv };
      row(pastGrace && conv === 'gone' ? 'end' : 'keep', base, `kept ${conv} no-browser ${age}`);
      row('keep', { ...base, browserAlive: true, silentSince: NOW - 2 * H }, `kept ${conv} chrome silent 2 h ${age}`);
      row('keep', { ...base, leases: 1 }, `kept ${conv} leased ${age}`);
      row('keep', { ...base, lastVerbAt: NOW - O.GRACE_MS + 1 }, `kept ${conv} verb within grace ${age}`);
      row('keep', { ...base, lastViewerAt: NOW - 1000 }, `kept ${conv} viewer within grace ${age}`);
    }
  }
  return bad;
}
const bad = table(O);
ok(bad.length === 0, `the table holds (${3 * 4 * 9 + 3 * 3 * 5} rows: not kept / kept by a live record × running / archived / none × the bound and the grace × every input)`, bad);
ok(O.BROWSER_ENDED_MS === 60000 && O.SCAN_MS === 60000, 'the bound: 60 s after its browser ended (the census every 60 s ⇒ ended within 2 min)');
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
const m3 = mutant('  if (d.stoppedIdleAt != null && d.starttime != null && !d.cdp) {\n', '  if (false) {\n', 'outlives');
ok(m3 && m3.some((x) => /^(gone|running|null) leased 600000: keep/.test(x)) && m3.some((x) => /endpoint silent/.test(x)), 'CONTROL: the pre-fix verdict (no other half) keeps a leased daemon whose browser ended 10 min ago, and one whose browser has not answered for 2 h — RED', m3 && m3.slice(0, 3));

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
  const ep = O.daemonsFromRows([dmn(40, 400, H), { pid: 41, ppid: 40, starttime: 410, argv: ['/usr/bin/google-chrome', '--remote-debugging-port=42173', '--user-data-dir=/tmp/x/agent-browser-chrome-1', 'about:blank'] }])[0];
  ok(ep.chrome[0].port === 42173 && ep.chrome[0].dir === '/tmp/x/agent-browser-chrome-1', 'lane browser-daemon-survives-update: its Chrome\'s endpoint is read off the Chrome\'s own argv (the main process\'s is NUL-separated — measured; a child rewrites its title)', ep.chrome);
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
  // lane browser-daemon-survives-update (the other half): no live record keeps them and their browser ended 3 h ago ⇒ ended
  // too, the leased one, the recently-used one and the running conversation's (each one's next command starts a fresh one)
  ok(['9001:111', '9003:333', '9007:777'].every((x) => ended.includes(x)), 'ENDED (the other half): the LEASED one, the recently-used one, the running conversation\'s — no live record keeps them and their browser ended 3 h ago', ended);
  ok(!ended.some((x) => /^900[68]:/.test(x)), 'KEPT: the one with a Chrome — and the unmarked one is never ended', ended);
  ok(lines.filter((l) => /pid 9006 .*reported, left running/.test(l)).length === 1, 'the unmarked daemon is REPORTED, once', lines.filter((l) => /9006/.test(l)));
  ok(lines.some((l) => /ended the browser daemon pid 9004 \(its browser ended 3 h ago and no live record keeps it; no browser for 3 h; conversation bk-0000000d\): ended; its Xvfb pid 9005 ended/.test(l)), 'ONE journal line per ending names the why, the conversation and its Xvfb', lines.filter((l) => /9004/.test(l)));
  const rb = JSON.parse(fs.readFileSync(path.join(dataDir, 'browser-profiles.json'), 'utf8')).browsers['bp-0000000b'];
  ok(rb && rb.note === 'stopped — its browser daemon was ended at 08:00 UTC: its browser ended 3 h ago and no live record keeps it (the next command starts a fresh one)', 'the profile row says why it was ended and that the next command starts a fresh one', rb && rb.note);
  ok(require('../src/browser-verbs.js').browserCell(keeper.browserOf('bp-0000000a')) === keeper.browserOf('bp-0000000a').note, '`status` says it too (its browser cell is the row\'s words — never a silent exit)', require('../src/browser-verbs.js').browserCell(keeper.browserOf('bp-0000000a')));
  await keeper.tick();
  ok(reads === 1, 'a tick inside the scan interval does not re-walk (the boot sweep ran once)', reads);
  clock = NOW + 7 * H; const n0 = ended.length; await keeper.tick();
  ok(reads === 2 && ended.length === n0 && !ended.some((x) => /^9006:|^9008:/.test(x)), 'a later census ends nothing more: the unmarked one and the one with a Chrome (no endpoint to ask) stay', { reads, ended });
  ok(lines.filter((l) => /pid 9006 .*reported/.test(l)).length === 1, 'the report is not repeated tick after tick');
  keeper.shutdown();
}

// ═══ ⑤ lane browser-daemon-survives-update: THE OTHER HALF over time (a fake clock, a real silent endpoint) ═══
console.log('— ⑤ the other half: a daemon nobody keeps whose browser ended / stopped answering');
const net = require('net');
const silent = net.createServer((sk) => { sk.on('error', () => { }); }); // accepts, never answers (the measured wedged Chrome)
await new Promise((r) => silent.listen(0, '127.0.0.1', r));
const SILENT = silent.address().port;
const SRCDIR = path.join(REPO, 'src');
const absReq = (src, dir, map = {}) => src.replace(/require\((['"])(\.\.?\/[^'"]+)\1\)/g, (m, q, rel) => 'require(' + JSON.stringify(map[rel] || path.resolve(dir, rel)) + ')');
function keeperCopy(name, patches = [], orphans = null) {
  let ks = fs.readFileSync(path.join(SRCDIR, 'server/browser-keeper.js'), 'utf8');
  for (const [a, b] of patches) { if (!ks.includes(a)) return null; ks = ks.replace(a, b); }
  const f = path.join(ROOT, `keeper-${name}.js`); fs.writeFileSync(f, absReq(ks, path.join(SRCDIR, 'server'), orphans ? { '../browser-orphans.js': orphans } : {}));
  return require(f);
}
async function otherHalf(Kmod, tag) {
  const dataDir = path.join(ROOT, 'oh-' + tag, 'data'); const cfg = path.join(dataDir, 'browser-env'); fs.mkdirSync(cfg, { recursive: true });
  const T1 = NOW + 5 * MIN;
  fs.writeFileSync(path.join(dataDir, 'browser-profiles.json'), JSON.stringify({ version: 1,
    profiles: [{ id: 'bp-000000e1', label: 'Wedged', dir: path.join(ROOT, 'prof-h'), createdAt: NOW - 9 * H, lastVerbAt: T1 - 10000 }, { id: 'bp-000000e2', label: 'Gone', dir: path.join(ROOT, 'prof-i'), createdAt: NOW - 9 * H, lastVerbAt: T1 - 10000 }],
    leases: [{ profileId: 'bp-000000e1', browserKey: 'bk-000000e1', at: NOW - H }, { profileId: 'bp-000000e2', browserKey: 'bk-000000e2', at: NOW - H }],
    browsers: { 'bp-000000e1': { profileId: 'bp-000000e1', ns: 'vs-bp-000000e1', pid: 9101, starttime: 1101, state: 'stopped', lastError: 'the recorded daemon is alive but its namespace no longer answers', endedAt: NOW - H, hostId: null, external: false, cdpUrl: `ws://127.0.0.1:${SILENT}/devtools/browser/aaaaaaaa-0000` },
      'bp-000000e2': { profileId: 'bp-000000e2', ns: 'vs-bp-000000e2', pid: 9199, starttime: 1199, state: 'stopped', endedAt: NOW - H, hostId: null, external: false } } }));
  let rows = []; let clock = NOW; const ended = [], lines = [];
  const log = { log: (l) => lines.push(l), warn: (l) => lines.push(l), error: (l) => lines.push(l) };
  const kk = Kmod.create({ dataDir, homeDir: ROOT, env: () => ({ PATH: path.join(ROOT, 'nobin'), HOME: ROOT }), liveKeys: () => new Set(['bk-000000e1', 'bk-000000e2']), install: false, log, now: () => clock, tickMs: 3600e3, answerAskMs: 200,
    daemonTable: async () => rows, endIdentity: async (pid, st) => { ended.push(`${pid}:${st}`); rows = rows.filter((r) => !(r.pid === pid && r.starttime === st)); return 'ended'; } });
  await kk.boot();
  // a wedged Chrome under a stopped record's daemon (its endpoint accepts and never answers), and a daemon of profile i's mark
  // whose Chrome has gone — both LEASED, a command 10 s ago
  rows = [{ ...dmn(9101, 1101, 2 * H), env: { AGENT_BROWSER_DAEMON: '1' } }, { pid: 9102, ppid: 9101, starttime: 1102, argv: ['/usr/bin/google-chrome', `--remote-debugging-port=${SILENT}`, '--user-data-dir=/tmp/x/agent-browser-chrome-h'] },
    { ...dmn(9103, 1103, 30000, { AGENT_BROWSER_CONFIG: path.join(cfg, 'machine-bp-000000e2.json') }), startedAt: T1 - 30000 }];
  clock = T1; await kk.tick();
  const at1 = ended.slice();
  clock = T1 + 61000; await kk.tick();
  const r = { at1, ended: ended.slice(), lines: lines.filter((l) => /ended the browser daemon pid 910/.test(l)), notes: { h: (kk.browserOf('bp-000000e1') || {}).note, i: (kk.browserOf('bp-000000e2') || {}).note }, cell: require('../src/browser-verbs.js').browserCell(kk.browserOf('bp-000000e1')) };
  kk.shutdown();
  return r;
}
{
  const oh = await otherHalf(K, 'fixed');
  ok(oh.at1.length === 0, '⑤ inside the bound: the wedged one (first seen silent) and the one whose browser went 30 s ago are KEPT', oh.at1);
  ok(oh.ended.includes('9101:1101') && oh.ended.includes('9102:1102') && oh.ended.includes('9103:1103'), '⑤ 61 s later: the daemon whose Chrome has not answered CDP for 61 s is ENDED WITH that Chrome, and the one whose browser ended 91 s ago is ended — each LEASED, a command 10 s before', oh.ended);
  ok(oh.lines.some((l) => /pid 9101 \(its browser has not answered CDP for 1 min and no live record keeps it; its browser not answering\): ended; its browser pid 9102 ended/.test(l)) && oh.lines.some((l) => /pid 9103 \(its browser ended \d+ min ago and no live record keeps it; no browser for \d+ min\): ended/.test(l)), '⑤ the journal says each ending and why (never a silent exit)', oh.lines);
  ok(/^stopped — its browser daemon was ended at \d\d:\d\d UTC: its browser has not answered CDP for 1 min/.test(oh.notes.h || '') && /^stopped — its browser daemon was ended at \d\d:\d\d UTC: its browser ended \d+ min ago/.test(oh.notes.i || '') && oh.cell === oh.notes.h, '⑤ …and so do the rows and `status` (the record that named it; the mark\'s profile row for the one no record named)', oh.notes);
  const pre = path.join(ROOT, 'orphans-pre-fix.js');
  const osrc = fs.readFileSync(path.join(SRCDIR, 'browser-orphans.js'), 'utf8');
  fs.writeFileSync(pre, osrc.replace('  if (d.stoppedIdleAt != null && d.starttime != null && !d.cdp) {\n', '  if (false) {\n'));
  const Kpre = keeperCopy('pre-other-half', [], pre);
  const ctl = Kpre ? await otherHalf(Kpre, 'pre') : null;
  ok(ctl && !ctl.ended.some((x) => /^910[123]:/.test(x)), '⑤ CONTROL: the pre-fix verdict (no other half) keeps both — the wedged Chrome under a lease and the daemon whose browser is gone — the legs above can go red', ctl && ctl.ended);
}

// ═══ ⑥ lane browser-daemon-survives-update: A SERVER RESTART RE-OWNS OR ENDS (never leaves) ═══
console.log('— ⑥ a server restart re-owns the daemons whose page answers and ends the rest');
const [PJ, PK, PL, PM] = await deadPorts(4); // never answered: the page asks are the seam's (§81: no literal endpoint)
async function bootLeg(Kmod, tag) {
  const dataDir = path.join(ROOT, 'boot-' + tag, 'data'); fs.mkdirSync(path.join(dataDir, 'browser-env'), { recursive: true });
  const dirJ = path.join(ROOT, 'boot-' + tag, 'chrome-j'), dirK = path.join(ROOT, 'boot-' + tag, 'chrome-k'); fs.mkdirSync(dirJ, { recursive: true }); fs.mkdirSync(dirK, { recursive: true });
  fs.writeFileSync(path.join(dirJ, 'DevToolsActivePort'), `${PJ}\n/devtools/browser/aaaaaaaa-1111-jjjj\n`); fs.writeFileSync(path.join(dirK, 'DevToolsActivePort'), `${PK}\n/devtools/browser/aaaaaaaa-2222-kkkk\n`);
  // two REAL processes standing for two daemons whose records are LIVE (adoption judges pid + starttime on /proc)
  const sl = spawn('/bin/sleep', ['300'], { argv0: 'agent-browser-linux-x64', env: { AGENT_BROWSER_DAEMON: '1' }, stdio: 'ignore' });
  const sm = spawn('/bin/sleep', ['300'], { argv0: 'agent-browser-linux-x64', env: { AGENT_BROWSER_DAEMON: '1' }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 150));
  const ID = { j: 'f1', k: 'f2', l: 'f3', m: 'f4' }; const P = (n) => ({ id: `bp-000000${ID[n]}`, label: n.toUpperCase(), dir: path.join(ROOT, 'prof-' + n), createdAt: NOW - 9 * H });
  const R = (n, pid, st, x = {}) => ({ profileId: `bp-000000${ID[n]}`, ns: `vs-bp-000000${ID[n]}`, pid, starttime: st, hostId: null, external: false, ...x });
  fs.writeFileSync(path.join(dataDir, 'browser-profiles.json'), JSON.stringify({ version: 1,
    profiles: ['j', 'k', 'l', 'm'].map(P), leases: ['j', 'k', 'l', 'm'].map((n) => ({ profileId: `bp-000000${ID[n]}`, browserKey: `bk-0000000${n === 'j' ? 'a' : n === 'k' ? 'b' : n === 'l' ? 'c' : 'd'}`, at: NOW - H })),
    browsers: { 'bp-000000f1': R('j', 9201, 2201, { state: 'stopped', endedAt: NOW - H, lastError: 'the recorded daemon is alive but its namespace no longer answers' }),
      'bp-000000f2': R('k', 9301, 3301, { state: 'stopped', endedAt: NOW - H }),
      'bp-000000f3': R('l', sl.pid, F.procStart(sl.pid), { state: 'ready', cdpUrl: `ws://127.0.0.1:${PL}/devtools/browser/aaaaaaaa-3333-llll` }),
      'bp-000000f4': R('m', sm.pid, F.procStart(sm.pid), { state: 'ready', cdpUrl: `ws://127.0.0.1:${PM}/devtools/browser/aaaaaaaa-4444-mmmm` }) } }));
  const daemonOf = { 'vs-bp-000000f1': 9201, 'vs-bp-000000f2': 9301, 'vs-bp-000000f3': sl.pid, 'vs-bp-000000f4': sm.pid };
  const page = (answered) => ({ list: true, pages: [{ targetId: 'T0000001', url: 'https://app.example/', answered, reached: answered }] });
  const asks = { [`ws://127.0.0.1:${PJ}/devtools/browser/aaaaaaaa-1111-jjjj`]: page(true), [`ws://127.0.0.1:${PK}/devtools/browser/aaaaaaaa-2222-kkkk`]: page(false), [`ws://127.0.0.1:${PL}/devtools/browser/aaaaaaaa-3333-llll`]: { list: false, error: 'timeout', pages: [] }, [`ws://127.0.0.1:${PM}/devtools/browser/aaaaaaaa-4444-mmmm`]: page(true) };
  const rt0 = F.createBrowserRuntime({ env: { PATH: path.join(ROOT, 'nobin') } });
  const runtime = Object.assign(Object.create(rt0), { info: async (ns) => (daemonOf[ns] ? { ok: true, active: true, pid: daemonOf[ns], raw: { code: 0 } } : { ok: false, active: false, pid: null, raw: { code: 1, error: 'timeout' } }) });
  let rows = [dmn(9201, 2201, 2 * H), { pid: 9202, ppid: 9201, starttime: 2202, argv: ['/usr/bin/google-chrome', `--user-data-dir=${dirJ}`] }, dmn(9301, 3301, 2 * H), { pid: 9302, ppid: 9301, starttime: 3302, argv: ['/usr/bin/google-chrome', `--user-data-dir=${dirK}`] }];
  const ended = [], lines = [], asked = [];
  const log = { log: (l) => lines.push(l), warn: (l) => lines.push(l), error: (l) => lines.push(l) };
  const kk = Kmod.create({ dataDir, homeDir: ROOT, env: () => ({ PATH: path.join(ROOT, 'nobin'), HOME: ROOT }), liveKeys: () => new Set(['bk-0000000a', 'bk-0000000b', 'bk-0000000c', 'bk-0000000d']), install: false, log, now: () => NOW, tickMs: 3600e3, runtime,
    pageAsk: async (url) => { asked.push(url); return asks[url] || { list: false, error: 'timeout', pages: [] }; },
    daemonTable: async () => rows, endIdentity: async (pid, st) => { ended.push(`${pid}:${st}`); rows = rows.filter((r) => !(r.pid === pid && r.starttime === st)); return 'ended'; } });
  await kk.boot();
  const v = (n) => kk.browserOf(`bp-000000${ID[n]}`) || {};
  const r = { j: { state: v('j').state, pid: v('j').pid }, k: { state: v('k').state, note: v('k').note }, l: { state: v('l').state, lastError: v('l').lastError, alive: F.pidAlive(sl.pid) }, m: { state: v('m').state, alive: F.pidAlive(sm.pid) },
    ended: ended.slice(), lines: lines.filter((l) => /boot: the browser daemon/.test(l)), asked: asked.length, cdpJ: (JSON.parse(fs.readFileSync(path.join(dataDir, 'browser-profiles.json'), 'utf8')).browsers['bp-000000f1'] || {}).cdpUrl };
  kk.shutdown();
  for (const c of [sl, sm]) { try { c.kill('SIGKILL'); } catch { /* gone */ } }
  return r;
}
{
  const b = await bootLeg(K, 'fixed');
  ok(b.j.state === 'ready' && b.j.pid === 9201 && b.cdpJ === `ws://127.0.0.1:${PJ}/devtools/browser/aaaaaaaa-1111-jjjj`, '⑥ a STOPPED record\'s daemon still running, its page answering: RE-OWNED — the record ready again on that daemon, its endpoint read from its Chrome\'s DevToolsActivePort', { j: b.j, cdpJ: b.cdpJ });
  ok(b.k.state === 'stopped' && b.ended.includes('9301:3301') && b.ended.includes('9302:3302') && /^stopped — its browser daemon was ended at 08:00 UTC: none of its 1 page\(s\) answered within the bound/.test(b.k.note || ''), '⑥ a stopped record\'s daemon whose page answers NOTHING: ENDED with its Chrome, by identity; its row says why and that the next command starts a fresh one', { k: b.k, ended: b.ended });
  ok(b.l.state === 'stopped' && !b.l.alive && /its browser does not answer CDP \(the page list: timeout\) — its daemon was ended at the restart \(ended\)/.test(b.l.lastError || ''), '⑥ a LIVE record whose daemon answers `session info` while its browser answers nothing: ENDED at the adoption (it was adopted ready before)', b.l);
  ok(b.m.state === 'ready' && b.m.alive, '⑥ a live record whose page answers: adopted (re-owned), left running', b.m);
  ok(b.lines.length === 4 && b.lines.filter((l) => /RE-OWNED/.test(l)).length === 2 && b.lines.filter((l) => /ENDED/.test(l)).length === 2, '⑥ ONE journal line per daemon the boot judged (2 re-owned, 2 ended), each with why', b.lines);
  const P1 = ['        if (cliAsked(i)) {\n', '        if (false) {\n'], P2 = ["        if (seenBy === 'boot' && unkept && browserAlive && p) {\n", '        if (false) {\n'];
  const Kpre = keeperCopy('pre-boot', [P1, P2]);
  const c = Kpre ? await bootLeg(Kpre, 'pre') : null;
  ok(c && c.l.state === 'ready' && c.l.alive && c.j.state === 'stopped' && !c.ended.some((x) => /^9301:|^9302:/.test(x)), '⑥ CONTROL: the pre-fix boot ADOPTS the live record whose browser answers nothing (ready on `session info` alone — the incident), leaves the answering daemon under its stopped record unowned and keeps the silent one\'s daemon + Chrome — the legs above can go red', c && { j: c.j, l: c.l, ended: c.ended });
}
silent.close();

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

console.log('— ⑦ the census reads the table once (lane ledger-dedup-law r12)');
{
  const base = (p) => String(p || '').split('/').pop(), num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const daemonsFromRowsBefore = function (rows) { // 935a9f0b's, verbatim (its `base`/`num` are the module's)
    const all = (Array.isArray(rows) ? rows : []).filter((r) => r && Number.isInteger(r.pid));
    const byPid = new Map(all.map((r) => [r.pid, r]));
    const kids = (pid) => all.filter((r) => r.ppid === pid);
    const isXvfb = (r) => /^Xvfb$/.test(base((r.argv || [])[0]));
    const authOf = (r) => { const a = r.argv || []; const i = a.indexOf('-auth'); return i >= 0 ? String(a[i + 1] || '') : ''; };
    const isChrome = (r) => !isXvfb(r) && !/agent-browser/.test(base((r.argv || [])[0])) && !(r.argv || []).some((x) => /^--type=/.test(String(x)));
    // lane browser-daemon-survives-update: the Chrome's own endpoint (its DevTools port, its directory) off its argv
    const argOf = (r, k) => { const a = (r.argv || []).find((x) => String(x).startsWith(k + '=')); return a ? String(a).slice(k.length + 1) : null; };
    const daemons = all.filter((r) => /agent-browser/.test(base((r.argv || [])[0])) && r.env && r.env.AGENT_BROWSER_DAEMON === '1');
    return daemons.map((d) => {
      const near = [...kids(d.pid), ...kids(d.pid).flatMap((k) => kids(k.pid))];
      const xa = d.env && d.env.XAUTHORITY ? String(d.env.XAUTHORITY) : '';
      const xvfb = all.filter((r) => isXvfb(r) && (near.includes(r) || (xa && authOf(r) === xa)));
      return {
        pid: d.pid, ppid: d.ppid, cdp: !!(d.env && d.env.AGENT_BROWSER_CDP), starttime: d.starttime == null ? null : d.starttime, startedAt: num(d.startedAt), env: d.env || {},
        chrome: near.filter(isChrome).map((r) => ({ pid: r.pid, starttime: r.starttime, port: Number(argOf(r, '--remote-debugging-port')) || null, dir: argOf(r, '--user-data-dir') })),
        xvfb: [...new Set(xvfb)].map((r) => ({ pid: r.pid, starttime: r.starttime, auth: authOf(r) || null })),
        parentAlive: byPid.has(d.ppid),
      };
    });
  };
  let seed = 11; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const table = (n, d) => {
    const rows = [];
    for (let i = 0; i < n; i++) rows.push({ pid: 1000 + i, ppid: 1000 + Math.floor(rnd() * Math.max(1, i)), starttime: 5000 + i, startedAt: 0, argv: ['/usr/bin/bash', '-c', 'x'] });
    for (let k = 0; k < d; k++) {
      const p = 50000 + 10 * k, xa = `/tmp/agent-browser-xauth-${k}`;
      rows.push({ pid: p, ppid: 1, starttime: 9000 + k, startedAt: NOW - 3 * H, argv: ['/opt/agent-browser/agent-browser-linux-x64'], env: { AGENT_BROWSER_DAEMON: '1', XAUTHORITY: rnd() < 0.5 ? xa : '' } });
      rows.push({ pid: p + 1, ppid: p, starttime: 9100 + k, argv: ['/usr/bin/google-chrome', `--remote-debugging-port=${40000 + k}`, `--user-data-dir=/tmp/c${k}`] });
      rows.push({ pid: p + 2, ppid: rnd() < 0.5 ? p : 1, starttime: 9200 + k, argv: ['Xvfb', ':9' + k, '-auth', xa] });
      rows.push({ pid: p + 3, ppid: p + 1, starttime: 9300 + k, argv: ['/usr/bin/google-chrome', '--type=renderer'] });
    }
    return rows.sort(() => rnd() - 0.5);
  };
  let differ = 0;
  for (let i = 0; i < 200; i++) { const t = table(20 + Math.floor(rnd() * 300), 1 + Math.floor(rnd() * 12)); if (JSON.stringify(O.daemonsFromRows(t)) !== JSON.stringify(daemonsFromRowsBefore(t))) differ++; }
  const rows = table(1500, 40), dataDir = path.join(ROOT, 'data-census'); fs.mkdirSync(dataDir, { recursive: true });
  const real = O.daemonsFromRows; let calls = 0;
  O.daemonsFromRows = (r) => { calls++; return real(r); };
  try {
    const keeper = K.create({ dataDir, homeDir: ROOT, env: () => ({ PATH: path.join(ROOT, 'nobin'), HOME: ROOT }), liveKeys: () => new Set(), install: false, log: { log() { }, warn() { }, error() { } }, now: () => NOW, daemonTable: async () => rows, endIdentity: async () => 'ended' });
    await keeper.boot();
  } finally { O.daemonsFromRows = real; }
  // THE WORK, COUNTED: every field read of a row in one call (a Proxy per row) — the reader's, and the pre-fix one's
  const reads = (fn) => { let n = 0; const px = rows.map((r) => new Proxy(r, { get(t, k, rc) { n++; return Reflect.get(t, k, rc); } })); fn(px); return n; };
  const now = reads((r) => real(r)), was = reads((r) => daemonsFromRowsBefore(r));
  // the reader: ~6 field reads a row + one Xvfb match per daemon × Xvfb (40 × 40 here); the pre-fix one: the whole table per daemon
  ok(differ === 0 && calls === 1 && now <= 6 * rows.length + 2 * 40 * 40 && was > 40 * rows.length,
    `⑦ the census over a busy box's table (${rows.length} processes, 40 daemons) calls daemonsFromRows ${calls}× a pass, and a call reads ${now} row fields (${(now / rows.length).toFixed(1)} a row — linear in the processes + 40 × 40 Xvfb matches); the same answer as the pre-fix reader on ${200 - differ} of 200 random tables (CONTROL the pre-fix reader: ${was} row fields a call — ${(was / rows.length).toFixed(0)} a row, × the daemons — and the census called it once more per daemon seen: ${41 * was} reads a pass, test-boot-loop-hold's 272 ms hold)`,
    { differ, calls, now, was });
}

console.log(`\n${fail ? '✗' : '✓'} test-browser-orphans: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

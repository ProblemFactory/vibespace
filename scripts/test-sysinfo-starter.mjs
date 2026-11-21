#!/usr/bin/env node
// THE SYSTEM FACTS START THEIR PROGRAMS FROM THE HUB'S STARTER, NEVER A FORK OF THE HUB (B-360d, lane bl-keys-misc — the
// coordinator's r1020). The window-open burst measured on the candidate (the page /var/tmp/vibespace-lanes/bl-keys-misc/work/
// b360d-r1020-page.md): GET /api/sysinfo — once a page load (the rail's badge), at each render of the rail's System panel, and in
// the memory-pressure alert — held a scratch hub's loop 62 ms in ONE turn; in a small process the same read holds it 4–13 ms, the
// parse < 1 ms: the cost is the FORK of the hub (src/server/child-starter.js B-91aa measured those forks on the owner's 4.5–5 GB
// hub). THE LAW: every program src/sysinfo.js starts (ps, ps axo, df; sysctl / vm_stat on darwin) goes through ONE helper,
// runProgram: the hub's starter when one is handed (the hub hands it beside the desktop belt's), else execFile — the device agent
// hands none (its own small process, as the belt's). A starter's «no answer», a timeout or an output past the buffer is a failed
// read, said as what it is.
//   ① THE HUB'S ROAD: a starter handed — read() and listProcs() hand it every program, the process itself starts NONE; the rows parse
//      from the starter's text exactly as from execFile's
//   ② the starter's «no answer», a timeout, an overflow: each a failed read with its own words (the process list says so, never an
//      empty list in silence; the disk reads null)
//   ③ THE DEVICE AGENT'S ROAD: no starter — the process starts them itself (execFile), as before
//   ④ RED CONTROL: a copy without the helper's starter road starts from the process itself, the starter handed or not
//   ⑤ CENSUS: src/sysinfo.js's one execFile is the helper's; every program start is a runProgram call; the hub hands the starter
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { anchored } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { armWatchdog } from './suite-watchdog.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let passed = 0, failed = 0;
const say = console.log.bind(console);
function ok(c, name, detail) { if (typeof c !== 'boolean') throw new TypeError(`ok(): the condition must be a boolean (${typeof c}) — «${name}»`); if (c) { passed++; say(`  ✓ ${name}`); } else { failed++; say(`  ✗ ${name}${detail === undefined ? '' : ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 700)}`); } return c; }
const WD = armWatchdog({ capMs: 30e3 });

// every start the process makes ITSELF is counted: child_process.execFile wrapped BEFORE the module takes its own reference
const CP = require('child_process');
const direct = [];
const ef0 = CP.execFile;
CP.execFile = function (file, ...a) { direct.push(String(file)); return ef0.call(this, file, ...a); };
const SI = require(path.join(ROOT, 'src/sysinfo.js'));
const CS = require(path.join(ROOT, 'src/server/child-starter.js'));   // execFileVia: the starter in execFile's shape (hub-only)
const hand = (st) => SI.useStarter(st ? CS.execFileVia(st) : null);
const SRC = fs.readFileSync(path.join(ROOT, 'src/sysinfo.js'), 'utf8');

const PS_AUX = ['USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND',
  'vs        4242 12.5  9.1 9000000 4800000 ?     Sl   10:00  42:00 node server.js',
  'vs        5151  3.0  2.0 1000000 1048576 ?     Sl   10:01   1:00 /usr/bin/python3 worker.py',
  'vs        6262  0.0  0.1  10000  2048 ?        S    10:02   0:00 sleep 1000', ''].join('\n');
const DF = 'Filesystem     1024-blocks      Used Available Capacity Mounted on\n/dev/sda1        100000000  25000000  75000000      25% /\n';
const PS_AXO = ['vs 4242 1 12.5 9.1 4800000 Sl 01:00:00 node server.js', 'vs 5151 4242 3.0 2.0 1048576 Sl 00:10:00 /usr/bin/python3 worker.py', ''].join('\n');
const TEXT = (cmd, args) => (cmd === 'df' ? DF : cmd === 'ps' && args[0] === 'axo' ? PS_AXO : cmd === 'ps' ? PS_AUX : '');
function fakeStarter(answer = (cmd, args) => ({ started: true, code: 0, stdout: TEXT(cmd, args) })) {
  const calls = [];
  return { calls, run: (cmd, args, o) => { calls.push({ cmd, args: [...args], timeoutMs: o && o.timeoutMs, maxBuffer: o && o.maxBuffer, capture: !!(o && o.capture), envAdd: o && o.envAdd }); return Promise.resolve(answer(cmd, args, o)); } };
}
const warns = [];
const w0 = console.warn;
console.warn = (...a) => { warns.push(a.join(' ')); };

say('① THE HUB\'S ROAD — a starter handed');
WD.section('①');
{
  const st = fakeStarter();
  hand(st);
  direct.length = 0;
  const r = await SI.read(ROOT);
  const lp = await SI.listProcs();
  ok(direct.length === 0, `the process itself starts NO program (${direct.join(', ') || 'none'})`);
  ok(st.calls.some((c) => c.cmd === 'ps' && c.args.join(' ') === 'aux --sort=-rss') && st.calls.some((c) => c.cmd === 'df' && c.args[0] === '-kP') && st.calls.some((c) => c.cmd === 'ps' && c.args[0] === 'axo'),
    `read() and listProcs() hand the starter every program: ${st.calls.map((c) => c.cmd + ' ' + c.args.join(' ')).join(' · ')}`);
  ok(st.calls.every((c) => c.capture && c.timeoutMs === 8000 && Number.isFinite(c.maxBuffer) && c.maxBuffer > 0), 'each ask captures its output, with the read\'s own bound (8 s) and buffer', st.calls);
  ok(Array.isArray(r.procs) && r.procs.length === 3 && r.procs[0].pid === 4242 && r.procs[0].rss === 4800000 * 1024 && /node server\.js/.test(r.procs[0].cmd), 'the process list parses from the starter\'s text as from execFile\'s', r.procs);
  ok(!!r.disk && r.disk.total === 100000000 * 1024 && r.disk.pct === 25, 'the disk too', r.disk);
  const want = SI.parsePsProcs(PS_AXO).length;
  ok(lp.total === want && want === 2 && !lp.error, `the process manager's table: ${lp.total} rows, as parsePsProcs reads the same text (${want})`, lp);
}

say('② A FAILED START IS SAID (never an empty list in silence)');
WD.section('②');
for (const [tag, ans, words] of [['no answer', { unknown: true, why: 'no starter' }, /the starter gave no answer/], ['a timeout', { started: true, timedOut: true, code: null }, /timed out/], ['an overflow', { started: true, overflow: true, code: null }, /its output passed \d+ bytes/]]) {
  hand(fakeStarter(() => ans));
  warns.length = 0; direct.length = 0;
  const r = await SI.read(ROOT);
  const lp = await SI.listProcs();
  ok(direct.length === 0 && r.procs.length === 0 && r.disk === null && warns.some((w) => /topProcs: both ps legs failed/.test(w) && words.test(w)) && typeof lp.error === 'string' && words.test(lp.error),
    `${tag}: the list is empty AND said in its words (${(warns.find((w) => /topProcs/.test(w)) || '').slice(0, 140)}), the disk null, the table's error «${lp.error}»`);
}

say('③ THE DEVICE AGENT\'S ROAD — no starter: the process starts them itself (execFile)');
WD.section('③');
{
  hand(null);
  direct.length = 0;
  const r = await SI.read(ROOT);
  ok(direct.includes('ps') && direct.includes('df') && Array.isArray(r.procs), `with no starter, execFile from this process, as before (${direct.join(', ')})`);
}

say('④ RED CONTROL — a copy without the helper\'s starter road');
WD.section('④');
{
  const ROAD = '  if (_run) return _run(bin, args, { timeout, maxBuffer });\n';
  ok(SRC.split(ROAD).length === 2, 'control setup: the starter road is one line of the helper');
  const M = mutantCopies('sysinfo-starter', ROOT);
  const OLD = require(M.write('src/sysinfo.js', anchored(SRC, ROAD, '  /* MUTANT: no starter road (the release: every start a fork of this process) */\n', 'no-starter-road'), 'no-starter-road'));
  const st = fakeStarter();
  OLD.useStarter(CS.execFileVia(st));
  direct.length = 0;
  await OLD.read(ROOT);
  ok(direct.includes('ps') && st.calls.length === 0, `RED: the starter handed, the copy still starts ${direct.join(', ')} from its own process — the fork the hub paid`);
  for (const r of copiesCensus(M.files, M.dir, ROOT, { minCopies: 1, label: 'B-360d sysinfo ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
}

say('⑤ CENSUS');
WD.section('⑤');
{
  const code = SRC.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  const execs = code.match(/\bexecFile\s*\(/g) || [];
  ok(execs.length === 1 && /function runProgram\(bin, args[\s\S]{0,300}?execFile\(bin, args,/.test(code), `src/sysinfo.js's ONE execFile is the helper's own (${execs.length})`);
  const starts = (code.match(/\brunProgram\('(?:ps|df|sysctl|vm_stat)'/g) || []).length;
  ok(starts === 6, `every program start is a runProgram call: ${starts} (ps aux --sort, ps aux, ps axo, df, sysctl, vm_stat)`);
  const KEEP = fs.readFileSync(path.join(ROOT, 'src/server/desktop-app-keeper.js'), 'utf8');
  ok(KEEP.includes("require('../sysinfo.js').useStarter(require('./child-starter').execFileVia(require('./child-starter').childStarter()));"), 'the hub hands its starter in execFile\'s shape (beside the desktop belt\'s, at the keeper\'s load — before the hub listens)');
  ok(!/_starter\.run|the starter gave no answer/.test(code), 'the starter\'s words live in the hub-only helper (child-starter.js execFileVia): the device agent\'s bundle carries none of them');
  const agentd = ['src/agentd/agentd.js'].map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  ok(!/sysinfo[^\n]{0,40}\.useStarter\(/.test(agentd), 'the device agent hands none (its own small process starts them)');
}
console.warn = w0;
say(`\n${failed ? `${failed} FAILED (${passed} passed)` : `ALL PASS (${passed})`}`);
process.exit(failed ? 1 : 0);

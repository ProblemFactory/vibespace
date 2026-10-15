#!/usr/bin/env node
// test-usage-exit-hook — lane usage-fold-worker-exit-hook (.284): a usage fold worker asleep in a read no longer holds
// the server's exit. process.exit() JOINS every worker thread and one asleep in a read is never joined: with one STUCK
// fold worker the real UsageHistory's exit was still running at 8 s (lane cache-bounds-stuck-worker-race, Node 22 and
// 24) — a server whose ledger storage hangs could not restart by itself. src/server/exit-hook.js judges the fold workers
// at the join (after every 'exit' listener), gives them EXIT_BOUND_MS to leave, then re-raises SIGTERM (SIGKILL failing
// that); usage-index and search-index re-raise through the same door.
//  §1 PURE: who cannot be joined (unjoinable), the thread a constructor added (threadAdded)
//  §2 the mechanics the judge reads: a terminated busy worker leaves /proc/self/task while the main thread is blocked;
//     one asleep in a fifo's open is still listed after the bound
//  §3 the real UsageHistory in a child server (SIGTERM → its flush → process.exit), a fifo-blocked fold stub:
//     STUCK (census row) ⇒ gone within the bound + the line, the stores' exit listeners first;
//     a fold IN FLIGHT asleep in its read (its 10 min deadline far off) ⇒ the same;
//     a fold merely busy ⇒ exit 0, no line (it terminates normally)
//  CONTROLS (scratch copies): the hook's registration cut ⇒ the stuck child still alive at 8 s; a judge that counts
//     every live worker ⇒ the busy fold's exit becomes a re-raise; the judge as an 'exit' listener (the index owners'
//     shape) ⇒ a store's exit listener registered after it never runs
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { armWatchdog } from './suite-watchdog.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const EH = require(path.join(REPO, 'src/server/exit-hook.js'));
const children = [];
armWatchdog({ capMs: 120e3, exit: (code) => { for (const c of children) { try { c.kill('SIGKILL'); } catch { } } process.exit(code); } });
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? ' — ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, what) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(25); } console.log(`  … waited ${ms} ms for ${what}`); return false; };
const tmp = scratch('usage-exit-hook');
fs.mkdirSync(tmp, { recursive: true });
process.on('exit', () => { for (const c of children) { try { c.kill('SIGKILL'); } catch { } } }); // an aborted run leaves no child behind
const BOUND = EH.EXIT_BOUND_MS;
const LINE = /\[usage\] 1 stuck fold worker\(s\) cannot be joined — exiting without them/;

console.log('§1 PURE: who cannot be joined, the thread a constructor added');
{
  const live = [{ tid: '11' }, { tid: '12' }, { tid: null, stuck: true }, { tid: null, stuck: false }, { tid: '13', stuck: true }];
  const u = EH.unjoinable(live, ['12']);
  ok(u.length === 2 && u[0].tid === '12' && u[1].tid === null && u[1].stuck === true,
    'a thread still listed after the bound + a stuck worker /proc never named; a named thread that left (even one declared stuck) and an unnamed worker nobody declared stuck are joinable', u);
  ok(EH.unjoinable([], []).length === 0 && EH.unjoinable([{ tid: '5' }], []).length === 0, 'nothing live / everything left ⇒ nothing to say');
  ok(EH.threadAdded(new Set(['1', '2']), new Set(['1', '2', '3'])) === '3', 'one thread added ⇒ its id');
  ok(EH.threadAdded(new Set(['1']), new Set(['1', '2', '3'])) === null && EH.threadAdded(null, new Set(['1'])) === null && EH.threadAdded(new Set(['1']), new Set(['1'])) === null,
    'two added at the same instant, no /proc, or none added ⇒ unknown (null), never a guess');
  ok(BOUND === 2000, `the bound is the index owners' class: ${BOUND} ms (their closeBoundMs)`);
}

console.log('§2 the mechanics the judge reads: /proc/self/task while the main thread is blocked');
{
  const fifo = path.join(tmp, 'mech.fifo'); execFileSync('mkfifo', [fifo]);
  const before1 = EH.threadsNow();
  const busy = new Worker('let x = 0; for (;;) { x += Math.sqrt(x + 1); }', { eval: true });
  const busyTid = EH.threadAdded(before1);
  const before2 = EH.threadsNow();
  const blocked = new Worker(`require('fs').readFileSync(${JSON.stringify(fifo)})`, { eval: true });
  const blockedTid = EH.threadAdded(before2);
  ok(busyTid && blockedTid && busyTid !== blockedTid, `the diff around each constructor names its thread (${busyTid}, ${blockedTid})`);
  const wchan = (t) => { try { return fs.readFileSync(`/proc/self/task/${t}/wchan`, 'utf8'); } catch (e) { return e.code; } };
  await until(() => wchan(blockedTid) === 'wait_for_partner', 5000, 'the blocked worker to sleep in the fifo open');
  busy.terminate(); blocked.terminate();
  const t0 = performance.now(), leftBusy = EH.threadsLeft([busyTid]), tookBusy = performance.now() - t0; // no await between: no loop turn
  const t1 = performance.now(), leftBlocked = EH.threadsLeft([blockedTid], 300), tookBlocked = performance.now() - t1;
  ok(leftBusy.length === 0 && tookBusy < BOUND / 2, `a terminated busy worker left /proc/self/task in ${Math.round(tookBusy)} ms with the main thread blocked (bound ${BOUND} ms)`);
  ok(leftBlocked.length === 1 && tookBlocked >= 290 && wchan(blockedTid) === 'wait_for_partner', `a terminated worker asleep in the fifo's open is still listed after the bound (${Math.round(tookBlocked)} ms, wchan ${wchan(blockedTid)})`);
  // knock it loose: a NONBLOCK writer open (ENXIO = no reader yet) + one byte (EPIPE = it went first) until its thread leaves —
  // never a blocking open (a woken, terminated reader never reads; lane cache-bounds-stuck-worker-race)
  const gone = await until(() => {
    try { const fd = fs.openSync(fifo, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK); try { fs.writeSync(fd, 'x'); } catch { } fs.closeSync(fd); } catch { }
    return EH.threadsLeft([blockedTid], 0).length === 0;
  }, 5000, 'the knocked worker to leave');
  ok(gone, 'knocked loose: its thread left (the suite\'s own exit joins nothing asleep)');
}

console.log('§3 the real UsageHistory in a child server: SIGTERM with a fold worker asleep in a read');
const uhReal = path.join(REPO, 'src/usage-history.js');
const childFile = path.join(tmp, 'child.cjs');
fs.writeFileSync(childFile, `'use strict';
// a server, as far as the ledger can tell: a UsageHistory with cold months, a fold on a stub worker, server.js's SIGTERM shape
const fs = require('fs'), path = require('path');
const [uhPath, data, stub, mode] = process.argv.slice(2);
const { UsageHistory } = require(uhPath);
const DAY = 86400e3, NOW = Date.now();
const dir = path.join(data, 'usage-history'); fs.mkdirSync(dir, { recursive: true });
const shardOf = (ts) => { const d = new Date(ts); return 'events-' + d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '.ndjson'; };
const by = {};
for (let k = 0; k < 1200; k++) { const ts = NOW - Math.floor((k * 7919 % 1200) / 1200 * 200 * DAY); (by[shardOf(ts)] = by[shardOf(ts)] || []).push(JSON.stringify({ ts, rid: 'req_' + k, mid: 'msg_' + k, sid: 's' + (k % 23), cwd: '/w/p' + (k % 5), model: 'claude-opus-5-5', be: 'claude', i: 100 + k % 900, o: 50, cw5: 1000, cw1: 10, cr: 5000, origin: 'main' })); }
for (const [f, rows] of Object.entries(by)) fs.writeFileSync(path.join(dir, f), rows.join('\\n') + '\\n');
const uh = new UsageHistory({ dataDir: data, homeDir: data });
uh.ledgerWindowMs = 40 * DAY; uh.ledgerHotMaxBytes = 60 * 1024; uh.warm();
uh.coldWorkerFile = stub;
if (mode === 'stuck') { uh.coldFoldDeadlineMs = 300; uh.coldTerminateDeadlineMs = 300; }
process.on('SIGTERM', () => { console.error('FLUSH: the server shutdown'); process.exit(0); }); // server.js: shutdown ends in process.exit
uh.aggregateAsync({ to: NOW - 40 }).then(() => console.log('FOLDED'), (e) => console.log('FOLD ' + e.code));
const t = setInterval(() => {
  const row = uh.cacheCensus().find((x) => x.name === 'usage fold workers stuck');
  if (mode === 'stuck' ? !(row && row.count === 1) : uh._coldWalks !== 1) return;
  clearInterval(t);
  process.on('exit', () => console.error('LATER EXIT LISTENER: a store flush registered after the fold spawned'));
  console.log('READY ' + JSON.stringify({ stuck: row ? row.count : 0, walks: uh._coldWalks }));
}, 20);
setInterval(() => { }, 1000);
`);
const blockedStub = (fifo) => { const f = path.join(tmp, path.basename(fifo) + '-worker.js'); fs.writeFileSync(f, `const fs = require('fs'); const { parentPort } = require('worker_threads'); parentPort.on('message', (m) => { if (m && m.op === 'fold') fs.readFileSync(${JSON.stringify(fifo)}); });`); return f; };
const busyStub = path.join(tmp, 'busy-worker.js');
fs.writeFileSync(busyStub, `const { parentPort } = require('worker_threads'); parentPort.on('message', (m) => { if (m && m.op === 'fold') { let x = 0; for (;;) x += Math.sqrt(x + 1); } });`);
function child(name, uhPath, mode) {
  const data = path.join(tmp, name); fs.mkdirSync(data, { recursive: true });
  let stub = busyStub;
  if (mode !== 'busy') { const fifo = path.join(tmp, name + '.fifo'); execFileSync('mkfifo', [fifo]); stub = blockedStub(fifo); }
  const c = spawn(process.execPath, [childFile, uhPath, data, stub, mode], { stdio: ['ignore', 'pipe', 'pipe'] });
  c.name = name; c.out = ''; c.err = '';
  c.stdout.on('data', (d) => { c.out += d; }); c.stderr.on('data', (d) => { c.err += d; });
  c.done = new Promise((r) => c.on('exit', (code, signal) => r({ code, signal, at: performance.now() })));
  children.push(c);
  return c;
}
const asleep = (c) => { try { return fs.readdirSync(`/proc/${c.pid}/task`).some((t) => { try { return fs.readFileSync(`/proc/${c.pid}/task/${t}/wchan`, 'utf8') === 'wait_for_partner'; } catch { return false; } }); } catch { return false; } };
const M = mutantCopies('usage-exit-hook', REPO);
const uhSrc = fs.readFileSync(uhReal, 'utf8');
const REG = "LIVE.set(w, EH.threadAdded(threads)); EH.atJoin('usage-fold', foldJoinJudge);";
const noHookSrc = uhSrc.replace(REG, 'LIVE.set(w, EH.threadAdded(threads));');
const COUNT = 'const n = EH.unjoinable(live, EH.threadsLeft(live.map((x) => x.tid).filter(Boolean))).length;';
const everySrc = uhSrc.replace(COUNT, 'const n = live.length;');
const ehSrc = fs.readFileSync(path.join(REPO, 'src/server/exit-hook.js'), 'utf8');
const listenerEh = ehSrc.replace('process.reallyExit = function reallyExit(code) {', "process.on('exit', function reallyExit(code) {").replace('return realExit.call(process, code);\n    };', '});');
const listenerSrc = uhSrc.replace("require('./server/exit-hook.js')", `require(${JSON.stringify(M.write('src/server/exit-hook.js', listenerEh, 'listener'))})`);
ok(noHookSrc !== uhSrc && everySrc !== uhSrc && listenerEh !== ehSrc && listenerSrc !== uhSrc, 'the three controls\' edits each hit their anchor (the hook\'s registration, the count, the reallyExit wrap)');
const legs = {
  stuck: child('stuck', uhReal, 'stuck'),
  inflight: child('inflight', uhReal, 'inflight'),
  busy: child('busy', uhReal, 'busy'),
  ctlNoHook: child('ctl-nohook', M.write('src/usage-history.js', noHookSrc, 'nohook'), 'stuck'),
  ctlEvery: child('ctl-every', M.write('src/usage-history.js', everySrc, 'every'), 'busy'),
  ctlListener: child('ctl-listener', M.write('src/usage-history.js', listenerSrc, 'listener'), 'stuck'),
};
const all = Object.values(legs);
const up = await until(() => all.every((c) => /READY/.test(c.out) && (c.name.includes('busy') || c.name.includes('every') || asleep(c))), 20000, 'every child to be READY (a blocked fold asleep in its fifo open)');
ok(up, `six child servers up: ${all.map((c) => c.name + ' ' + ((c.out.match(/READY (.*)/) || [])[1] || c.out.slice(-80) + c.err.slice(-200))).join(' · ')}`);
await sleep(200); // the busy folds are spinning by now
const t = performance.now();
for (const c of all) c.kill('SIGTERM');
const res = Object.fromEntries(await Promise.all(Object.entries(legs).map(async ([k, c]) => [k, await Promise.race([c.done, sleep(8000).then(() => null)])])));
const took = (k) => (res[k] ? Math.round(res[k].at - t) : '>8000');
const order = (c) => { const a = c.err.indexOf('FLUSH'), b = c.err.indexOf('LATER EXIT LISTENER'), l = c.err.search(LINE); return a >= 0 && b > a && l > b; };
{
  const r = res.stuck, c = legs.stuck;
  ok(r && r.signal === 'SIGTERM' && r.at - t < BOUND + 1000 && r.at - t >= BOUND - 100 && LINE.test(c.err),
    `STUCK (the census row counts 1): SIGTERM ⇒ gone in ${took('stuck')} ms — the bound ${BOUND} ms given, then the re-raise (${r && r.signal}), within the bound + 1 s; the line said`, c.err.slice(-400));
  ok(order(c), 'the server\'s flush and a store\'s exit listener registered AFTER the fold spawned ran first, then the line (flush order unchanged)', c.err);
}
{
  const r = res.inflight, c = legs.inflight;
  ok(r && r.signal === 'SIGTERM' && r.at - t < BOUND + 1000 && LINE.test(c.err) && order(c),
    `a fold IN FLIGHT asleep in its read (not stuck yet: its deadline is 10 min off) ⇒ terminated at the join, still listed after the bound ⇒ gone in ${took('inflight')} ms (within the bound + 1 s) with the line`, c.err.slice(-400));
}
{
  const r = res.busy, c = legs.busy;
  ok(r && r.code === 0 && !r.signal && r.at - t < BOUND && !/\[usage\]/.test(c.err),
    `a fold merely busy ⇒ terminated normally: exit ${r && r.code} in ${took('busy')} ms, no line`, c.err.slice(-400));
}
ok(res.ctlNoHook === null && /LATER EXIT LISTENER/.test(legs.ctlNoHook.err) && asleep(legs.ctlNoHook),
  `CONTROL (the hook's registration cut): the same STUCK child is still alive at 8 s — process.exit() joining a fold worker asleep in its read ⇒ RED${res.ctlNoHook ? ' (it exited: ' + JSON.stringify(res.ctlNoHook) + ')' : ''}`);
ok(res.ctlEvery && res.ctlEvery.signal === 'SIGTERM' && LINE.test(legs.ctlEvery.err),
  `CONTROL (a judge that counts every live worker, no bound): the merely busy fold's exit becomes a re-raise (${res.ctlEvery && res.ctlEvery.signal}) ⇒ RED`);
ok(res.ctlListener && res.ctlListener.signal === 'SIGTERM' && !/LATER EXIT LISTENER/.test(legs.ctlListener.err),
  'CONTROL (the judge as an \'exit\' listener — the index owners\' shape): the process ends before a store\'s exit listener registered after it runs ⇒ RED', legs.ctlListener.err.slice(-300));
for (const c of all) { try { c.kill('SIGKILL'); } catch { } }
await Promise.all(all.map((c) => c.done));

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

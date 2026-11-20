#!/usr/bin/env node
// THE HEAVY LOCK'S FRESH LOOK AFTER THE TAKE (the coordinator's r406, 2026-11-20 — lane bl-ci; placed from test-ci-heavy-queue's
// order red at 65ac68d30). scripts/ci.mjs acquireMachineLock decides «head» on a SNAPSHOT (machineQueue: one read of the folder, each
// ticket judged against the `now` of that call) and then takes the lock with an O_EXCL open. A waiter frozen between that look and the
// take — longer than a ticket lives — used to hold a lock an older LIVE ticket was owed: exclusion held, the ORDER broke (served
// H, W2, W1, W3 where the queue owes H, W2, W3, W1). Now the queue is judged FRESH after the take, before the taker's own ticket is
// dropped; a taker that is not the fresh head gives the lock back at once and goes back in line.
// ALSO CURED beside it: machineQueue judged every ticket against ONE `now` taken at the call's start, so a reader frozen right after
// its folder read judged each ticket touched during its freeze «in the future» and REAPED it (a live waiter lost its place). Each ticket
// is judged now against the clock read around its own stat (before: the age, after: the future).
// THE FREEZES ARE PLACED, never hoped for: a copy of ci.mjs stalls a waiter where a file names (while the file exists it sleeps):
//   VS_QUEUE_STALL — right after its head decision, before its take (the take's window);
//   VS_QUEUE_STALL_READ — inside the look, right after the folder read (the look's window).
//   ① THE TAKE'S WINDOW, the cure: W1 decides head while H holds and stalls; W2 reaps W1's ticket and is served; W3, the live head, is
//      stopped for a moment; the lock is FREE when W1's stall lifts — W1 takes, looks again, gives the lock back (said: its ticket was
//      reaped while it was frozen) and is served LAST: H, W2, W3, W1, W1's lock taken once.
//   ② RED CONTROL (the fresh look cut, the same stall): the same scene is served H, W2, W1, W3.
//   ③ THE LOOK'S WINDOW, the cure: W2 waits behind H; W1 comes after it and stalls after its folder read for longer than its staleness;
//      W2's ticket, touched all along, is kept; W1's own silent ticket is stale by W1's own look (the frozen-head rule) — served H, W2, W1.
//   ④ RED CONTROL (the one clock at the call's start, the same stall): W1 reaps W2's live ticket «in the future» and is served first:
//      H, W1, W2.
//   ⑤ the wiring: ONE fresh look in acquireMachineLock, before the drop; heavyGate says a give-back; the two clock reads around the stat.
// Real processes (node children over the copies); each pair of scenes runs side by side, each in its own folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checker } from './lib/check.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';

const { ok, report } = checker();
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), `vs-ciqwin-${process.pid}-`));
let seq = 0;
const scratch = (tag) => { const d = path.join(ROOT, `${tag}-${++seq}`); fs.mkdirSync(d, { recursive: true }); return d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms = 8000, step = 20) => { const t = Date.now() + ms; while (Date.now() < t) { if (pred()) return true; await sleep(step); } return !!pred(); };
const TAG = `ciqwin-${process.pid}`;
const CHILD = path.join(ROOT, 'queue-window-child.mjs');
fs.writeFileSync(CHILD, `import fs from 'node:fs';
const [ciUrl, lock, name, log, hold, waitMs, poll, headPoll, staleMs] = process.argv.slice(2);
const { acquireMachineLock } = await import(ciUrl);
const say = (w) => fs.appendFileSync(log, Date.now() + ' ' + name + ' ' + w + '\\n');
say('waiting');
const h = acquireMachineLock(lock, { waitMs: Number(waitMs), sha: 'lane ' + name, pollMs: Number(poll), headPollMs: Number(headPoll), staleMs: Number(staleMs),
  onWait: (holder, place, free) => say('wait ' + (holder ? holder.pid : '-') + ' ' + place + (free ? ' FREE' : '')),
  onGiveBack: (g) => say('gaveback ' + (g.oursOnDisk ? 'behind ' + g.head : 'reaped') ) });
if (!h.ok) { say(h.timedOut ? 'timedout' : 'error ' + (h.error && h.error.code)); process.exit(3); }
say('got ' + (h.ticket || 'noticket'));
while (hold !== '-' && !fs.existsSync(hold)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
h.release(); say('released');
`);
const kids = [];
const waiter = (ciUrl, lock, name, log, { hold = '-', waitMs = 20000, poll = 3000, headPoll = 200, staleMs = 15000, env = {} } = {}) => {
  const c = spawn(process.execPath, [CHILD, ciUrl, lock, name, log, hold, String(waitMs), String(poll), String(headPoll), String(staleMs), TAG], { stdio: 'ignore', env: { ...process.env, ...env } });
  kids.push(c); return { pid: c.pid, name, child: c };
};
const lines = (log) => { try { return fs.readFileSync(log, 'utf-8').trim().split('\n').filter(Boolean); } catch { return []; } };
const has = (log, name, word) => lines(log).some((l) => l.split(' ')[1] === name && l.split(' ')[2] === word);
const gotOrder = (log) => lines(log).filter((l) => l.split(' ')[2] === 'got').map((l) => l.split(' ')[1]);
const ticketsIn = (lock) => { try { return fs.readdirSync(lock + '.q').filter((n) => !n.startsWith('.')); } catch { return []; } };

// THE COPIES: the freezes placed (each on its own env name) on the tree's code, on the code without the fresh look, on the one clock
const SRC = fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf8');
const stallOn = (env) => `{ const f = process.env.${env}; if (f && fs.existsSync(f)) { try { fs.writeFileSync(f + '.in', String(Date.now())); } catch { } while (fs.existsSync(f)) sleepSync(20); } }`;
const HEAD_LINE = '      const head = !ticket || at === 0;\n';
const READ_LINE = '  try { names = fs.readdirSync(dir).filter((n) => /^\\d{15}-\\d+$/.test(n)).sort(); } catch { return []; }\n';
const planted = (src, tag) => anchored(anchored(src, HEAD_LINE, HEAD_LINE + '      if (head) ' + stallOn('VS_QUEUE_STALL') + '   // PLANTED: the freeze after the head decision, before the take\n', tag + ': the take\'s window'),
  READ_LINE, READ_LINE + '  ' + stallOn('VS_QUEUE_STALL_READ') + '   // PLANTED: the freeze after the folder read\n', tag + ': the look\'s window');
const FRESH = /( {10}fs\.closeSync\(fd\);\n)[ \t]*\/\/ THE FRESH LOOK AFTER THE TAKE[\s\S]*?\n {10}if \(ticket\) \{\n {12}const fresh = machineQueue\(lockPath, \{ staleMs \}\);\n[\s\S]*?\n {10}\}\n( {10}drop\(\);\n)/;
const CLOCKS = /    \/\/ EACH TICKET AGAINST THE CLOCK AROUND ITS OWN STAT[\s\S]*?\n    const before = now \?\? Date\.now\(\);\n(    let seen = 0; try \{ seen = fs\.statSync\(file\)\.mtimeMs; \} catch \{ \}\n)    const after = now \?\? Date\.now\(\);\n    if \(rec && pidStillRunning\(rec\) && before - seen <= staleMs && seen - after <= staleMs\)/;
const ONE_CLOCK = (src) => anchored(anchored(src, 'export function machineQueue(lockPath, { reap = true, staleMs = TICKET_STALE_MS, now = null } = {}) {', 'export function machineQueue(lockPath, { reap = true, staleMs = TICKET_STALE_MS, now = Date.now() } = {}) {', 'one-clock: the call-start now'),
  CLOCKS, '$1    if (rec && pidStillRunning(rec) && Math.abs(now - seen) <= staleMs)', 'one-clock: the judgment');
const M = mutantCopies('queue-window', REPO);
const CURE_URL = pathToFileURL(M.write('scripts/ci.mjs', planted(SRC, 'the cure'), 'the-cure')).href;
const NO_FRESH_URL = pathToFileURL(M.write('scripts/ci.mjs', planted(anchored(SRC, FRESH, '$1$2', 'no-fresh-look'), 'no fresh look'), 'no-fresh-look')).href;
const ONE_CLOCK_URL = pathToFileURL(M.write('scripts/ci.mjs', planted(ONE_CLOCK(SRC), 'one clock'), 'one-clock')).href;

const STALE = 400, POLL = 60, BOUND = 3 * (STALE + POLL);
const W1_STALE = 4 * (2 * BOUND + 300);   // W1 judges W3's moment of rest as life (a stated multiple of the scene's own waits)
/** THE TAKE'S WINDOW over a copy: → { order, gaveback, gotW1, t1gone, freeWhenLifted } */
async function takeScene(ciUrl, label) {
  const d = scratch(label), lock = path.join(d, 'lock'), log = path.join(d, 'log'), stall = path.join(d, 'stall');
  const rel = (n) => path.join(d, 'rel' + n), o = { poll: POLL, headPoll: POLL, staleMs: STALE };
  const r = { label };
  const H = waiter(ciUrl, lock, 'H', log, { ...o, hold: rel('H') });
  await until(() => has(log, 'H', 'got'));
  fs.writeFileSync(stall, 'hold');   // W1's first head decision stalls before its take: the window, placed
  const W1 = waiter(ciUrl, lock, 'W1', log, { ...o, hold: '-', staleMs: W1_STALE, env: { VS_QUEUE_STALL: stall } });
  r.inStall = await until(() => fs.existsSync(stall + '.in'));
  const t1 = ticketsIn(lock).find((n) => n.endsWith('-' + W1.pid));
  const W2 = waiter(ciUrl, lock, 'W2', log, { ...o, hold: rel('W2') }); await until(() => has(log, 'W2', 'wait'));
  const W3 = waiter(ciUrl, lock, 'W3', log, { ...o, hold: rel('W3') }); await until(() => has(log, 'W3', 'wait'));
  r.t1gone = await until(() => !ticketsIn(lock).includes(t1), BOUND);   // W1, stalled, polls nothing: W2 reaps its ticket
  fs.writeFileSync(rel('H'), 'go');
  r.w2 = await until(() => has(log, 'W2', 'got'), BOUND);
  process.kill(W3.pid, 'SIGSTOP');   // W3: the live head of the line, asleep for a moment
  fs.writeFileSync(rel('W2'), 'go'); await until(() => has(log, 'W2', 'released'), BOUND);
  r.freeWhenLifted = !fs.existsSync(lock);
  fs.unlinkSync(stall);              // the freeze lifts: W1 acts on its old look
  await until(() => has(log, 'W1', 'got') || has(log, 'W1', 'gaveback'), BOUND);
  await sleep(200);
  r.gaveback = lines(log).filter((l) => / W1 gaveback /.test(l)).map((l) => l.split(' ').slice(3).join(' '));
  process.kill(W3.pid, 'SIGCONT');
  await until(() => has(log, 'W3', 'got'), BOUND);
  fs.writeFileSync(rel('W3'), 'go');
  await until(() => has(log, 'W1', 'got'), BOUND);
  r.order = gotOrder(log).join(',');
  r.gotW1 = lines(log).filter((l) => / W1 got /.test(l)).length;
  for (const k of [W1, W2, W3, H]) { try { process.kill(k.pid, 'SIGCONT'); } catch { } try { process.kill(k.pid, 'SIGKILL'); } catch { } }
  return r;
}

/** THE LOOK'S WINDOW over a copy: → { order, t2kept, t1kept, frozeMs, settled } */
async function lookScene(ciUrl, label) {
  const d = scratch(label), lock = path.join(d, 'lock'), log = path.join(d, 'log'), stall = path.join(d, 'stall'), relH = path.join(d, 'relH');
  const o = { poll: POLL, headPoll: POLL };
  const r = { label };
  const H = waiter(ciUrl, lock, 'H', log, { ...o, staleMs: STALE, hold: relH });
  await until(() => has(log, 'H', 'got'));
  // W2 judges with a long staleness (it never reaps W1 here: W1's own look decides W1's place), and touches its ticket every POLL
  const W2 = waiter(ciUrl, lock, 'W2', log, { ...o, staleMs: W1_STALE });
  await until(() => has(log, 'W2', 'wait'));
  const t2 = ticketsIn(lock).find((n) => n.endsWith('-' + W2.pid));
  fs.writeFileSync(stall, 'hold');   // W1's first look stalls right after its folder read (it lists W2's ticket and its own)
  const W1 = waiter(ciUrl, lock, 'W1', log, { ...o, staleMs: STALE, env: { VS_QUEUE_STALL_READ: stall } });
  r.inStall = await until(() => fs.existsSync(stall + '.in'));
  const t1 = ticketsIn(lock).find((n) => n.endsWith('-' + W1.pid));
  const inAt = Number(fs.readFileSync(stall + '.in', 'utf8'));
  await until(() => Date.now() - inAt > 2 * (STALE + POLL), 4 * STALE);   // the freeze outlasts W1's staleness by more than W2's poll
  r.frozeMs = Date.now() - inAt;
  fs.unlinkSync(stall);               // the freeze lifts: W1 judges the tickets it listed
  r.settled = await until(() => { const q = ticketsIn(lock); return q.length === 2 && q.some((n) => n.endsWith('-' + W1.pid)) && q.some((n) => n.endsWith('-' + W2.pid)); }, BOUND);
  await sleep(3 * POLL);
  const q = ticketsIn(lock);
  r.t2kept = q.includes(t2); r.t1kept = q.includes(t1);
  fs.writeFileSync(relH, 'go');
  await until(() => has(log, 'W1', 'got') && has(log, 'W2', 'got'), 2 * BOUND);
  r.order = gotOrder(log).join(',');
  for (const k of [W1, W2, H]) { try { process.kill(k.pid, 'SIGKILL'); } catch { } }
  return r;
}

console.log('①② the take\'s window — the freeze placed after the head decision: the cure, and the code without the fresh look beside it');
const [cure, released] = await Promise.all([takeScene(CURE_URL, 'take-cure'), takeScene(NO_FRESH_URL, 'take-no-fresh')]);
ok(cure.inStall && cure.t1gone && cure.w2 && cure.freeWhenLifted, `the scene was made on the cure's copy: W1 stalled in its window (${cure.inStall}), its ticket reaped by W2 (${cure.t1gone}), W2 served, the lock FREE when W1's stall lifted (${cure.freeWhenLifted})`, cure);
ok(cure.order === 'H,W2,W3,W1' && cure.gotW1 === 1 && cure.gaveback.length === 1 && cure.gaveback[0] === 'reaped',
  `① THE CURE: the waiter frozen between its look and its take takes the free lock, looks again, GIVES IT BACK at once (said: «${cure.gaveback.join(' · ')}» — its ticket was reaped while it was frozen) and is served LAST — ${cure.order} (the queue's order: H, W2, W3, W1), W1's lock taken once`, cure);
ok(released.inStall && released.t1gone && released.w2 && released.freeWhenLifted && released.order === 'H,W2,W1,W3' && released.gaveback.length === 0,
  `② RED CONTROL: without the fresh look the same placed freeze is served ${released.order} — the waiter frozen in its window jumps the older live ticket (the order red of 65ac68d30, made at will)`, released);

console.log('③④ the look\'s window — the freeze placed after the folder read: the cure, and the one clock beside it');
const [look, oneClock] = await Promise.all([lookScene(CURE_URL, 'look-cure'), lookScene(ONE_CLOCK_URL, 'look-one-clock')]);
ok(look.inStall && look.settled && look.frozeMs > 2 * (STALE + POLL), `the scene was made on the cure's copy: W1 stalled after its folder read for ${look.frozeMs} ms (> ${2 * (STALE + POLL)} ms: its staleness ${STALE} ms + W2's poll, twice), and the queue settled to two tickets`, look);
ok(look.order === 'H,W2,W1' && look.t2kept && !look.t1kept,
  `③ THE CURE: W2's ticket, touched all through W1's freeze, is KEPT by W1's late look (${look.t2kept}); W1's own silent ticket is stale by its own look and W1 goes back in line — ${look.order}`, look);
ok(oneClock.inStall && oneClock.settled && oneClock.frozeMs > 2 * (STALE + POLL) && oneClock.order === 'H,W1,W2' && !oneClock.t2kept,
  `④ RED CONTROL: with ONE clock read at the look's start the same placed freeze reaps W2's live ticket «in the future» (kept: ${oneClock.t2kept}) and W1 is served first — ${oneClock.order}`, oneClock);

console.log('⑤ the wiring');
{
  const fresh = SRC.match(/\/\/ THE FRESH LOOK AFTER THE TAKE/g) || [];
  const fn = SRC.slice(SRC.indexOf('export function acquireMachineLock('), SRC.indexOf('export function acquireMachineLock(') + 6000);
  const lookAt = fn.indexOf('const fresh = machineQueue(lockPath, { staleMs });'), dropAt = fn.indexOf('drop();', lookAt);
  ok(fresh.length === 1 && lookAt > 0 && dropAt > lookAt && /fresh\[0\]\.name !== ticket\.name/.test(fn) && /cur\.pid === process\.pid\) fs\.unlinkSync\(lockPath\)/.test(fn),
    'ONE fresh look in acquireMachineLock, after the take and BEFORE the taker\'s ticket is dropped: the head is the fresh queue\'s first (oldest live) ticket, and only a record of its own is given back');
  ok(/onGiveBack: \(g\) => console\.log\(`\[ci:heavy\] took the machine lock on a stale look and gave it back at once/.test(SRC), 'heavyGate SAYS a give-back in its log (onGiveBack), beside its wait line');
  const mq = SRC.slice(SRC.indexOf('export function machineQueue('), SRC.indexOf('function takeTicket('));
  ok(/now = null \} = \{\}\) \{/.test(mq) && !/Math\.abs\(now - seen\)/.test(mq) && mq.indexOf('const before = now ?? Date.now();') > 0 && mq.indexOf('const before = now ?? Date.now();') < mq.indexOf('fs.statSync(file)') && mq.indexOf('fs.statSync(file)') < mq.indexOf('const after = now ?? Date.now();'),
    'machineQueue judges each ticket against the clock read around ITS OWN stat (before it: the age; after it: the future) — no clock taken at the call\'s start');
}
for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 3, label: '⑤ ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
for (const k of kids) { try { process.kill(k.pid, 'SIGKILL'); } catch { } }
try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
report();

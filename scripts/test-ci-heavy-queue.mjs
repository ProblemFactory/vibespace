#!/usr/bin/env node
// THE FAIR QUEUE (lane ci-heavy-queue, 2026-11-10). The machine's heavy lock is one O_EXCL file; with nothing else the fastest poller wins
// every hand-off (a private claimer at 50 ms held the box 45 min while the train's 53 suites waited). ci.mjs's waiters now queue: ONE
// ticket each in `<lock>.q/`, the OLDEST LIVE ticket may try, the head polls at 200 ms, dead / recycled tickets are reaped, the winner's
// ticket goes, the lock record names it, a wait line names the holder's cmd UNCUT and a holder that took no ticket. Real processes.
//   §1 oldest first — three waiters served in ticket order; a 10-ms poller that came LATER never tries while an older ticket lives.
//   §2 reaping — a SIGKILLed waiter's ticket, a ticket whose pid now runs something else, a ticket timed in the FUTURE; a LIVE older
//      ticket is waited for; a FROZEN head (SIGSTOP) loses its turn and, woken just after the release, is served LAST (H, W2, W3, W1:
//      ticket time, not pid; no free try); the waiter behind it says the lock is FREE. Timed waits: 3× the worst case by construction.
//   §3 the winner — its ticket gone, the lock record names it; a timed-out waiter leaves no ticket.
//   §4 the edges — no usable queue directory: the waiter tries as before the queue; a lock path it cannot open: «run unlocked».
//   §5 the wait line — pid, cmd, sha / label uncut, suites, «WITHOUT a ticket», the place; heavyGate prints it.
//   §6 ONE DOOR — no script under scripts/ or data/bin but ci.mjs names the machine lock (planted controls).
//   §7 NEGATIVE CONTROLS — the queue check removed (the late 10-ms poller wins); the reaper removed (a dead ticket blocks the line).
//   §8 THE BUILD STAMP — a claim does not rebuild a tree built at its commit (a real `npm run build` in a scratch repo): the stamp holds
//      the bytes the build read and its tree's top level — an edit hidden by skip-worktree / assume-unchanged, an ignored new file under
//      src/ and a copy nested in an ignored directory each build; a red build writes no verdict marker (settleHeavyMarker, driven).
//   §9 nothing left behind.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { acquireMachineLock, machineQueue, ticketDirOf, lockWaitLine, runBuild, buildStampWhy, buildStampPathOf, BUILD_OUTPUTS, settleHeavyMarker } from './ci.mjs';
import { spawnSync } from 'node:child_process';
import { REPO, ok, report } from './ci-gate-kit.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { gitEnvFrom } from './git-env.mjs';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), `vs-ciqueue-${process.pid}-`));   // EVERY scratch path of this run lives here (§8)
let seq = 0;
const scratch = (tag) => { const d = path.join(ROOT, `${tag}-${++seq}`); fs.mkdirSync(d, { recursive: true }); return d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms = 8000, step = 20) => { const t = Date.now() + ms; while (Date.now() < t) { if (pred()) return true; await sleep(step); } return !!pred(); };
const CI_URL = pathToFileURL(path.join(REPO, 'scripts', 'ci.mjs')).href;
const TAG = `ciqueue-${process.pid}`;   // in every child's argv (§8 counts them)
const CHILD = path.join(ROOT, 'queue-child.mjs');
fs.writeFileSync(CHILD, `import fs from 'node:fs';
const [ciUrl, lock, name, log, hold, waitMs, poll, headPoll, staleMs] = process.argv.slice(2);
const { acquireMachineLock } = await import(ciUrl);
const say = (w) => fs.appendFileSync(log, Date.now() + ' ' + name + ' ' + w + '\\n');
say('waiting');
const h = acquireMachineLock(lock, { waitMs: Number(waitMs), sha: 'lane ' + name, pollMs: Number(poll), headPollMs: Number(headPoll), staleMs: Number(staleMs),
  onWait: (holder, place, free) => say('wait ' + (holder ? holder.pid : '-') + ' ' + place + (free ? ' FREE' : '')) });
if (!h.ok) { say(h.timedOut ? 'timedout' : 'error ' + (h.error && h.error.code)); process.exit(3); }
say('got ' + (h.ticket || 'noticket'));
while (hold !== '-' && !fs.existsSync(hold)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
h.release(); say('released');
`);
const kids = [];
/** a waiter: { pid, name } — it logs waiting / wait … / got <ticket> / released / timedout into `log`; it holds until `hold` exists ('-' = not at all) */
const waiter = (ciUrl, lock, name, log, { hold = '-', waitMs = 20000, poll = 3000, headPoll = 200, staleMs = 15000 } = {}) => {
  const c = spawn(process.execPath, [CHILD, ciUrl, lock, name, log, hold, String(waitMs), String(poll), String(headPoll), String(staleMs), TAG], { stdio: 'ignore' });
  kids.push(c); return { pid: c.pid, name, child: c };
};
const lines = (log) => { try { return fs.readFileSync(log, 'utf-8').trim().split('\n').filter(Boolean); } catch { return []; } };
const has = (log, name, word) => lines(log).some((l) => l.split(' ')[1] === name && l.split(' ')[2] === word);
const gotOrder = (log) => lines(log).filter((l) => l.split(' ')[2] === 'got').map((l) => l.split(' ')[1]);
const tickets = (lock) => { try { return fs.readdirSync(ticketDirOf(lock)).filter((n) => !n.startsWith('.')); } catch { return []; } };
const exited = (c) => c.exitCode !== null || c.signalCode !== null;

// one scenario, parameterised by the ci.mjs it runs (the real one, or a mutant copy): H holds; W1 queues; a 10-ms poller W3 queues LATER;
// H releases. Under the queue W3 does not take the lock while W1's older ticket lives.
async function lateSniper(ciUrl) {
  const d = scratch('sniper'), lock = path.join(d, 'lock'), log = path.join(d, 'log'), relH = path.join(d, 'relH'), relW = path.join(d, 'relW');
  const H = waiter(ciUrl, lock, 'H', log, { hold: relH });
  await until(() => has(log, 'H', 'got'));
  const W1 = waiter(ciUrl, lock, 'W1', log, { hold: relW, poll: 60000, headPoll: 60000 });   // asleep for the whole leg once it has waited
  await until(() => has(log, 'W1', 'wait'));
  const W3 = waiter(ciUrl, lock, 'W3', log, { hold: relW, poll: 10, headPoll: 10 });
  await until(() => has(log, 'W3', 'wait'));
  fs.writeFileSync(relH, 'go');
  await until(() => has(log, 'H', 'released'));
  await until(() => has(log, 'W3', 'got'), 600);   // an absence window ≥ 3× the mutant's positive (10–200 ms)
  const w3won = has(log, 'W3', 'got');
  for (const k of [W1, W3, H]) { try { process.kill(k.pid, 'SIGKILL'); } catch { } }
  return { w3won, log };
}

// the frozen head: H holds; W1 (the head) and W2 queue; W1 is SIGSTOPped; H releases. Alive-and-polling ⇒ W2 is served within the bound.
// THE FROZEN HEAD, one scenario (主开发's verifier, round 3): H holds; W1 (the head — and the LOWEST pid), W2, W3 queue. W1 is frozen
// (SIGSTOP) and H releases ⇒ W2 must take the lock (W1 loses its turn). Then W3 is paused for a moment, W2 releases, and W1 is woken
// while the lock is FREE and W3 (alive, older ticket) is ahead ⇒ W1 must NOT take it: it rejoins at the BACK. Served H, W2, W3, W1 —
// by ticket TIME (not pid: W1's is the lowest) and never a free try. Timed waits are 3× the worst case by construction (staleness +
// one poll); a pass returns as soon as the event happens.
const STALE = 400, POLL = 60, BOUND = 3 * (STALE + POLL);
// W3'S PAUSE IS BOUNDED BY THE SCENE ITSELF (B-9ff2 step 3's follow-up, the coordinator's r234 — the 2.369.414 readers' UTC red: under
// 180 suites side by side W3's untouched ticket passed W1's old 4 s and W1 reaped it as a frozen head, the queue's own rule): W3 is
// stopped across W2's release (≤ BOUND), W1's rejoin (≤ BOUND) and the free-try sleep (SLEEP_W). W1's staleness is DERIVED from that
// sum — a stated multiple, so an edit of a bound moves it too — never a bare number.
// …and W3's OWN staleness is derived the same way (主开发 r5094, the r3209 retally's unit B — 3 UTC reds at the current file, «H,W2,W1,W3»):
// at the scene's STALE (400 ms) its own pause (≥ SLEEP_W + W2's release + W1's rejoin; 404 ms in the reds) passed its own life, and a W3
// frozen between its ticket's touch and its queue read woke to read ITS OWN ticket stale, reap it and go back in line behind W1 — the
// queue's own rule (a frozen head loses its turn), applied to the scene's live head. W2 keeps STALE: it must reap the frozen W1
const SLEEP_W = 300, PAUSE_MAX = 2 * BOUND + SLEEP_W, W1_STALE = 4 * PAUSE_MAX, W3_STALE = 4 * PAUSE_MAX;
async function frozenHead(ciUrl) {
  const d = scratch('frozen'), lock = path.join(d, 'lock'), log = path.join(d, 'log');
  const rel = (n) => path.join(d, 'rel' + n), o = { poll: POLL, headPoll: POLL, staleMs: STALE };
  const H = waiter(ciUrl, lock, 'H', log, { ...o, hold: rel('H') });
  await until(() => has(log, 'H', 'got'));
  const W1 = waiter(ciUrl, lock, 'W1', log, { ...o, hold: '-', staleMs: W1_STALE }); await until(() => has(log, 'W1', 'wait'));   // (W1 judges W3's pause as life: W1_STALE, derived above)
  const W2 = waiter(ciUrl, lock, 'W2', log, { ...o, hold: rel('W2') }); await until(() => has(log, 'W2', 'wait'));
  const W3 = waiter(ciUrl, lock, 'W3', log, { ...o, hold: rel('W3'), staleMs: W3_STALE }); await until(() => has(log, 'W3', 'wait'));   // (W3's own pause is life: W3_STALE, derived above)
  const t1 = tickets(lock).find((n) => n.endsWith('-' + W1.pid));
  const r = { pidsRise: W1.pid < W2.pid && W2.pid < W3.pid };
  process.kill(W1.pid, 'SIGSTOP');
  fs.writeFileSync(rel('H'), 'go'); const freed = Date.now();
  r.served = await until(() => has(log, 'W2', 'got'), BOUND);
  r.after = Date.now() - freed; r.t1gone = !!t1 && !tickets(lock).includes(t1);
  if (r.served) {
    process.kill(W3.pid, 'SIGSTOP'); const stopAt = Date.now();   // W3 stays the live head of the line, but asleep for a moment — MEASURED
    fs.writeFileSync(rel('W2'), 'go'); await until(() => has(log, 'W2', 'released'), BOUND);
    process.kill(W1.pid, 'SIGCONT');   // the lock is FREE, W3 (older ticket) is ahead: W1 must not take it
    r.rejoined = await until(() => tickets(lock).some((n) => n.endsWith('-' + W1.pid) && n !== t1), BOUND);
    await sleep(SLEEP_W);
    r.noFreeTry = !has(log, 'W1', 'got') && !fs.existsSync(lock);
    // the tickets W1 judged, each with its age (its mtime is its last poll) — printed by the leg
    r.judged = tickets(lock).map((n) => { let age = '?'; try { age = Date.now() - fs.statSync(path.join(ticketDirOf(lock), n)).mtimeMs; } catch { } const who = n.endsWith('-' + W1.pid) ? 'W1' : n.endsWith('-' + W3.pid) ? 'W3' : '?'; return `${who} ${n} age ${typeof age === 'number' ? Math.round(age) + ' ms' : age}`; });
    // THE PLACEMENT (r5094): W3 judged by the queue's OWN function at a wake PAST the old staleness (a placed clock — `now`, the function's
    // own parameter — never a sleep), without reaping: at STALE its own ticket is dropped (the reds' road), at W3_STALE it lives
    const wakeAt = Math.max(Date.now(), stopAt + STALE + POLL), w3In = (staleMs) => machineQueue(lock, { reap: false, staleMs, now: wakeAt }).some((t) => t.name.endsWith('-' + W3.pid));
    r.placedOld = w3In(STALE); r.placedNew = w3In(W3_STALE); r.placedAt = wakeAt - stopAt;
    process.kill(W3.pid, 'SIGCONT'); r.paused = Date.now() - stopAt; await until(() => has(log, 'W3', 'got'), BOUND);
    fs.writeFileSync(rel('W3'), 'go'); await until(() => has(log, 'W1', 'got'), BOUND);
    r.order = gotOrder(log).join(',');
    r.once = lines(log).filter((l) => / W1 got /.test(l)).length === 1;
    const waits = lines(log).filter((l) => / W[13] wait /.test(l));
    r.freeSaid = waits.some((l) => / W[13] wait - .* FREE$/.test(l)) && !waits.some((l) => / W[13] wait - /.test(l) && !/ FREE$/.test(l));
  } else { try { process.kill(W1.pid, 'SIGCONT'); } catch { } }
  for (const k of [W1, W2, W3, H]) { try { process.kill(k.pid, 'SIGCONT'); } catch { } try { process.kill(k.pid, 'SIGKILL'); } catch { } }
  return r;
}

console.log('§1 oldest first');
{ const d = scratch('fifo'), lock = path.join(d, 'lock'), log = path.join(d, 'log'), relH = path.join(d, 'relH');
  const H = waiter(CI_URL, lock, 'H', log, { hold: relH });
  ok(await until(() => has(log, 'H', 'got')), 'the first comer takes the lock at once (a lone waiter is the head of its own queue)');
  const W = [];
  for (const [i, poll] of [[1, 150], [2, 150], [3, 10]]) {   // W3 polls at 10 ms — the private claimer's speed — and comes LAST
    W.push(waiter(CI_URL, lock, `W${i}`, log, { poll, headPoll: poll === 10 ? 10 : 200 }));
    await until(() => has(log, `W${i}`, 'wait'));
  }
  ok(tickets(lock).length === 3, `three waiters, three tickets (${tickets(lock).length})`);
  fs.writeFileSync(relH, 'go');
  await until(() => gotOrder(log).length === 4, 15000);
  ok(JSON.stringify(gotOrder(log)) === JSON.stringify(['H', 'W1', 'W2', 'W3']), `served in ticket order, the 10-ms poller last (${gotOrder(log).join(' → ')})`);
  await until(() => W.every((w) => exited(w.child)) && exited(H.child));
  ok(tickets(lock).length === 0 && !fs.existsSync(lock), 'every ticket and the lock are gone when the line has run'); }
{ const r = await lateSniper(CI_URL);
  ok(!r.w3won, 'a 10-ms poller that queued AFTER a sleeping head does not take the freed lock (it is not the head; §7 is its control)'); }

console.log('§2 reaping');
{ const d = scratch('reap'), lock = path.join(d, 'lock'), log = path.join(d, 'log'), relH = path.join(d, 'relH');
  const H = waiter(CI_URL, lock, 'H', log, { hold: relH });
  await until(() => has(log, 'H', 'got'));
  const W1 = waiter(CI_URL, lock, 'W1', log, { poll: 200 });
  await until(() => has(log, 'W1', 'wait'));
  const W2 = waiter(CI_URL, lock, 'W2', log, { poll: 200 });
  await until(() => has(log, 'W2', 'wait'));
  const t1 = tickets(lock).find((n) => n.endsWith('-' + W1.pid));
  process.kill(W1.pid, 'SIGKILL'); await until(() => exited(W1.child));
  ok(!!t1 && tickets(lock).includes(t1), 'a SIGKILLed waiter leaves its ticket (no exit hook runs)');
  fs.writeFileSync(relH, 'go');
  ok(await until(() => has(log, 'W2', 'got'), 5000) && !tickets(lock).includes(t1), `…the next waiter REAPS it and is served (${gotOrder(log).join(' → ')})`);
  await until(() => exited(W2.child) && exited(H.child)); }
{ const d = scratch('recycled'), lock = path.join(d, 'lock'), log = path.join(d, 'log');
  fs.mkdirSync(ticketDirOf(lock));
  const fake = `${String(Date.now() - 60000).padStart(15, '0')}-${process.pid}`;   // OUR pid, alive — but it runs no queued command
  fs.writeFileSync(path.join(ticketDirOf(lock), fake), JSON.stringify({ pid: process.pid, cmd: 'a-command-this-pid-does-not-run', startedAt: Date.now() - 60000 }));
  const W = waiter(CI_URL, lock, 'W', log, { poll: 200 });
  ok(await until(() => has(log, 'W', 'got'), 5000) && !tickets(lock).includes(fake), 'a ticket whose pid now runs something else (a recycled pid) is reaped — the waiter behind it is served');
  await until(() => exited(W.child)); }
{ const d = scratch('older'), lock = path.join(d, 'lock'), log = path.join(d, 'log');
  const holder = spawn('sleep', ['30'], { stdio: 'ignore' }); kids.push(holder);   // (sleep sums its arguments: a tag word would make it exit at once)
  fs.mkdirSync(ticketDirOf(lock));
  const live = `${String(Date.now() - 60000).padStart(15, '0')}-${holder.pid}`;
  fs.writeFileSync(path.join(ticketDirOf(lock), live), JSON.stringify({ pid: holder.pid, cmd: 'sleep', startedAt: Date.now() - 60000 }));
  const W = waiter(CI_URL, lock, 'W', log, { poll: 200 });
  await until(() => has(log, 'W', 'wait'));
  await sleep(500);
  ok(!has(log, 'W', 'got') && !fs.existsSync(lock), 'a LIVE older ticket is waited for — the free lock is not taken past it');
  holder.kill('SIGKILL'); await until(() => exited(holder));
  ok(await until(() => has(log, 'W', 'got'), 5000), '…and once its process is gone, the waiter is served');
  await until(() => exited(W.child)); }

{ const r = await frozenHead(CI_URL);
  ok(r.served && r.t1gone, `a FROZEN head (SIGSTOP) loses its turn: the next waiter takes the freed lock (${r.after} ms after the release; staleness ${STALE} ms + a ${POLL}-ms poll, asserted within ${BOUND} ms) and the frozen head's ticket is reaped`);
  // THE BOX'S HOLD IS SAID BY NAME (r234): a pause past the scene's own bound is the box, never «a wrong order»
  if (r.paused > W1_STALE) ok(false, `…the box held W3 for ${r.paused} ms, past the scene's own bound (W1's staleness ${W1_STALE} ms = 4 × the scene's longest pause ${PAUSE_MAX} ms) — the order (${r.order}) is not judged; tickets judged: ${(r.judged || []).join(' · ')}`);
  else ok(r.pidsRise && r.rejoined && r.noFreeTry && r.order === 'H,W2,W3,W1' && r.once, `…woken while the lock is FREE and W3 (older ticket, alive) is ahead, it takes NOTHING and rejoins at the BACK: served H, W2, W3, W1 (${r.order}) — by ticket time, not by pid (W1's is the lowest), never a free try, ONCE · W3 paused ${r.paused} ms (W1's staleness ${W1_STALE} ms, derived: 4 × ${PAUSE_MAX}) · tickets judged: ${(r.judged || []).join(' · ')}`);
  ok(r.freeSaid, '…and a waiter behind the frozen head says the lock is FREE and it waits for the waiter ahead — never «a holder whose record cannot be read»');
  if (r.served) ok(r.placedOld === false && (r.placedAt > W3_STALE || r.placedNew === true), `PLACED (r5094): W3 judged by the queue's own function ${r.placedAt} ms after it was stopped — at the scene's old STALE (${STALE} ms) its own ticket is DEAD (the reds' «H,W2,W1,W3»: a W3 frozen between its touch and its queue read goes back in line), at its derived ${W3_STALE} ms it lives (in the queue at the old: ${r.placedOld}; at the derived: ${r.placedAt > W3_STALE ? `NOT JUDGED — the box held W3 ${r.placedAt} ms, past the derived ${W3_STALE} ms itself` : r.placedNew})`); }
{ const d = scratch('future'), lock = path.join(d, 'lock'), log = path.join(d, 'log');
  const holder = spawn('sleep', ['30'], { stdio: 'ignore' }); kids.push(holder);
  fs.mkdirSync(ticketDirOf(lock));
  const fut = `${String(Date.now() - 60000).padStart(15, '0')}-${holder.pid}`, ff = path.join(ticketDirOf(lock), fut);
  fs.writeFileSync(ff, JSON.stringify({ pid: holder.pid, cmd: 'sleep', startedAt: Date.now() - 60000 }));
  const later = Date.now() / 1000 + 3600; fs.utimesSync(ff, later, later);   // a LIVE process whose ticket time lies an hour ahead
  const W = waiter(CI_URL, lock, 'W', log, { poll: POLL, headPoll: POLL, staleMs: STALE });
  ok(await until(() => has(log, 'W', 'got'), BOUND) && !tickets(lock).includes(fut), 'a ticket whose time lies in the FUTURE (+1 h) is no sign of life: it is reaped and the waiter behind it is served');
  holder.kill('SIGKILL'); await until(() => exited(W.child) && exited(holder)); }

console.log('§3 the winner, and a timeout');
{ const d = scratch('winner'), lock = path.join(d, 'lock'), log = path.join(d, 'log'), rel = path.join(d, 'rel');
  const W = waiter(CI_URL, lock, 'W', log, { hold: rel });
  await until(() => has(log, 'W', 'got'));
  const rec = JSON.parse(fs.readFileSync(lock, 'utf-8')), got = lines(log).find((l) => / W got /.test(l)).split(' ')[3];
  ok(rec.ticket === got && /^\d{15}-\d+$/.test(got) && tickets(lock).length === 0, `the holder's record names its ticket (${rec.ticket}) and the ticket is gone from the queue`);
  ok(rec.cmd === 'queue-child.mjs' && rec.pid === W.pid, `…the record's cmd is the holder's own script name, which pidStillRunning finds in its cmdline (${rec.cmd})`);
  const T = waiter(CI_URL, lock, 'T', log, { waitMs: 300, poll: 100 });
  ok(await until(() => has(log, 'T', 'timedout'), 5000) && tickets(lock).length === 0, 'a waiter that times out leaves no ticket behind');
  fs.writeFileSync(rel, 'go'); await until(() => exited(W.child) && exited(T.child)); }

console.log('§4 the edges');
{ const d = scratch('noqueue'), lock = path.join(d, 'lock'), log = path.join(d, 'log');
  fs.writeFileSync(ticketDirOf(lock), 'a file where the queue directory would be');
  const W = waiter(CI_URL, lock, 'W', log);
  ok(await until(() => has(log, 'W', 'got')) && lines(log).some((l) => / W got noticket$/.test(l)), 'no usable queue directory: the waiter takes the lock as it did before the queue (no ticket)');
  await until(() => exited(W.child)); }
{ const d = scratch('readonly'), lock = path.join(d, 'ro', 'lock');
  fs.mkdirSync(path.dirname(lock)); fs.chmodSync(path.dirname(lock), 0o555);
  const r = acquireMachineLock(lock, { waitMs: 0, sha: 'x' });
  fs.chmodSync(path.dirname(lock), 0o755);
  ok(!r.ok && r.error && r.error.code === 'EACCES', `a lock path it cannot open: {ok:false, error} — the gate runs UNLOCKED and says so, as before (${r.error && r.error.code})`); }

console.log('§5 the wait line');
{ const h = { pid: 4242, cmd: 'claimer.mjs', sha: 'lane some-lane 0123abcd9', suite: 'test-a,test-b' };
  const line = lockWaitLine('/tmp/L', h, 900000, 'place 2 of 3 in the queue');
  ok(line.includes('pid 4242') && line.includes('cmd claimer.mjs') && line.includes('sha lane some-lane 0123abcd9') && line.includes('suite test-a,test-b'),
    `the holder's pid, cmd, sha / label UNCUT and suites (${line.slice(0, 150)}…)`);
  ok(/WITHOUT a ticket/.test(line) && /place 2 of 3 in the queue/.test(line) && /waiting up to 15 min/.test(line), '…a holder that took no ticket is said to have gone around the queue; our place is said');
  ok(!/WITHOUT a ticket/.test(lockWaitLine('/tmp/L', { ...h, ticket: '000001794287000-4242' }, 900000, '')), '…a holder that came through the queue is not');
  const SRC = fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf-8');
  const fl = lockWaitLine('/tmp/L', null, 900000, 'place 2 of 3 in the queue', true);
  ok(/is FREE — waiting for the waiter ahead of us in the queue \(place 2 of 3 in the queue\)/.test(fl) && !/cannot be read/.test(fl), `a FREE lock with a waiter ahead is said as such (${fl.slice(0, 120)}…)`);
  ok(/onWait: \(h, place, free\) => console\.log\(lockWaitLine\(lockPath, h, waitMs, place, free\)\)/.test(SRC) && (SRC.match(/acquireMachineLock\(/g) || []).length === 2,
    'WIRING: heavyGate prints lockWaitLine for every new holder; acquireMachineLock has ONE caller'); }

console.log('§6 ONE DOOR — the lock is taken only by ci.mjs');
const LOCK_NAME = ['vibespace', 'ci', 'heavy-'].join('-');   // built, so this file's own text names no lock
const ALLOWED = { 'scripts/test-ci-gate-tiers.mjs': 'reads the default path\'s NAME (TMPDIR, per uid) — never opens it' };
const doorFindings = (rel, text) => {
  if (rel === 'scripts/ci.mjs' || ALLOWED[rel]) return [];
  const f = [];
  if (text.includes(LOCK_NAME)) f.push('names the machine lock file');
  if (/\bdefaultLockPath\s*\(/.test(text)) f.push('calls the default-path helper');
  return f;
};
{ const files = [];
  const walk = (dir) => { for (const e of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) { const rel = path.join(dir, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'fixtures') walk(rel); } else if (e.isFile()) files.push(rel); } };
  walk('scripts'); walk(path.join('data', 'bin'));
  const found = files.flatMap((rel) => { let t = ''; try { t = fs.readFileSync(path.join(REPO, rel), 'utf-8'); } catch { } return doorFindings(rel, t).map((w) => `${rel}: ${w}`); });
  ok(files.length > 100 && found.length === 0, `no script under scripts/ or data/bin but ci.mjs opens the machine lock (${files.length} files${found.length ? ' — ' + found.join(' | ') : ''})`);
  ok(doorFindings('scripts/x-claim.mjs', `fs.openSync('/tmp/${LOCK_NAME}1000.lock', 'wx')`).length === 1 && doorFindings('data/bin/y', 'const p = default' + 'LockPath();').length === 1
    && doorFindings('scripts/z.mjs', 'spawn(node, [ci, "--heavy", "--only=x"])').length === 0,
    'PLANTED: a private claimer that opens the lock by name, or through the default-path helper, is found; a script that runs ci.mjs is not'); }

console.log('§7 NEGATIVE CONTROLS');
const M = mutantCopies('ci-heavy-queue', REPO);
const SRC = fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf-8');
{ const HEAD_LINE = '      const head = !ticket || at === 0;\n';
  ok(SRC.split(HEAD_LINE).length === 2, 'the queue check is ONE line (the mutant makes every waiter the head)');
  // the queue checks a taker TWICE since r406 (bl-ci): the head decision before the take, and the fresh look after it (a taker that is
  // not the fresh head gives the lock back) — the control cuts both, or the fresh look alone would keep the order
  const FRESH = /( {10}takeLock\(lockPath, [^\n]*\n)[ \t]*\/\/ THE FRESH LOOK AFTER THE TAKE[\s\S]*?\n {10}if \(ticket\) \{\n {12}const fresh = machineQueue\(lockPath, \{ staleMs \}\);\n[\s\S]*?\n {10}\}\n( {10}drop\(\);\n)/;
  ok(FRESH.test(SRC) && SRC.match(new RegExp(FRESH.source, 'g')).length === 1, 'the fresh look after the take is ONE block (the mutant cuts it with the head decision)');
  const r = await lateSniper(pathToFileURL(M.write('scripts/ci.mjs', SRC.replace(HEAD_LINE, '      const head = true;\n').replace(FRESH, '$1$2'), 'noqueue')).href);
  ok(r.w3won, 'CONTROL: without the queue checks (the head decision AND the fresh look after the take) the late 10-ms poller TAKES the freed lock — §1\'s leg is the one that reds'); }
{ const REAP = '    if (rec && pidStillRunning(rec) && before - seen <= staleMs && seen - after <= staleMs) { out.push({ name, file, rec }); continue; }   // alive AND polling (a time in the future is no sign of life either)\n';
  ok(SRC.split(REAP).length === 2, 'the liveness test of a ticket is ONE line (the mutant keeps every ticket)');
  const url = pathToFileURL(M.write('scripts/ci.mjs', SRC.replace(REAP, '    if (rec) { out.push({ name, file, rec }); continue; }\n'), 'noreap')).href;
  const d = scratch('mut-reap'), lock = path.join(d, 'lock'), log = path.join(d, 'log');
  fs.mkdirSync(ticketDirOf(lock));
  fs.writeFileSync(path.join(ticketDirOf(lock), `${String(Date.now() - 60000).padStart(15, '0')}-999999`), JSON.stringify({ pid: 999999, cmd: 'gone', startedAt: 1 }));
  const W = waiter(url, lock, 'W', log, { poll: 100 });
  await until(() => has(log, 'W', 'wait'));   // the absence window starts once the waiter is in the line (round 3)
  const served = await until(() => has(log, 'W', 'got'), 600);
  try { process.kill(W.pid, 'SIGKILL'); } catch { }
  ok(!served, 'CONTROL: without the reaper a dead ticket blocks the line for good — §2\'s legs are the ones that red'); }
{ const LIVE = '    if (rec && pidStillRunning(rec) && before - seen <= staleMs && seen - after <= staleMs) { out.push({ name, file, rec }); continue; }   // alive AND polling (a time in the future is no sign of life either)\n';
  ok(SRC.split(LIVE).length === 2, 'the alive-AND-polling test of a ticket is ONE line (the mutant asks only «alive»)');
  const r = await frozenHead(pathToFileURL(M.write('scripts/ci.mjs', SRC.replace(LIVE, '    if (rec && pidStillRunning(rec)) { out.push({ name, file, rec }); continue; }\n'), 'nolife')).href);
  ok(!r.served, `CONTROL: without the polling test a frozen head blocks the free lock for everyone (the next waiter not served in ${BOUND} ms) — §2's leg is the one that reds`); }
for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 3, label: '§7 ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));

console.log('§8 THE BUILD STAMP');
// A GATE SUITE CLAIMS NO MACHINE-GLOBAL NAME (主开发 08:53Z, batch 42's point): npm, run by §8's builds, keeps a compile cache — the
// builds get their OWN under this run's root (it goes with the root), never the machine's TMPDIR/node-compile-cache, which another
// node or npm on the machine may be using while this suite runs.
const BUILD_ENV = { ...gitEnvFrom(process.env), NODE_COMPILE_CACHE: path.join(ROOT, 'node-compile-cache') };
{ const R = scratch('stamp'), g = (...a) => spawnSync('git', ['-C', R, ...a], { encoding: 'utf-8' });
  g('init', '-q', '-b', 'main'); g('config', 'user.email', 'q@test.local'); g('config', 'user.name', 'queue test');
  fs.writeFileSync(path.join(R, 'build.cjs'), `const fs=require('fs'),path=require('path');if(fs.existsSync(${JSON.stringify(path.join(R, '..', 'fail-' + TAG))}))process.exit(1);   // (ci.mjs runs the build with its own fixed env)
const skip=fs.existsSync(${JSON.stringify(path.join(R, '..', 'absent-' + TAG))})?${JSON.stringify(BUILD_OUTPUTS[BUILD_OUTPUTS.length - 1])}:null;   // B-88e5: a build that leaves one output out (the unsigned build's manifest)
for(const f of ${JSON.stringify(BUILD_OUTPUTS)}){if(f===skip){fs.rmSync(f,{force:true});continue;}fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,'built '+f+'\\n');}
if(fs.existsSync(${JSON.stringify(path.join(R, '..', 'move-' + TAG))}))require('child_process').execFileSync('git',['-C',${JSON.stringify(R)},'commit','-q','--allow-empty','-m','moved during the build']);   // B-88e5: the tree moves under the build
fs.appendFileSync(${JSON.stringify(path.join(R, '..', 'builds-' + TAG))},'1\\n');`);
  fs.writeFileSync(path.join(R, 'package.json'), JSON.stringify({ name: 'q', version: '1.0.0', private: true, scripts: { build: 'node build.cjs' } }));
  fs.writeFileSync(path.join(R, '.gitignore'), ['node_modules', 'src/*.gen.js', 'copies/', ...BUILD_OUTPUTS].join('\n') + '\n');
  fs.mkdirSync(path.join(R, 'src'), { recursive: true }); fs.writeFileSync(path.join(R, 'src', 'a.js'), 'export const V = 3;\n');
  fs.mkdirSync(path.join(R, 'node_modules')); fs.writeFileSync(path.join(R, 'node_modules', '.package-lock.json'), '{"lockfileVersion":3}\n');
  g('add', '-A'); g('commit', '-q', '-m', 'one');
  const builds = () => { try { return fs.readFileSync(path.join(R, '..', 'builds-' + TAG), 'utf-8').trim().split('\n').length; } catch { return 0; } };
  const quiet = { log: () => { }, env: BUILD_ENV }, readJsonQ = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf-8')); } catch { return null; } };
  const b1 = runBuild({ cwd: R, reuse: true, ...quiet });
  ok(b1.ok && builds() === 1 && fs.existsSync(buildStampPathOf(R)) && g('status', '--porcelain').stdout === '', `a first claim builds and leaves a stamp in the tree's own git dir — the work tree stays clean (${buildStampPathOf(R).replace(R, '<repo>')})`);
  const b2 = runBuild({ cwd: R, reuse: true, ...quiet });
  ok(b2.ok && b2.reused && builds() === 1 && buildStampWhy(R) === null, 'a second claim on the same built tree does NOT rebuild (the stamp matches commit, tree, node, dependencies and every output)');
  const b0 = runBuild({ cwd: R, ...quiet });
  ok(b0.ok && !b0.reused && builds() === 2, '…a caller that does not ask to reuse (the fast gate) still builds');
  // B-88e5 (its adversarial read): a build NOT asked to reuse writes no stamp (the fast gate, an --isolate claim) …
  { const sp = buildStampPathOf(R), keepSt = fs.readFileSync(sp); fs.unlinkSync(sp);
    const bn = runBuild({ cwd: R, ...quiet });
    ok(bn.ok && !fs.existsSync(sp), '…and writes NO stamp (only an in-place claim that asks reuse ever writes one)'); fs.writeFileSync(sp, keepSt); }
  // … a tree that MOVES under the build (a commit in the worktree during it) gets no stamp: the next claim builds again …
  { const flag = path.join(R, '..', 'move-' + TAG); fs.writeFileSync(flag, ''); fs.rmSync(buildStampPathOf(R), { force: true });   // no stamp: this claim builds
    const headBefore = g('rev-parse', 'HEAD').stdout.trim(), bm = runBuild({ cwd: R, reuse: true, ...quiet }); fs.unlinkSync(flag);
    const moved = g('rev-parse', 'HEAD').stdout.trim() !== headBefore, w = buildStampWhy(R);
    ok(bm.ok && moved && !fs.existsSync(buildStampPathOf(R)) && w === 'no build stamp', `a commit made DURING the build leaves no stamp — the bundle was built from the commit before it (${w})`);
    runBuild({ cwd: R, reuse: true, ...quiet }); }
  // … and a build that leaves one output OUT (the unsigned build removes the agentd manifest) is still reused, its absence stamped
  { const flag = path.join(R, '..', 'absent-' + TAG); fs.writeFileSync(flag, ''); fs.rmSync(buildStampPathOf(R), { force: true });   // no stamp: this claim builds
    const n0 = builds(), ba = runBuild({ cwd: R, reuse: true, ...quiet });   // the stamp above names every output: this one builds and stamps the absence
    const n1 = builds(), bb = runBuild({ cwd: R, reuse: true, ...quiet }); fs.unlinkSync(flag);
    const absentNow = !fs.existsSync(path.join(R, BUILD_OUTPUTS[BUILD_OUTPUTS.length - 1]));
    ok(ba.ok && bb.ok && bb.reused && builds() === n1 && absentNow && (readJsonQ(buildStampPathOf(R)) || {}).outputs && readJsonQ(buildStampPathOf(R)).outputs[BUILD_OUTPUTS[BUILD_OUTPUTS.length - 1]] === null,
      `a build that leaves ${BUILD_OUTPUTS[BUILD_OUTPUTS.length - 1]} out stamps it ABSENT, and the next claim reuses the tree (${n0}→${n1}→${builds()} builds)`);
    runBuild({ cwd: R, reuse: true, ...quiet }); }
  const why = (label, mutate, restore) => { mutate(); const w = buildStampWhy(R); restore(); return `${label}: ${w}`; };
  const r1 = why('dirty', () => fs.writeFileSync(path.join(R, 'package.json'), fs.readFileSync(path.join(R, 'package.json'), 'utf-8') + '\n'), () => g('checkout', '-q', '--', 'package.json'));
  const r2 = why('untracked', () => fs.writeFileSync(path.join(R, 'stray.js'), 'x'), () => fs.unlinkSync(path.join(R, 'stray.js')));
  const out0 = path.join(R, BUILD_OUTPUTS[0]), keep = fs.readFileSync(out0);
  const r3 = why('output', () => fs.writeFileSync(out0, 'edited'), () => fs.writeFileSync(out0, keep));
  const lock = path.join(R, 'node_modules', '.package-lock.json'), keepL = fs.readFileSync(lock);
  const r4 = why('deps', () => fs.writeFileSync(lock, '{"lockfileVersion":3,"x":1}\n'), () => fs.writeFileSync(lock, keepL));
  const r5 = why('gone', () => fs.unlinkSync(out0), () => fs.writeFileSync(out0, keep));
  ok(/not clean/.test(r1) && /not clean/.test(r2) && /is not the one the stamp built/.test(r3) && /deps/.test(r4) && /is not the one the stamp built/.test(r5) && buildStampWhy(R) === null,
    `anything else builds — a dirty tree, an untracked file, an edited or missing output, other dependencies (${[r1, r2, r3, r4, r5].join(' · ')})`);
  fs.writeFileSync(path.join(R, 'two.txt'), '2\n'); g('add', 'two.txt'); g('commit', '-q', '-m', 'two');
  ok(/the stamp's head/.test(String(buildStampWhy(R))), `another commit builds (${buildStampWhy(R)})`);
  const flag = path.join(R, '..', 'fail-' + TAG); fs.writeFileSync(flag, '1');
  const bf = runBuild({ cwd: R, reuse: true, ...quiet });
  fs.unlinkSync(flag);
  ok(!bf.ok && !fs.existsSync(buildStampPathOf(R)), 'a build that FAILS leaves no stamp (the next claim builds again)');
  // git status is BLIND to these three (主开发's verifier, round 1): the stamp's input digest is not
  const fresh = runBuild({ cwd: R, reuse: true, ...quiet });   // a stamp for the new commit first
  const aJs = path.join(R, 'src', 'a.js'), keepA = fs.readFileSync(aJs);
  const hidden = (flag) => { g('update-index', flag, 'src/a.js'); fs.writeFileSync(aJs, 'export const V = 4;\n'); const st = g('status', '--porcelain').stdout; const w = buildStampWhy(R);
    fs.writeFileSync(aJs, keepA); g('update-index', flag.replace('--', '--no-'), 'src/a.js'); return { st, w }; };
  const sw = hidden('--skip-worktree'), au = hidden('--assume-unchanged');
  ok(fresh.ok && sw.st === '' && /inputs/.test(String(sw.w)) && au.st === '' && /inputs/.test(String(au.w)) && buildStampWhy(R) === null,
    `an edit HIDDEN from git status (skip-worktree, assume-unchanged: status clean) builds — the stamp holds the bytes the build read (${sw.w} · ${au.w})`);
  const gen = path.join(R, 'src', 'x.gen.js'); fs.writeFileSync(gen, 'export const G = 1;\n');
  const ig = { st: g('status', '--porcelain').stdout, w: buildStampWhy(R) }; fs.unlinkSync(gen);
  ok(ig.st === '' && /inputs/.test(String(ig.w)) && buildStampWhy(R) === null, `a git-IGNORED new file under src/ builds (${ig.w})`);
  const C = path.join(R, 'copies', 'c'); fs.mkdirSync(C, { recursive: true });
  for (const f of ['build.cjs', 'package.json', '.gitignore', 'src']) fs.cpSync(path.join(R, f), path.join(C, f), { recursive: true });
  fs.symlinkSync(path.join(R, 'node_modules'), path.join(C, 'node_modules'));
  for (const f of BUILD_OUTPUTS) { fs.mkdirSync(path.dirname(path.join(C, f)), { recursive: true }); fs.copyFileSync(path.join(R, f), path.join(C, f)); }
  const cw = buildStampWhy(C);
  ok(/not the top level of its own git tree/.test(String(cw)), `a copy nested in an ignored directory of a built repo builds — it would read the PARENT's git dir and stamp (${cw})`);
  fs.rmSync(path.join(R, 'copies'), { recursive: true, force: true });
  const SRC8 = fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf-8');
  ok(/noteChildResult\(runBuild\(\{ cwd: runRoot, reuse: !isolate \}\)\)/.test(SRC8), 'WIRING: the heavy gate asks reuse only for an IN-PLACE tree; an --isolate checkout is fresh (no stamp asked, nothing hashed)');
  // a tree WITHOUT a stamp is answered without reading its inputs (the .389 mirror: the hash ran before the stamp check, in every
  // isolated run, and a SIGTERM landing in it waited for the hash and the build — test-ci-heavy-launch's supersede leg red ×2)
  const Rn = scratch('nostamp'); spawnSync('git', ['-C', Rn, 'init', '-q']); fs.writeFileSync(path.join(Rn, 'a.txt'), 'a\n');
  const realRead = fs.readFileSync; let reads = 0;
  fs.readFileSync = function (f, ...a) { if (String(f).startsWith(Rn)) reads++; return realRead.call(this, f, ...a); };
  let wn; try { wn = buildStampWhy(Rn); } finally { fs.readFileSync = realRead; }
  ok(wn === 'no build stamp' && reads === 0, `a tree with NO stamp is answered without reading one of its files (${wn}; ${reads} reads)`);
  // A RED BUILD WRITES NO VERDICT — driven, not read: the gate's own last step with a failing build and a scratch marker dir
  const S = 'c'.repeat(40), rec = { sha: S, result: 'red', failed: ['npm run build'], startedAt: 1, endedAt: 2, scope: 'full' };
  const md = scratch('settle'), red = settleHeavyMarker({ dir: md, sha: S, rec, buildOk: false });
  const md2 = scratch('settle-ok'), okd = settleHeavyMarker({ dir: md2, sha: S, rec: { ...rec, result: 'green', failed: [] }, buildOk: true });
  ok(/the BUILD failed/.test(red.noVerdict) && red.file === null && fs.readdirSync(md).join() === `${S}.skipped` && JSON.parse(fs.readFileSync(path.join(md, `${S}.skipped`), 'utf-8')).result === 'skipped', `A RED BUILD WRITES NO VERDICT: the gate's last step with a failing build writes no green or red — only its <sha>.skipped trace with the reason (B-88e5) («${red.noVerdict}»)`);
  ok(okd.file && fs.existsSync(okd.file) && fs.readdirSync(md2).includes(`${S}.green`), '…CONTROL: the same step with a green build writes its marker');
  ok(/settleHeavyMarker\(\{ dir, sha, rec, abandonedWhy, buildOk: build\.ok, dirtyAtStart,/.test(SRC8), 'WIRING: the heavy gate hands its build result to that step'); }

console.log('§9 nothing left behind');
for (const k of kids) { try { k.kill('SIGKILL'); } catch { } }
await until(() => kids.every(exited), 3000);
fs.rmSync(ROOT, { recursive: true, force: true });
const leftovers = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith(`vs-ciqueue-${process.pid}-`));
const children = fs.readdirSync('/proc').filter((p) => /^\d+$/.test(p)).filter((p) => { try { return fs.readFileSync(`/proc/${p}/cmdline`, 'utf-8').includes(TAG); } catch { return false; } });
ok(leftovers.length === 0 && children.length === 0, `0 scratch dirs and 0 children left under TMPDIR (${leftovers.length} dirs, ${children.length} processes)`);
{ const OWN = fs.readFileSync(new URL(import.meta.url), 'utf-8'), calls = OWN.match(/runBuild\(\{[^}]*\}\)/g) || [];
  ok(/const quiet = \{ log: \(\) => \{ \}, env: BUILD_ENV \}/.test(OWN) && /NODE_COMPILE_CACHE: path\.join\(ROOT, 'node-compile-cache'\)/.test(OWN) && calls.length >= 8 && calls.every((c) => c.includes('...quiet')),
    `WIRING: every §8 build hands BUILD_ENV — its compile cache under this run's root, never the machine's TMPDIR/node-compile-cache (${calls.length} runBuild calls)`); }
report();

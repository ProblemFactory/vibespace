#!/usr/bin/env node
// THE HEAVY LOCK'S WINDOWS, EACH ONE PLACED (the coordinator's r406 + r518, 2026-11-20 — lane bl-ci; placed from test-ci-heavy-queue's
// order red at 65ac68d30). scripts/ci.mjs acquireMachineLock decides «head» on a look at the queue, then takes the lock; since r406 it
// judges the queue FRESH after the take (a taker that is not the head gives the lock back at once and goes back in line), machineQueue
// judges each ticket by the clock around ITS OWN stat, and since r518 the lock is taken in ONE step (written aside, hard-linked in: it
// never exists empty) and a give-back judges the deadline before the next turn; since r571 the steal of a DEAD holder's lock is undone
// when the moved file is not the record judged dead.
// THE FREEZES ARE PLACED, never hoped for: a copy of ci.mjs stalls a waiter where an env names a file (it writes <file>.in on entry —
// each scene waits on that and SAYS the stall was reached; while the file exists it sleeps):
//   VS_QUEUE_STALL      right after the head decision, before the take (the take's window);
//   VS_QUEUE_STALL_READ right after the folder read, inside the look (the look's window);
//   VS_QUEUE_STALL_LOCK right after the lock's creation (on the old two-step copy: between the create and the write);
//   VS_QUEUE_STALL_STEAL right after a head judged the holder dead, before its steal (the steal's window).
// THE STALENESS DECIDES NOTHING (r518 point 1): every waiter keeps the queue's own 15 s, so a live waiter descheduled on a loaded runner
// is never reaped; a reap a scene needs is PLACED (the test removes the ticket, as the reaper does). The one staleness a scene needs to
// be outlived — W1's in the look's window, the very fault — is 2 s against a placed freeze of 2.5 s, and W2's ticket is touched at the lift.
//   ①② THE TAKE'S WINDOW, the taker's ticket reaped while it was frozen: the cure gives back and is served last (H, W2, W3, W1);
//       RED CONTROL without the fresh look: H, W2, W1, W3.
//   ③④ THE TAKE'S WINDOW, an older LIVE ticket ahead and the taker's own still on disk (a ticket that landed after the look): the cure
//       gives back «behind» it and is served with the SAME ticket once it leaves; RED CONTROL: served while the older ticket lives.
//   ⑤⑥ THE DEADLINE AT A GIVE-BACK: a waiter that gives back past its deadline times out BY NAME; RED CONTROL (the check cut): it
//       sleeps, finds the line empty and takes the lock past its deadline.
//   ⑦⑧ THE LOOK'S WINDOW: the cure keeps W2's live ticket (H, W2, W1); RED CONTROL, one clock at the look's start: it reaps W2's
//       ticket «in the future» and W1 is served first (H, W1, W2).
//   ⑨⑩ THE TAKE IN ONE STEP: a waiter that ignores the queue (as a ci.mjs before it) reads the lock while the taker is held right
//       after its creation: the cure shows it a LIVE holder (it waits — one holder); RED CONTROL, the old create-then-write: it reads
//       an EMPTY lock, judges the holder dead, removes the live holder's lock — two holders at once.
//   ⑪⑫ THE STEAL'S WINDOW (r571): W1 judges a dead holder's lock and is held before its act; meanwhile X steals that lock and takes it.
//       The cure moves the lock aside, finds X's record (not the one judged), links it back: X's lock survives and W1 waits on X;
//       RED CONTROL, today's unlink: W1 removes X's live lock and takes it — two holders at once.
//   ⑬ the wiring + the copies census. An exit guard ends every child by its own handle (r518 point 2).
// Real processes (node children over the copies); all scenes run side by side, each in its own folder, none near the box's real lock.
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
const kids = [];
// THE EXIT GUARD (r518 point 2): a scene that throws leaves no child behind — each is ended by its OWN handle (never a bare pid)
const endAll = () => { for (const k of kids) { try { k.child.kill('SIGKILL'); } catch { } } };
process.on('exit', () => { endAll(); try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
for (const [sig, n] of [['SIGINT', 2], ['SIGTERM', 15]]) process.once(sig, () => { endAll(); process.exit(128 + n); });
let seq = 0;
const scratch = (tag) => { const d = path.join(ROOT, `${tag}-${++seq}`); fs.mkdirSync(d, { recursive: true }); return d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms = 10000, step = 20) => { const t = Date.now() + ms; while (Date.now() < t) { if (pred()) return true; await sleep(step); } return !!pred(); };
const TAG = `ciqwin-${process.pid}`;
const CHILD = path.join(ROOT, 'queue-window-child.mjs');
fs.writeFileSync(CHILD, `import fs from 'node:fs';
const [ciUrl, lock, name, log, hold, waitMs, poll, headPoll, staleMs] = process.argv.slice(2);
const { acquireMachineLock } = await import(ciUrl);
const say = (w) => fs.appendFileSync(log, Date.now() + ' ' + name + ' ' + w + '\\n');
say('waiting');
const h = acquireMachineLock(lock, { waitMs: Number(waitMs), sha: 'lane ' + name, pollMs: Number(poll), headPollMs: Number(headPoll), staleMs: Number(staleMs),
  onWait: (holder, place, free) => say('wait ' + (holder ? holder.pid : '-') + ' ' + place + (free ? ' FREE' : '')),
  onGiveBack: (g) => say('gaveback ' + (g.oursOnDisk ? 'behind ' + g.head : 'reaped')) });
if (!h.ok) { say(h.timedOut ? 'timedout' + (h.gaveBack ? ' gaveback' : '') : 'error ' + (h.error && h.error.code)); process.exit(3); }
say('got ' + (h.ticket || 'noticket'));
while (hold !== '-' && !fs.existsSync(hold)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
h.release(); say('released');
`);
const POLL = 60, GEN = 15000, BOUND = 8000;   // GEN = the queue's own TICKET_STALE_MS: no live waiter is reaped by load
const waiter = (ciUrl, lock, name, log, { hold = '-', waitMs = 30000, poll = POLL, headPoll = POLL, staleMs = GEN, env = {} } = {}) => {
  const child = spawn(process.execPath, [CHILD, ciUrl, lock, name, log, hold, String(waitMs), String(poll), String(headPoll), String(staleMs), TAG], { stdio: 'ignore', env: { ...process.env, ...env } });
  const k = { pid: child.pid, name, child }; kids.push(k); return k;
};
const lines = (log) => { try { return fs.readFileSync(log, 'utf-8').trim().split('\n').filter(Boolean); } catch { return []; } };
const has = (log, name, word) => lines(log).some((l) => l.split(' ')[1] === name && l.split(' ')[2] === word);
const said = (log, name, word) => lines(log).filter((l) => l.split(' ')[1] === name && l.split(' ')[2] === word).map((l) => l.split(' ').slice(3).join(' '));
const atOf = (log, name, word) => { const l = lines(log).find((x) => x.split(' ')[1] === name && x.split(' ')[2] === word); return l ? Number(l.split(' ')[0]) : null; };
const gotOrder = (log) => lines(log).filter((l) => l.split(' ')[2] === 'got').map((l) => l.split(' ')[1]);
const qdir = (lock) => lock + '.q';
const ticketsIn = (lock) => { try { return fs.readdirSync(qdir(lock)).filter((n) => !n.startsWith('.')); } catch { return []; } };
const ticketOf = (lock, k) => ticketsIn(lock).find((n) => n.endsWith('-' + k.pid));
const reached = async (stall, label, where) => { const yes = await until(() => fs.existsSync(stall + '.in')); console.log(`  · ${label}: the placed stall ${where} — ${yes ? 'REACHED' : 'NOT reached'}`); return yes; };
/** a LIVE ticket older than `than`, put in the folder the way takeTicket does (aside, renamed in): the test process is its live owner */
const plantOlder = (lock, than) => {
  const name = `${String(Number(than.split('-')[0]) - 1).padStart(15, '0')}-${process.pid}`, tmp = path.join(qdir(lock), `.${name}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify({ pid: process.pid, cmd: path.basename(process.argv[1]), sha: 'a ticket that landed after the look', startedAt: Date.now() }) + '\n', { flag: 'wx' });
  fs.renameSync(tmp, path.join(qdir(lock), name));
  return name;
};
const end = (...ks) => { for (const k of ks) { try { k.child.kill('SIGCONT'); } catch { } try { k.child.kill('SIGKILL'); } catch { } } };

// THE COPIES: the stalls planted (each on its own env name) over the tree's code and over each control
const SRC = fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf8');
const stallOn = (env) => `{ const f = process.env.${env}; if (f && fs.existsSync(f)) { try { fs.writeFileSync(f + '.in', String(Date.now())); } catch { } while (fs.existsSync(f)) sleepSync(20); } }`;
const HEAD_LINE = '      const head = !ticket || at === 0;\n';
const READ_LINE = '  try { names = fs.readdirSync(dir).filter((n) => /^\\d{15}-\\d+$/.test(n)).sort(); } catch { return []; }\n';
const TAKE_CALL = "          takeLock(lockPath, JSON.stringify({ pid: process.pid, sha, root: repo, cmd: LOCK_CMD, ticket: ticket ? ticket.name : null, startedAt: Date.now() }) + '\\n');   // ONE step: never an empty lock (r518)\n";
const TWO_STEPS = "          const fd = fs.openSync(lockPath, 'wx');\n          " + stallOn('VS_QUEUE_STALL_LOCK') + "   // PLANTED: between the create and the write\n"
  + "          fs.writeSync(fd, JSON.stringify({ pid: process.pid, sha, root: repo, cmd: LOCK_CMD, ticket: ticket ? ticket.name : null, startedAt: Date.now() }) + '\\n');\n          fs.closeSync(fd);\n";
const DEAD_LINE = '        const dead = !pidStillRunning(holder);\n';
const STEAL_LINE = '        if (dead) { if (stealDead(lockPath, holder)) continue; holder = readJson(lockPath); }   // a steal that was wrong is undone (r571)\n';
const UNLINK_STEAL = '        if (dead) { try { fs.unlinkSync(lockPath); continue; } catch { } }   // today\'s steal: check, then act\n';
const DEADLINE = '              if (Date.now() >= deadline) return { ok: false, timedOut: true, gaveBack: true, holder: readJson(lockPath) };\n';
const FRESH = /( {10}takeLock\(lockPath, [^\n]*\n)[ \t]*\/\/ THE FRESH LOOK AFTER THE TAKE[\s\S]*?\n {10}if \(ticket\) \{\n {12}const fresh = machineQueue\(lockPath, \{ staleMs \}\);\n[\s\S]*?\n {10}\}\n( {10}drop\(\);\n)/;
const CLOCKS = /    \/\/ EACH TICKET AGAINST THE CLOCK AROUND ITS OWN STAT[\s\S]*?\n    const before = now \?\? Date\.now\(\);\n(    let seen = 0; try \{ seen = fs\.statSync\(file\)\.mtimeMs; \} catch \{ \}\n)    const after = now \?\? Date\.now\(\);\n    if \(rec && pidStillRunning\(rec\) && before - seen <= staleMs && seen - after <= staleMs\)/;
const planted = (src, tag, { lock = true } = {}) => {
  let s = anchored(src, HEAD_LINE, HEAD_LINE + '      if (head) ' + stallOn('VS_QUEUE_STALL') + '   // PLANTED: after the head decision, before the take\n', tag + ': the take\'s window');
  s = anchored(s, READ_LINE, READ_LINE + '  ' + stallOn('VS_QUEUE_STALL_READ') + '   // PLANTED: after the folder read\n', tag + ': the look\'s window');
  s = anchored(s, DEAD_LINE, DEAD_LINE + '        if (dead) ' + stallOn('VS_QUEUE_STALL_STEAL') + '   // PLANTED: between the judgment and the steal\n', tag + ': the steal\'s window');
  return lock ? anchored(s, TAKE_CALL, TAKE_CALL + '          ' + stallOn('VS_QUEUE_STALL_LOCK') + '   // PLANTED: right after the lock\'s creation\n', tag + ': the lock\'s creation') : s;
};
const noFresh = (src) => anchored(src, FRESH, '$1$2', 'no fresh look');
const oneClock = (src) => anchored(anchored(src, 'export function machineQueue(lockPath, { reap = true, staleMs = TICKET_STALE_MS, now = null } = {}) {', 'export function machineQueue(lockPath, { reap = true, staleMs = TICKET_STALE_MS, now = Date.now() } = {}) {', 'one clock: the call-start now'),
  CLOCKS, '$1    if (rec && pidStillRunning(rec) && Math.abs(now - seen) <= staleMs)', 'one clock: the judgment');
const M = mutantCopies('queue-window', REPO);
const copy = (text, tag) => pathToFileURL(M.write('scripts/ci.mjs', text, tag)).href;
const CURE = copy(planted(SRC, 'the cure'), 'the-cure');
const NO_FRESH = copy(planted(noFresh(SRC), 'no fresh look'), 'no-fresh-look');
const NO_DEADLINE = copy(planted(anchored(SRC, DEADLINE, '', 'no deadline at the give-back'), 'no deadline'), 'no-deadline');
const ONE_CLOCK = copy(planted(oneClock(SRC), 'one clock'), 'one-clock');
const TWO_STEP = copy(planted(anchored(SRC, TAKE_CALL, TWO_STEPS, 'two steps'), 'two steps', { lock: false }), 'two-steps');
const UNLINK = copy(planted(anchored(SRC, STEAL_LINE, UNLINK_STEAL, 'today\'s steal'), 'today\'s steal'), 'unlink-steal');
const BLIND = copy(anchored(noFresh(SRC), HEAD_LINE, '      const head = true;\n', 'blind to the queue'), 'blind-reader');   // a waiter that ignores the queue

/** ①② the take's window, the taker's ticket reaped while it was frozen */
async function takeReaped(url, label) {
  const d = scratch(label), lock = path.join(d, 'lock'), log = path.join(d, 'log'), stall = path.join(d, 'stall'), rel = (n) => path.join(d, 'rel' + n);
  const r = { label };
  const H = waiter(url, lock, 'H', log, { hold: rel('H') });
  await until(() => has(log, 'H', 'got'));
  fs.writeFileSync(stall, 'hold');
  const W1 = waiter(url, lock, 'W1', log, { env: { VS_QUEUE_STALL: stall } });
  r.inStall = await reached(stall, label, 'after W1\'s head decision');
  const t1 = ticketOf(lock, W1);
  const W2 = waiter(url, lock, 'W2', log, { hold: rel('W2') }); await until(() => has(log, 'W2', 'wait'));
  const W3 = waiter(url, lock, 'W3', log, { hold: rel('W3') }); await until(() => has(log, 'W3', 'wait'));
  try { fs.unlinkSync(path.join(qdir(lock), t1)); } catch { }   // THE REAP, PLACED: as machineQueue's reaper removes a silent ticket
  r.t1gone = !!t1 && !ticketsIn(lock).includes(t1);
  fs.writeFileSync(rel('H'), 'go');
  r.w2 = await until(() => has(log, 'W2', 'got'), BOUND);
  W3.child.kill('SIGSTOP');   // W3, the live head of the line, asleep for a moment (its ticket stays live: 15 s)
  fs.writeFileSync(rel('W2'), 'go'); await until(() => has(log, 'W2', 'released'), BOUND);
  r.freeWhenLifted = !fs.existsSync(lock);
  fs.unlinkSync(stall);
  await until(() => has(log, 'W1', 'got') || has(log, 'W1', 'gaveback'), BOUND);
  await sleep(200);
  r.gaveback = said(log, 'W1', 'gaveback');
  W3.child.kill('SIGCONT');
  await until(() => has(log, 'W3', 'got'), BOUND);
  fs.writeFileSync(rel('W3'), 'go');
  await until(() => has(log, 'W1', 'got'), BOUND);
  r.order = gotOrder(log).join(','); r.gotW1 = said(log, 'W1', 'got').length;
  end(W1, W2, W3, H);
  return r;
}

/** ③④ the take's window, an older LIVE ticket ahead, the taker's own still on disk */
async function takeBehind(url, label) {
  const d = scratch(label), lock = path.join(d, 'lock'), log = path.join(d, 'log'), stall = path.join(d, 'stall');
  const r = { label };
  fs.writeFileSync(stall, 'hold');
  const W1 = waiter(url, lock, 'W1', log, { env: { VS_QUEUE_STALL: stall } });
  r.inStall = await reached(stall, label, 'after W1\'s head decision (the lock free)');
  const t1 = ticketOf(lock, W1);
  r.t0 = t1 ? plantOlder(lock, t1) : null;   // an older live ticket lands after W1's look (its owner's rename came late)
  fs.unlinkSync(stall);
  await until(() => has(log, 'W1', 'got') || has(log, 'W1', 'gaveback'), BOUND);
  await sleep(200);
  r.gaveback = said(log, 'W1', 'gaveback');
  r.servedWhileOlder = has(log, 'W1', 'got') && ticketsIn(lock).includes(r.t0);
  r.ownOnDisk = ticketsIn(lock).includes(t1);
  try { fs.unlinkSync(path.join(qdir(lock), r.t0)); } catch { }   // the older waiter leaves
  await until(() => has(log, 'W1', 'got'), BOUND);
  r.gotTicket = said(log, 'W1', 'got')[0] || null; r.t1 = t1;
  end(W1);
  return r;
}

/** ⑤⑥ the deadline at a give-back */
async function deadlineScene(url, label) {
  const d = scratch(label), lock = path.join(d, 'lock'), log = path.join(d, 'log'), stall = path.join(d, 'stall');
  const WAIT = 1500, r = { label };
  fs.writeFileSync(stall, 'hold');
  // its sleep after a give-back is 2 s (headPoll): the line ahead empties inside it, so only the deadline's check can stop a late take
  const W1 = waiter(url, lock, 'W1', log, { waitMs: WAIT, headPoll: 2000, env: { VS_QUEUE_STALL: stall } });
  r.inStall = await reached(stall, label, 'after W1\'s head decision (the lock free)');
  const t1 = ticketOf(lock, W1), t0 = t1 ? plantOlder(lock, t1) : null;
  const from = atOf(log, 'W1', 'waiting') || Date.now();
  await until(() => Date.now() > from + WAIT + 300, WAIT + 2000);   // the stall outlives W1's deadline
  r.pastDeadline = Date.now() - from > WAIT;
  fs.unlinkSync(stall);
  r.gave = await until(() => has(log, 'W1', 'gaveback'), BOUND);
  try { fs.unlinkSync(path.join(qdir(lock), t0)); } catch { }       // the line ahead empties while W1 sleeps
  await until(() => has(log, 'W1', 'timedout') || has(log, 'W1', 'got'), BOUND);
  r.timedout = said(log, 'W1', 'timedout'); r.got = has(log, 'W1', 'got');
  r.gotLateMs = r.got ? atOf(log, 'W1', 'got') - from : null;
  end(W1);
  return r;
}

/** ⑦⑧ the look's window */
const LOOK_STALE = 2000, LOOK_FREEZE = LOOK_STALE + 500;
async function lookScene(url, label) {
  const d = scratch(label), lock = path.join(d, 'lock'), log = path.join(d, 'log'), stall = path.join(d, 'stall'), relH = path.join(d, 'relH');
  const r = { label };
  const H = waiter(url, lock, 'H', log, { hold: relH });
  await until(() => has(log, 'H', 'got'));
  const W2 = waiter(url, lock, 'W2', log);
  await until(() => has(log, 'W2', 'wait'));
  const t2 = ticketOf(lock, W2);
  fs.writeFileSync(stall, 'hold');   // W1 comes after W2; its first look stalls right after its folder read (it lists both tickets)
  const W1 = waiter(url, lock, 'W1', log, { staleMs: LOOK_STALE, env: { VS_QUEUE_STALL_READ: stall } });
  r.inStall = await reached(stall, label, 'after W1\'s folder read');
  const t1 = ticketOf(lock, W1), inAt = Number(fs.readFileSync(stall + '.in', 'utf8'));
  await until(() => Date.now() - inAt > LOOK_FREEZE, LOOK_FREEZE + 2000);   // the freeze outlives W1's staleness
  r.frozeMs = Date.now() - inAt;
  try { const t = new Date(); fs.utimesSync(path.join(qdir(lock), t2), t, t); } catch { }   // W2's ticket touched at the lift, as its poll does
  fs.unlinkSync(stall);
  r.settled = await until(() => { const q = ticketsIn(lock); return q.length === 2 && q.some((n) => n.endsWith('-' + W1.pid)) && q.some((n) => n.endsWith('-' + W2.pid)); }, BOUND);
  await sleep(3 * POLL);
  const q = ticketsIn(lock);
  r.t2kept = q.includes(t2); r.t1kept = q.includes(t1);
  fs.writeFileSync(relH, 'go');
  await until(() => has(log, 'W1', 'got') && has(log, 'W2', 'got'), BOUND);
  r.order = gotOrder(log).join(',');
  end(W1, W2, H);
  return r;
}

/** ⑨⑩ the take in one step: a waiter blind to the queue reads the lock while the taker is held right after its creation */
async function lockSteps(url, label) {
  const d = scratch(label), lock = path.join(d, 'lock'), log = path.join(d, 'log'), stall = path.join(d, 'stall'), rel = (n) => path.join(d, 'rel' + n);
  const r = { label };
  fs.writeFileSync(stall, 'hold');
  const W1 = waiter(url, lock, 'W1', log, { hold: rel('W1'), env: { VS_QUEUE_STALL_LOCK: stall } });
  r.inStall = await reached(stall, label, 'right after W1 created the lock');
  r.lockText = (() => { try { return fs.readFileSync(lock, 'utf8'); } catch { return null; } })();
  const R = waiter(BLIND, lock, 'R', log, { hold: rel('R') });
  await until(() => has(log, 'R', 'got') || has(log, 'R', 'wait'), BOUND);
  await sleep(300);
  r.rGotWhileHeld = has(log, 'R', 'got'); r.rWait = said(log, 'R', 'wait')[0] || null; r.w1pid = W1.pid;
  fs.unlinkSync(stall);
  await until(() => has(log, 'W1', 'got'), BOUND);
  await sleep(200);
  r.twoHolders = has(log, 'W1', 'got') && has(log, 'R', 'got') && !has(log, 'W1', 'released') && !has(log, 'R', 'released');
  fs.writeFileSync(rel('W1'), 'go');
  await until(() => has(log, 'R', 'got'), BOUND);
  fs.writeFileSync(rel('R'), 'go');
  r.order = gotOrder(log).join(',');
  end(W1, R);
  return r;
}

/** ⑪⑫ the steal's window: W1 judged a DEAD holder's lock and is held before its act; X steals that lock and takes it meanwhile */
async function stealScene(url, label) {
  const d = scratch(label), lock = path.join(d, 'lock'), log = path.join(d, 'log'), stall = path.join(d, 'stall'), relX = path.join(d, 'relX'), relW1 = path.join(d, 'relW1');
  const r = { label };
  // a lock whose holder died: no process runs its command, so every head judges it dead
  fs.writeFileSync(lock, JSON.stringify({ pid: 999999, cmd: 'a-heavy-run-that-died', sha: 'dead', startedAt: 1 }) + '\n');
  fs.writeFileSync(stall, 'hold');
  const W1 = waiter(url, lock, 'W1', log, { hold: relW1, env: { VS_QUEUE_STALL_STEAL: stall } });
  r.inStall = await reached(stall, label, 'after W1 judged the holder dead, before its steal');
  const t1 = ticketOf(lock, W1);
  try { fs.unlinkSync(path.join(qdir(lock), t1)); } catch { }   // THE REAP, PLACED: W1 is frozen past its ticket's life
  const X = waiter(url, lock, 'X', log, { hold: relX });      // the next head: it steals the dead lock and takes it
  r.xGot = await until(() => has(log, 'X', 'got'), BOUND);
  fs.unlinkSync(stall);                                          // W1 acts on its old judgment
  await until(() => has(log, 'W1', 'wait') || has(log, 'W1', 'got'), BOUND);
  await sleep(200);
  const rec = (() => { try { return JSON.parse(fs.readFileSync(lock, 'utf8')); } catch { return null; } })();
  r.lockPid = rec ? rec.pid : null; r.xPid = X.pid;
  r.w1Wait = said(log, 'W1', 'wait')[0] || null;
  r.twoHolders = has(log, 'X', 'got') && has(log, 'W1', 'got') && !has(log, 'X', 'released');
  r.asideLeft = fs.readdirSync(d).filter((n) => n.endsWith('.steal'));
  fs.writeFileSync(relX, 'go');
  await until(() => has(log, 'W1', 'got'), BOUND);
  fs.writeFileSync(relW1, 'go');
  r.order = gotOrder(log).join(',');
  end(W1, X);
  return r;
}

console.log('the scenes, side by side (each placed stall said when reached):');
const [reapCure, reapCtl, behindCure, behindCtl, dlCure, dlCtl, lookCure, lookCtl, stepCure, stepCtl, stealCure, stealCtl] = await Promise.all([
  takeReaped(CURE, 'reaped-cure'), takeReaped(NO_FRESH, 'reaped-no-fresh'),
  takeBehind(CURE, 'behind-cure'), takeBehind(NO_FRESH, 'behind-no-fresh'),
  deadlineScene(CURE, 'deadline-cure'), deadlineScene(NO_DEADLINE, 'deadline-no-check'),
  lookScene(CURE, 'look-cure'), lookScene(ONE_CLOCK, 'look-one-clock'),
  lockSteps(CURE, 'steps-cure'), lockSteps(TWO_STEP, 'steps-two'),
  stealScene(CURE, 'steal-cure'), stealScene(UNLINK, 'steal-unlink'),
]);

console.log('①② the take\'s window — the taker\'s ticket reaped while it was frozen');
for (const s of [reapCure, reapCtl]) ok(s.inStall && s.t1gone && s.w2 && s.freeWhenLifted, `${s.label}: the scene was made — W1 stalled in its window, its ticket reaped (placed), W2 served, the lock FREE when the stall lifted`, s);
ok(reapCure.order === 'H,W2,W3,W1' && reapCure.gotW1 === 1 && reapCure.gaveback.length === 1 && reapCure.gaveback[0] === 'reaped',
  `① THE CURE: W1 takes the free lock on its old look, looks again, GIVES IT BACK at once (said «${reapCure.gaveback.join(' · ')}») and is served LAST — ${reapCure.order}`, reapCure);
ok(reapCtl.order === 'H,W2,W1,W3' && reapCtl.gaveback.length === 0, `② RED CONTROL: without the fresh look W1 jumps the older live ticket — ${reapCtl.order} (the order red of 65ac68d30, made at will)`, reapCtl);

console.log('③④ the take\'s window — an older LIVE ticket ahead, the taker\'s own still on disk');
for (const s of [behindCure, behindCtl]) ok(s.inStall && !!s.t0 && !!s.t1, `${s.label}: the scene was made — W1 stalled in its window, an older live ticket (${s.t0}) landed after its look`, s);
ok(behindCure.gaveback.length === 1 && behindCure.gaveback[0] === `behind ${behindCure.t0}` && !behindCure.servedWhileOlder && behindCure.ownOnDisk && behindCure.gotTicket === behindCure.t1,
  `③ THE CURE: W1 gives the lock back «${behindCure.gaveback.join(' · ')}» with its own ticket still on disk (${behindCure.ownOnDisk}), and once the older one leaves it is served with the SAME ticket (${behindCure.gotTicket})`, behindCure);
ok(behindCtl.servedWhileOlder && behindCtl.gaveback.length === 0, `④ RED CONTROL: without the fresh look W1 is served while the older live ticket is ahead (${behindCtl.servedWhileOlder})`, behindCtl);

console.log('⑤⑥ the deadline at a give-back');
for (const s of [dlCure, dlCtl]) ok(s.inStall && s.pastDeadline && s.gave, `${s.label}: the scene was made — W1 stalled past its 1.5 s deadline, then took the lock on its old look and gave it back`, s);
ok(dlCure.timedout.length === 1 && dlCure.timedout[0] === 'gaveback' && !dlCure.got, `⑤ THE CURE: a waiter that gives back past its deadline TIMES OUT BY NAME («timedout ${dlCure.timedout.join(' · ')}»: the result says gaveBack) and never takes the lock late`, dlCure);
ok(dlCtl.got && dlCtl.timedout.length === 0, `⑥ RED CONTROL: without the deadline's check at the give-back W1 sleeps, finds the line empty and takes the lock ${dlCtl.gotLateMs} ms after it began, past its 1500-ms deadline`, dlCtl);

console.log('⑦⑧ the look\'s window — the freeze after the folder read');
for (const s of [lookCure, lookCtl]) ok(s.inStall && s.settled && s.frozeMs > LOOK_FREEZE, `${s.label}: the scene was made — W1 stalled after its folder read ${s.frozeMs} ms (> ${LOOK_FREEZE}: its staleness ${LOOK_STALE} ms + 500), the queue settled to two tickets`, s);
ok(lookCure.order === 'H,W2,W1' && lookCure.t2kept && !lookCure.t1kept, `⑦ THE CURE: W2's live ticket is KEPT by W1's late look (${lookCure.t2kept}); W1's own silent ticket is stale by its own look and W1 goes back in line — ${lookCure.order}`, lookCure);
ok(lookCtl.order === 'H,W1,W2' && !lookCtl.t2kept, `⑧ RED CONTROL: with ONE clock read at the look's start the same freeze reaps W2's live ticket «in the future» (kept: ${lookCtl.t2kept}) and W1 is served first — ${lookCtl.order}`, lookCtl);

console.log('⑨⑩ the take in one step — a waiter blind to the queue reads the lock while the taker is held right after its creation');
for (const s of [stepCure, stepCtl]) ok(s.inStall, `${s.label}: the scene was made — W1 held right after it created the lock`, s);
let rec = null; try { rec = JSON.parse(stepCure.lockText); } catch { }
ok(!!rec && rec.pid === stepCure.w1pid && !stepCure.rGotWhileHeld && /^\d+ /.test(stepCure.rWait || '') && Number(stepCure.rWait.split(' ')[0]) === stepCure.w1pid && !stepCure.twoHolders && stepCure.order === 'W1,R',
  `⑨ THE CURE: the lock exists only WHOLE (W1's record, pid ${rec && rec.pid}); the blind reader sees a LIVE holder and waits («wait ${stepCure.rWait}») — one holder at a time, ${stepCure.order}`, stepCure);
ok(stepCtl.lockText === '' && stepCtl.rGotWhileHeld && stepCtl.twoHolders, `⑩ RED CONTROL: created then written, the lock is EMPTY between the steps («${stepCtl.lockText}»); the blind reader judges its holder dead, removes the live holder's lock and takes it — TWO HOLDERS at once (${stepCtl.twoHolders})`, stepCtl);

console.log('⑪⑫ the steal\'s window — a head held between judging the holder dead and its steal');
for (const s of [stealCure, stealCtl]) ok(s.inStall && s.xGot, `${s.label}: the scene was made — W1 held after judging the dead holder, its ticket reaped (placed), X stole the dead lock and took it`, s);
ok(stealCure.lockPid === stealCure.xPid && /^\d+ /.test(stealCure.w1Wait || '') && Number(stealCure.w1Wait.split(' ')[0]) === stealCure.xPid && !stealCure.twoHolders && stealCure.asideLeft.length === 0 && stealCure.order === 'X,W1',
  `⑪ THE CURE: W1's late steal moves the lock aside, finds X's record (not the one it judged dead) and links it back — X's lock SURVIVES (pid ${stealCure.lockPid}), W1 waits on X («wait ${stealCure.w1Wait}»), nothing left aside, served ${stealCure.order}`, stealCure);
ok(stealCtl.lockPid !== stealCtl.xPid && stealCtl.twoHolders, `⑫ RED CONTROL: today's unlink removes X's LIVE lock on W1's old judgment and W1 takes it — TWO HOLDERS at once (${stealCtl.twoHolders}; the lock now W1's, pid ${stealCtl.lockPid})`, stealCtl);

console.log('⑬ the wiring');
{
  const at = SRC.indexOf('export function acquireMachineLock('), fn = SRC.slice(at, SRC.indexOf('\n}\n', at));
  const lookAt = fn.indexOf('const fresh = machineQueue(lockPath, { staleMs });'), dropAt = fn.indexOf('drop();', lookAt);
  ok((SRC.match(/\/\/ THE FRESH LOOK AFTER THE TAKE/g) || []).length === 1 && lookAt > 0 && dropAt > lookAt && /fresh\[0\]\.name !== ticket\.name/.test(fn) && /cur\.pid === process\.pid\) fs\.unlinkSync\(lockPath\)/.test(fn),
    'ONE fresh look in acquireMachineLock, after the take and BEFORE the taker\'s ticket is dropped; only a record of its own is given back');
  const gb = fn.slice(fn.indexOf('if (onGiveBack)'), fn.indexOf('continue;', fn.indexOf('if (onGiveBack)')));
  ok(gb.indexOf(DEADLINE.trim()) > 0 && gb.indexOf(DEADLINE.trim()) < gb.indexOf('sleepSync(headPollMs)'), 'the give-back judges the deadline BEFORE its sleep and its next turn');
  ok(/held\.gaveBack \? 'gave the machine lock back at its deadline/.test(SRC) && /onGiveBack: \(g\) => console\.log\(`\[ci:heavy\] took the machine lock on a stale look and gave it back at once/.test(SRC),
    'heavyGate SAYS a give-back, and names a timeout at a give-back in its skipped note');
  const tl = SRC.slice(SRC.indexOf('function takeLock('), SRC.indexOf('\n}\n', SRC.indexOf('function takeLock(')));
  ok(fn.split('takeLock(lockPath, ').length === 2 && !/fs\.openSync\(lockPath, 'wx'\)/.test(fn) && /fs\.linkSync\(aside, lockPath\)/.test(tl) && /finally \{ try \{ fs\.unlinkSync\(aside\)/.test(tl),
    'the take is ONE call of takeLock (the record written aside, hard-linked in — a link never replaces — the aside removed); no create-then-write left in acquireMachineLock');
  const sd = SRC.slice(SRC.indexOf('function stealDead('), SRC.indexOf('\n}\n', SRC.indexOf('function stealDead(')));
  ok(fn.split('stealDead(lockPath, holder)').length === 2 && !/fs\.unlinkSync\(lockPath\); continue;/.test(fn) && sd.indexOf('fs.renameSync(lockPath, aside)') > 0 && sd.indexOf('sameLockRecord(readJson(aside), judged)') > sd.indexOf('fs.renameSync(lockPath, aside)') && /fs\.linkSync\(aside, lockPath\)/.test(sd),
    'the steal of a dead holder\'s lock is ONE call of stealDead: the lock renamed aside FIRST, kept only when it is the record judged dead, linked back otherwise — no check-then-unlink left');
  const mq = SRC.slice(SRC.indexOf('export function machineQueue('), SRC.indexOf('function takeTicket('));
  const b = mq.indexOf('const before = now ?? Date.now();'), st = mq.indexOf('fs.statSync(file)'), a = mq.indexOf('const after = now ?? Date.now();');
  ok(/now = null \} = \{\}\) \{/.test(mq) && !/Math\.abs\(now - seen\)/.test(mq) && b > 0 && b < st && st < a, 'machineQueue judges each ticket against the clock read around ITS OWN stat — no clock taken at the call\'s start');
}
for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 7, label: '⑬ ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
report();

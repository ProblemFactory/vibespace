#!/usr/bin/env node
// B-69a7 — WHAT A STOPPED TURN'S COMMAND TOOL LEFT RUNNING (src/left-behind.js, src/server/left-behind-door.js). Fast, in-process:
//   ① the READ over a stand-in /proc: this conversation's mark only (no other variable is ever asked), the same user, started
//      after the turn began, never a zombie; what sits under a HELD root (the hub's records) is never named; THIS conversation's
//      own processes (its records and their marked ancestors: the wrapper, the dtach master) are never named, what runs under them
//      or under an older marked process is the CLI's own (kept); a process that cannot be read (in D, a thread in D) is counted
//      and said; ONLY pid, command name and start time leave it; a read past its row bound or stuck past its time bound says CUT
//   ② THE DEVICE AGENT'S READ-ONLY OP is the same read (parity), its own tree and records held out
//   ③ the hub's ONE read after a settled Stop: the turn's start is the later of the input stamps and the CLI's own init; nothing
//      left ⇒ nothing said; left / kept / unread / unreadable ⇒ said once; each said line keeps its own End list
//   ④ REAL processes: a detached one carrying the mark is found and «End them» (a person's press) ends it; another conversation's
//      is never found; a hub job's child with the same mark is never named nor ended; a pid whose start time changed is never
//      signalled; a press that is not a person's, or on a paired machine, is refused by name
//   RED CONTROLS (anchored mutants): no mark filter, no held exclusion, no marked-ancestor walk, no start-time check at the press
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const LB = require(path.join(REPO, 'src/left-behind.js'));
const DOOR = require(path.join(REPO, 'src/server/left-behind-door.js'));
const PI = require(path.join(REPO, 'src/proc-identity.js'));
const ROOT = scratchDir('left-behind');
const { ok, report } = checker();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SRC = fs.readFileSync(path.join(REPO, 'src/left-behind.js'), 'utf8');
const M = mutantCopies('left-behind', REPO);

// ── a stand-in /proc: btime 1000 s ago; each process = stat (field 22 = its start) + environ (+ a thread list when given) ──
const NOW = Date.now(), BTIME = Math.floor(NOW / 1000) - 1000, HZ = LB.HZ;
const ticksAt = (ms) => Math.round((ms / 1000 - BTIME) * HZ);
const statLine = (pid, comm, state, ppid, start) => `${pid} (${comm}) ${state} ${ppid} ${pid} ${pid} 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 ${start} 1000 100\n`;
function fakeProc(rows) {
  const dir = fs.mkdtempSync(path.join(ROOT, 'proc-'));
  fs.writeFileSync(path.join(dir, 'stat'), `cpu  1 2 3\nbtime ${BTIME}\n`);
  for (const r of rows) {
    const d = path.join(dir, String(r.pid));
    fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, 'stat'), statLine(r.pid, r.comm, r.state || 'S', r.ppid || 1, r.start));
    if (r.fifo) execFileSync('mkfifo', [path.join(d, 'environ')]);
    else fs.writeFileSync(path.join(d, 'environ'), (r.env || []).join('\0') + '\0');
    if (r.threadD) { fs.mkdirSync(path.join(d, 'task', String(r.pid + 1)), { recursive: true }); fs.writeFileSync(path.join(d, 'task', String(r.pid + 1), 'stat'), statLine(r.pid + 1, r.comm, 'D', r.ppid || 1, r.start)); }
  }
  return dir;
}
const MARK = 'CLAUDE_WEBUI_SESSION_ID=sess-lb-1', OTHER = 'CLAUDE_WEBUI_SESSION_ID=sess-lb-2';
const TURN_AGE = 60000, AFTER = ticksAt(NOW - 30000), BEFORE = ticksAt(NOW - 120000);
const SECRET = ['tok', 'en', '-', 'value'].join('');
const PROC = [
  { pid: 9101, comm: 'node', start: AFTER, ppid: 1, env: [MARK, `API_TOKEN=${SECRET}`] },          // left: re-parented, this conversation
  { pid: 9102, comm: 'python3', start: AFTER + 5, ppid: 1, env: [MARK] },                           // left
  { pid: 9103, comm: 'sleep', start: AFTER, ppid: 1, env: [OTHER] },                                // another conversation's
  { pid: 9104, comm: 'old', start: BEFORE, ppid: 1, env: [MARK] },                                  // started before this turn
  { pid: 9105, comm: 'gone', start: AFTER, ppid: 1, env: [MARK], state: 'Z' },                      // a zombie
  { pid: 9200, comm: 'job-wrapper', start: BEFORE, ppid: 1, env: [] },                               // a HELD root (the hub's job)
  { pid: 9201, comm: 'jobchild', start: AFTER, ppid: 9200, env: [MARK] },                           // under the held root: never named
  { pid: 9300, comm: 'holder', start: BEFORE, ppid: 1, env: [MARK] },                               // THIS conversation's CLI (older, marked)
  { pid: 9301, comm: 'bash', start: AFTER, ppid: 9300, env: [MARK] },                               // the CLI's own background shell: kept
  { pid: 9601, comm: 'stuckd', start: AFTER, ppid: 1, env: [MARK], state: 'D' },                    // in D: never read, counted
  { pid: 9602, comm: 'fusey', start: AFTER, ppid: 1, env: [MARK], threadD: true },                  // a thread in D: never read, counted
];
const ids = (l) => l.map((x) => x.pid).join(',');
console.log('— ① the read over a stand-in /proc');
const root = fakeProc(PROC);
{
  const r = await LB.leftBehind({ mark: MARK, ageMs: TURN_AGE, keep: [[9200, 0]], own: [9300], procRoot: root, now: NOW });
  ok(ids(r.left) === '9101,9102' && r.left.map((x) => x.comm).join(',') === 'node,python3', '① this conversation\'s leftovers only: re-parented, its mark, started after the turn (node, python3) — never another conversation\'s, one started before, a zombie', r);
  ok(!r.left.concat(r.kept).some((x) => x.pid === 9201) && r.scan.held === 1 && ids(r.kept) === '9301', '① a process under a HELD root (the hub\'s own records — a job) is never named (counted held); under THIS conversation\'s CLI it is the CLI\'s own: KEPT, named apart', { kept: r.kept, scan: r.scan });
  ok(r.scan.unreadable === 2 && !r.left.concat(r.kept).some((x) => x.pid === 9601 || x.pid === 9602), '① a process in D, or with a thread in D, is never read (its environ waits on a lock a stuck thread may hold) — counted unreadable, so the caller SAYS it', r.scan);
  ok(r.left.every((x) => JSON.stringify(Object.keys(x).sort()) === JSON.stringify([...LB.ROW_KEYS].sort())) && !JSON.stringify(r).includes(SECRET), '① ONLY pid, command name and start time leave the read — never an environment\'s bytes (the token), never arguments', r.left);
  const cut = await LB.leftBehind({ mark: MARK, ageMs: TURN_AGE, keep: [[9200, 0]], own: [9300], procRoot: root, now: NOW, maxRows: 1 });
  ok(cut.scan.cut === true && cut.scan.scanned === 1, '① a read past its ROW bound reads no more than the bound and says CUT (the caller says «could not be read», never «nothing left»)', cut.scan);
  const none = await LB.leftBehind({ mark: MARK, ageMs: 0, procRoot: path.join(ROOT, 'no-such-proc'), now: NOW });
  ok(none.unread === 'no-proc' && none.left.length === 0, '① a machine with no /proc: «no-proc» (could not be read), never «nothing left»', none);
  const probe = await LB.leftBehind({ mark: 'API_TOKEN=' + SECRET, ageMs: TURN_AGE, procRoot: root, now: NOW });
  const probe2 = await LB.leftBehind({ mark: MARK + '\0X', ageMs: TURN_AGE, procRoot: root, now: NOW });
  ok(probe.unread === 'no-mark' && probe.left.length === 0 && probe2.unread === 'no-mark', '① the read asks ONLY a conversation\'s mark (CLAUDE_WEBUI_SESSION_ID=<id>) — any other variable is refused (no exact-match probe of a process\'s environment)', { probe, probe2 });
}
console.log('— ① a fresh conversation: its own processes started inside the turn');
{
  const C = 'CLAUDE_WEBUI_SESSION_ID=sess-lb-3';
  const fresh = fakeProc([
    { pid: 9500, comm: 'systemd', start: BEFORE, ppid: 1, env: ['HOME=/x'] },                       // the user's manager (a subreaper), unmarked
    { pid: 9501, comm: 'dtach', start: AFTER, ppid: 9500, env: [C] },                               // the dtach master, re-parented to it
    { pid: 9502, comm: 'node', start: AFTER, ppid: 9501, env: [C] },                                // the wrapper
    { pid: 9503, comm: 'claude', start: AFTER, ppid: 9502, env: [C] },                              // the CLI (the recorded pid)
    { pid: 9504, comm: 'bash', start: AFTER + 3, ppid: 9503, env: [C] },                            // a background shell it keeps
    { pid: 9505, comm: 'vite', start: AFTER + 4, ppid: 9500, env: [C] },                            // a leftover, re-parented to the manager
  ]);
  const r = await LB.leftBehind({ mark: C, ageMs: TURN_AGE, own: [9503, 9999], procRoot: fresh, now: NOW });
  ok(ids(r.left) === '9505' && ids(r.kept) === '9504', '① a conversation started inside the turn: its CLI, wrapper and dtach master (the record and its MARKED ancestors) are never named; its background shell is kept; the re-parented leftover is named', { left: r.left, kept: r.kept });
  const noWalk = M.load('src/left-behind.js', anchored(SRC, "        if (k && (await hasMark(q)) !== true) break;\n        ownSet.add(q);", "        if (k) break;\n        ownSet.add(q);", 'B-69a7 the marked-ancestor walk'), 'nowalk');
  const rw = await noWalk.leftBehind({ mark: C, ageMs: TURN_AGE, own: [9503], procRoot: fresh, now: NOW });
  ok(rw.left.some((x) => x.pid === 9501) && rw.left.some((x) => x.pid === 9502), '① RED CONTROL (no marked-ancestor walk): the dtach master and the wrapper are named as leftovers', ids(rw.left));
}
console.log('— ① a read stuck in the kernel is cut at its time bound');
{
  const stuck = fakeProc([{ pid: 9701, comm: 'stuck', start: AFTER, ppid: 1, fifo: true }, { pid: 9702, comm: 'node', start: AFTER, ppid: 1, env: [MARK] }]);
  const r = await LB.leftBehind({ mark: MARK, ageMs: TURN_AGE, procRoot: stuck, now: NOW, maxMs: 300 });   // it RETURNS while the FIFO is still unreleased
  const before = JSON.stringify(r);
  const fifo = path.join(stuck, '9701', 'environ');
  try { fs.closeSync(fs.openSync(fifo, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK)); } catch { }   // the stuck open returns (EOF): its late answer must change nothing
  await sleep(50);
  ok(r.scan.cut === true && JSON.stringify(r) === before, '① an environ read that never returns (a FIFO standing in for a lock held by a stuck thread) CUTS the read at its time bound — the hub is answered before the FIFO is released, and the late answer changes nothing returned', r.scan);
}
console.log('— ② the device agent\'s op');
{
  const op = await LB.leftBehindOp({ mark: MARK, ageMs: TURN_AGE }, { procRoot: root, keep: [[9200, 0]] });
  const local = await LB.leftBehind({ mark: MARK, ageMs: TURN_AGE, keep: [process.pid, 9200], procRoot: root });
  const rows = (l) => JSON.stringify(l.map((x) => [x.pid, x.comm, x.start]));
  ok(rows(op.left) === rows(local.left) && rows(op.kept) === rows(local.kept) && op.left.length === 2 && ids(op.kept) === '9301' && !JSON.stringify(op).includes(SECRET), '② PARITY: the device agent\'s READ-ONLY op answers the same rows as the hub\'s read (its own tree and records held out; a shell under the older marked CLI kept), the row keys only', { op: op.left, local: local.left });
  const opProbe = await LB.leftBehindOp({ mark: 'PATH=/usr/bin', ageMs: TURN_AGE }, { procRoot: root });
  ok(opProbe.unread === 'no-mark' && opProbe.left.length === 0, '② the op refuses any variable but a conversation\'s mark', opProbe);
}
console.log('— ① red controls');
{
  const noMark = M.load('src/left-behind.js', anchored(SRC, "    if (!has) return;\n", '', 'B-69a7 the mark filter'), 'nomark');
  const noHeld = M.load('src/left-behind.js', anchored(SRC, "    if (by === 'held') { put(() => { out.scan.held++; }); return; }\n", '', 'B-69a7 the held exclusion'), 'noheld');
  const rm = await noMark.leftBehind({ mark: MARK, ageMs: TURN_AGE, keep: [[9200, 0]], own: [9300], procRoot: root, now: NOW });
  const rh = await noHeld.leftBehind({ mark: MARK, ageMs: TURN_AGE, keep: [[9200, 0]], own: [9300], procRoot: root, now: NOW });
  ok(rm.left.some((x) => x.pid === 9103), '① RED CONTROL (no mark filter): another conversation\'s process is named', ids(rm.left));
  ok(rh.left.some((x) => x.pid === 9201), '① RED CONTROL (no held exclusion): the hub job\'s child is named', ids(rh.left));
}

console.log('— ③ the hub\'s one read after a settled Stop');
{
  const said = [];
  const bcast = (s, id, m) => said.push(m);
  const now = () => NOW;
  const sess = (o = {}) => ({ backend: 'claude', _userInputAt: NOW - TURN_AGE, pty: { pid: 9300 }, _childPid: 9303, ...o });
  const nothing = await DOOR.afterStop(sess(), 'sess-lb-1', { broadcastToSession: bcast, now, read: async () => ({ left: [], kept: [], scan: { cut: false, unreadable: 0 } }) });
  ok(nothing === null && said.length === 0, '③ nothing left ⇒ nothing said', said);
  const s1 = sess();
  let asked = null;
  const d = await DOOR.afterStop(s1, 'sess-lb-1', { broadcastToSession: bcast, now, read: async (o) => { asked = o; return { left: [{ pid: 9101, comm: 'node', start: AFTER }], kept: [{ pid: 9301, comm: 'bash', start: AFTER }], scan: { cut: false } }; } });
  const m = said[0];
  ok(said.length === 1 && m.op === 'meta' && m.subtype === 'left-behind' && m.sessionId === 'sess-lb-1' && d.door === true && d.at === NOW && d.left[0].comm === 'node' && d.kept[0].comm === 'bash' && Array.isArray(s1._leftBehind) && s1._leftBehind.length === 1 && s1._leftBehind[0].at === NOW && s1._leftBehind[0].mark === MARK, '③ left and kept ⇒ said ONCE as a meta line of THIS conversation (names + pids only; the door on this machine; the line\'s `at`), its End list kept on the session', { m, s: s1._leftBehind });
  ok(!!asked && asked.own.includes(9300) && asked.own.includes(9303) && asked.ageMs === TURN_AGE && asked.mark === MARK, '③ the read is asked with THIS conversation\'s own records (its pty AND the CLI\'s recorded pid — a re-attach leaves the pty a client) and the turn\'s age', asked && { own: asked.own, ageMs: asked.ageMs });
  said.length = 0;
  const later = await DOOR.afterStop(s1, 'sess-lb-1', { broadcastToSession: bcast, now: () => NOW + 5000, read: async () => ({ left: [], kept: [], scan: { cut: false } }) });
  ok(later === null && said.length === 0 && s1._leftBehind.length === 1 && s1._leftBehind[0].at === NOW, '③ a later Stop whose read finds nothing NEW says nothing and keeps the earlier line\'s list (its «End them» still ends what it named)', s1._leftBehind);
  let asked2 = null;
  const cliTurn = sess({ _turnBy: { by: 'notification', at: NOW - 5000 } });
  await DOOR.afterStop(cliTurn, 'sess-lb-1', { broadcastToSession: bcast, now, read: async (o) => { asked2 = o; return { left: [], kept: [], scan: {} }; } });
  ok(!!asked2 && asked2.ageMs === 5000, '③ a turn the CLI opened itself (no input stamp of its own): the window starts at the CLI\'s init (session-brain _turnBy.at), never at an older input', asked2 && asked2.ageMs);
  said.length = 0;
  const noStart = await DOOR.afterStop(sess({ _userInputAt: null }), 'sess-lb-1', { broadcastToSession: bcast, now, read: async () => { throw new Error('never read'); } });
  ok(!!noStart && noStart.unread === 'no-turn-start' && said.length === 1, '③ no known turn start (a hub restart under a running turn) ⇒ said «could not be read», never silence', noStart);
  said.length = 0;
  const cutSaid = await DOOR.afterStop(sess(), 'sess-lb-1', { broadcastToSession: bcast, now, read: async () => ({ left: [], kept: [], scan: { cut: true } }) });
  ok(!!cutSaid && cutSaid.unread === 'cut' && said.length === 1, '③ a cut read ⇒ said «could not be read» (unread: cut), never silence', cutSaid);
  said.length = 0;
  const unr = await DOOR.afterStop(sess(), 'sess-lb-1', { broadcastToSession: bcast, now, read: async () => ({ left: [], kept: [], scan: { cut: false, unreadable: 2 } }) });
  ok(!!unr && unr.unreadable === 2 && said.length === 1, '③ processes of this user started in the turn that could not be read ⇒ SAID with their count, never «nothing left»', unr);
  said.length = 0;
  const remote = await DOOR.afterStop(sess({ host: 'h-2' }), 'sess-lb-1', { broadcastToSession: bcast, now, hosts: { get: () => ({ name: 'Studio Mac' }), deviceBounded: async () => ({ leftBehind: async () => ({ left: [{ pid: 4242, comm: 'node', start: 1 }], kept: [], scan: { cut: false } }) }) } });
  ok(!!remote && remote.machine === 'Studio Mac' && remote.door === false && remote.left[0].pid === 4242, '③ a paired machine: read through its agent\'s op, named with the machine, and NO door yet (ending there is a device act)', remote);
  const old = await DOOR.afterStop(sess({ host: 'h-2' }), 'sess-lb-1', { broadcastToSession: bcast, now, hosts: { get: () => null, deviceBounded: async () => ({}) } });
  ok(!!old && old.unread === 'no-agent-op', '③ an agent without the op ⇒ said as unreadable («no-agent-op»), never asked anything else', old);
}

console.log('— ④ real processes and the End door');
{
  const id = `sess-lb-${process.pid}`, mark = `CLAUDE_WEBUI_SESSION_ID=${id}`;
  const live = [];
  // a REAL leftover is RE-PARENTED (the CLI kills its group and every linked descendant): a double fork — the middle process
  // starts a detached grandchild, prints its pid and exits, so the grandchild is nobody's child here
  const run = (env) => {
    const pid = Number(String(execFileSync(process.execPath, ['-e', "const c = require('child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { detached: true, stdio: 'ignore', env: process.env }); c.unref(); console.log(c.pid);"], { env: { PATH: process.env.PATH, ...env } })).trim());
    live.push(pid); return pid;
  };
  // a hub JOB: a holder re-parented away from this process (only the job's record holds it), whose child carries the mark
  const runJob = async () => {
    const file = path.join(ROOT, 'job-child.pid');
    const holderCode = "const c = require('child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { env: { ...process.env, CLAUDE_WEBUI_SESSION_ID: process.argv[1] }, stdio: 'ignore' }); require('fs').writeFileSync(process.argv[2], String(c.pid)); setTimeout(() => {}, 30000);";
    const holder = Number(String(execFileSync(process.execPath, ['-e', `const c = require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(holderCode)}, ${JSON.stringify(id)}, ${JSON.stringify(file)}], { detached: true, stdio: 'ignore' }); c.unref(); console.log(c.pid);`], { env: { PATH: process.env.PATH } })).trim());
    live.push(holder);
    for (let k = 0; k < 100 && !fs.existsSync(file); k++) await sleep(20);
    const child = Number(fs.readFileSync(file, 'utf8')); live.push(child);
    return { holder, child };
  };
  const alive = (p) => { try { process.kill(p, 0); return true; } catch { return false; } };
  let off = () => { };
  try {
    const mine = run({ CLAUDE_WEBUI_SESSION_ID: id }), theirs = run({ CLAUDE_WEBUI_SESSION_ID: `${id}-other` });
    const job = await runJob();
    off = PI.keepOut('left-behind-test-job', () => [[job.holder, 0]]);
    await sleep(150);
    const r = await LB.leftBehind({ mark, ageMs: 10000, keep: PI.keptOut([]) });
    ok(r.left.some((x) => x.pid === mine && x.comm === 'node') && !r.left.some((x) => x.pid === theirs), '④ a REAL detached process carrying this conversation\'s mark is found (node); another conversation\'s is not', { left: r.left, scan: r.scan });
    ok(!r.left.concat(r.kept).some((x) => x.pid === job.child) && r.scan.held >= 1, '④ a REAL hub job\'s child carrying the SAME mark is never named — held out by the hub\'s own record of the job, never by a name', { left: r.left, job });
    const noHeld = M.load('src/left-behind.js', anchored(SRC, "    if (by === 'held') { put(() => { out.scan.held++; }); return; }\n", '', 'B-69a7 the held exclusion (real)'), 'noheld-real');
    const rh = await noHeld.leftBehind({ mark, ageMs: 10000, keep: PI.keptOut([]) });
    ok(rh.left.some((x) => x.pid === job.child), '④ RED CONTROL (no hub-held exclusion): the real job\'s child IS named', ids(rh.left));
    const row = (p) => { const s = LB.statOf(fs.readFileSync(`/proc/${p}/stat`, 'utf8')); return { pid: p, start: s.start, comm: s.comm }; };   // the row as the read would list it
    const session = { _leftBehind: [{ at: 7, mark, rows: [row(mine)] }] };
    const refused = await DOOR.endLeft(session, { by: null, at: 7 });
    const paired = await DOOR.endLeft({ host: 'h-2', _leftBehind: session._leftBehind }, { by: { kind: 'human' }, at: 7 });
    const wrongLine = await DOOR.endLeft(session, { by: { kind: 'human' }, at: 8 });
    ok(refused.reason === 'not-the-person' && paired.reason === 'paired-machine' && wrongLine.reason === 'nothing-listed' && session._leftBehind.length === 1, '④ a press that is not a person\'s is refused by name (not-the-person); on a paired machine there is no door yet (paired-machine); a line with no list here ends nothing', { refused, paired, wrongLine });
    const heldPress = await DOOR.endLeft({ _leftBehind: [{ at: 9, mark, rows: [row(job.child)] }] }, { by: { kind: 'human' }, at: 9, graceMs: 200 });
    ok(heldPress.ok && heldPress.gone === 1 && heldPress.ended.length === 0 && alive(job.child), '④ a listed pid the hub holds AT THE PRESS (a job\'s) is never signalled — the held fence is applied again', heldPress);
    const reused = await DOOR.endLeft({ _leftBehind: [{ at: 1, mark, rows: [{ pid: mine, start: 1, comm: 'node' }] }] }, { by: { kind: 'human' }, at: 1, graceMs: 200 });
    ok(reused.ok && reused.gone === 1 && reused.ended.length === 0 && alive(mine), '④ a listed pid whose start time is not the one read (a reused pid) is NEVER signalled (counted gone)', reused);
    const ended = await DOOR.endLeft(session, { by: { kind: 'human' }, at: 7, graceMs: 1000 });
    for (let k = 0; k < 50 && alive(mine); k++) await sleep(20);
    ok(ended.ok && ended.ended.includes('node') && !alive(mine) && alive(theirs) && alive(job.child) && session._leftBehind === null, '④ «End them» (a person\'s press on its line): the listed process re-checked and ended; it says what ended; the other conversation\'s and the job\'s untouched', ended);
    const noStart = M.load('src/left-behind.js', anchored(SRC, " || s.start !== Number(start)) return null;", ') return null;', 'B-69a7 the start-time check at the press'), 'nostart');
    const victim = run({ CLAUDE_WEBUI_SESSION_ID: id });
    await sleep(150);
    const m2 = await noStart.stillLeft({ pid: victim, start: 1 }, mark);
    ok(!!m2 && m2.pid === victim, '④ RED CONTROL (no start-time check at the press): a row with the wrong start time passes the re-check', m2);
  } finally {
    off();
    for (const p of live) { try { if (fs.readFileSync(`/proc/${p}/cmdline`, 'utf8').includes('setTimeout')) process.kill(p, 'SIGKILL'); } catch { } }
  }
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
report();

#!/usr/bin/env node
// B-69a7 — WHAT A STOPPED TURN'S COMMAND TOOL LEFT RUNNING (src/left-behind.js, src/server/left-behind-door.js). Fast, in-process:
//   ① the READ over a stand-in /proc: this conversation's mark only (no other variable is ever asked), the same user, started
//      after the turn began, never a zombie; THE CONVERSATION'S OWN CHAIN KNOWN BY RECORD or «could not be read» with nothing
//      named (a fresh chain known only by its pty names nothing endable); its records and their marked ancestors never named,
//      what runs under them or under an older marked process kept; under a HELD root never named; a job's process named as a
//      job's; the reader's own supervisor never named; in D / a D thread / a broken chain counted and said; ONLY pid, command
//      name and start time leave it; a read past its row bound or stuck past its time bound says CUT; environ reads never hold
//      more than ENV_SLOTS of the pool's threads
//   ② THE DEVICE AGENT'S READ-ONLY OP is the same read (parity), its own tree and records held out, the chain known by its records
//   ③ the hub's ONE read after a settled Stop: the turn's start is the later of the input stamps and the CLI's own init; the
//      wrapper's own meta is the record; nothing left ⇒ nothing said; «could not be read» said once per conversation and reason
//   ④ REAL processes + the End door: found and ended by a person's press on its line; another conversation's never found; a hub
//      job's child with the same mark never named nor ended; a reused pid never signalled; the press re-checked with the scan's
//      bound (a stuck one stays listed and is said); a failed press is said and keeps its list; one press at a time on a line
//   RED CONTROLS (anchored mutants): no mark filter, no held exclusion, no marked-ancestor walk, no own-chain law, no start check
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
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
const NOW = Date.now(), BTIME = Math.floor(NOW / 1000) - 1000;
const ticksAt = (ms) => Math.round((ms / 1000 - BTIME) * LB.HZ);
const statLine = (pid, comm, state, ppid, start) => `${pid} (${comm}) ${state} ${ppid} ${pid} ${pid} 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 ${start} 1000 100\n`;
const fifos = [];
function fakeProc(rows) {
  const dir = fs.mkdtempSync(path.join(ROOT, 'proc-'));
  fs.writeFileSync(path.join(dir, 'stat'), `cpu  1 2 3\nbtime ${BTIME}\n`);
  for (const r of rows) {
    const d = path.join(dir, String(r.pid));
    fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, 'stat'), statLine(r.pid, r.comm, r.state || 'S', r.ppid || 1, r.start));
    if (r.fifo) { execFileSync('mkfifo', [path.join(d, 'environ')]); fifos.push(path.join(d, 'environ')); }
    else fs.writeFileSync(path.join(d, 'environ'), (r.env || []).join('\0') + '\0');
    if (r.exe) fs.symlinkSync(r.exe, path.join(d, 'exe'));   // the program the kernel says it runs (a link; its target need not exist)
    if (r.threadD) { fs.mkdirSync(path.join(d, 'task', String(r.pid + 1)), { recursive: true }); fs.writeFileSync(path.join(d, 'task', String(r.pid + 1), 'stat'), statLine(r.pid + 1, r.comm, 'D', r.ppid || 1, r.start)); }
  }
  return dir;
}
const release = (f) => { try { fs.closeSync(fs.openSync(f, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK)); } catch { } };   // a stuck open returns (EOF)
const record = (o) => { const f = path.join(fs.mkdtempSync(path.join(ROOT, 'rec-')), 'meta.json'); fs.writeFileSync(f, JSON.stringify(o)); return f; };
const MARK = 'CLAUDE_WEBUI_SESSION_ID=sess-lb-1', OTHER = 'CLAUDE_WEBUI_SESSION_ID=sess-lb-2';
const TURN_AGE = 60000, AFTER = ticksAt(NOW - 30000), BEFORE = ticksAt(NOW - 120000);
const SECRET = ['tok', 'en', '-', 'value'].join('');
const PROC = [
  { pid: 9101, comm: 'MainThread', exe: '/opt/node-v24.22.1/bin/node', start: AFTER, ppid: 1, env: [MARK, `API_TOKEN=${SECRET}`] },   // left: its MAIN THREAD renamed (Node 24), its program node
  { pid: 9102, comm: 'python3', start: AFTER + 5, ppid: 1, env: [MARK] },                           // left: no program link readable — its stat's name
  { pid: 9103, comm: 'sleep', start: AFTER, ppid: 1, env: [OTHER] },                                // another conversation's
  { pid: 9104, comm: 'old', start: BEFORE, ppid: 1, env: [MARK] },                                  // started before this turn
  { pid: 9105, comm: 'gone', start: AFTER, ppid: 1, env: [MARK], state: 'Z' },                      // a zombie
  { pid: 9106, comm: 'jobd', start: AFTER, ppid: 1, env: [MARK, 'VIBESPACE_JOB_ID=j-1'] },          // a job's re-parented child
  { pid: 9107, comm: 'orphan', start: AFTER, ppid: 4242, env: [MARK] },                             // its chain breaks mid-read
  { pid: 9108, comm: 'orphan2', start: AFTER, ppid: 4243, env: [OTHER] },                           // a broken chain, not this conversation's: not counted
  { pid: process.ppid, comm: 'supervisor', start: AFTER, ppid: 1, env: [MARK] },                    // the reader's own parent
  { pid: 9200, comm: 'job-wrapper', start: BEFORE, ppid: 1, env: [] },                               // a HELD root (the hub's job)
  { pid: 9201, comm: 'jobchild', start: AFTER, ppid: 9200, env: [MARK] },                           // under the held root: never named
  { pid: 9300, comm: 'holder', start: BEFORE, ppid: 1, env: [MARK] },                               // THIS conversation's CLI (the record)
  { pid: 9301, comm: 'bash', start: AFTER, ppid: 9300, env: [MARK] },                               // the CLI's own background shell: kept
  { pid: 9302, comm: 'node', start: AFTER, ppid: 1, env: [MARK] },                                  // a paired machine's keeper ATTACH client (by its record only)
  { pid: 9601, comm: 'stuckd', start: AFTER, ppid: 1, env: [MARK], state: 'D' },                    // in D: never read, counted
  { pid: 9602, comm: 'fusey', start: AFTER, ppid: 1, env: [MARK], threadD: true },                  // a thread in D: never read, counted
];
const ids = (l) => l.map((x) => x.pid).join(',');
const ATT = record({ pid: 9302, pidStart: 'l' + AFTER });   // the attach client's own record (a keeper's `.attach`)
const READ = { mark: MARK, ageMs: TURN_AGE, keep: [[9200, 0]], recordPids: [9300], records: [ATT], now: NOW };
console.log('— ① the read over a stand-in /proc');
const root = fakeProc(PROC);
{
  const r = await LB.leftBehind({ ...READ, procRoot: root });
  ok(ids(r.left) === '9101,9102' && r.left.map((x) => x.comm).join(',') === 'node,python3', '① this conversation\'s leftovers only: re-parented, its mark, started after the turn (node, python3) — never another conversation\'s, one started before, a zombie, the reader\'s own supervisor — each NAMED BY ITS PROGRAM (a stat saying «MainThread» with the link /opt/node-v24.22.1/bin/node reads «node»; no readable link: the stat\'s name)', r);
  ok(!r.left.concat(r.kept).some((x) => x.pid === 9201) && r.scan.held === 1 && ids(r.kept) === '9301', '① a process under a HELD root (the hub\'s own records — a job) is never named (counted held); under THIS conversation\'s CLI (its record) it is the CLI\'s own: KEPT, named apart', { kept: r.kept, scan: r.scan });
  ok(ids(r.jobs) === '9106' && !r.left.some((x) => x.pid === 9106), '① a JOB\'s re-parented child (the job\'s own mark beside the conversation\'s) is named as a job\'s, never offered for ending', r.jobs);
  ok(r.scan.unreadable === 3 && !r.left.concat(r.kept).some((x) => [9601, 9602, 9107].includes(x.pid)), '① a process in D, with a thread in D, or whose parent chain broke mid-read (and still breaks when read again) is never named — counted unreadable only when it is this conversation\'s, so the caller SAYS it', r.scan);
  ok(r.left.every((x) => JSON.stringify(Object.keys(x).sort()) === JSON.stringify([...LB.ROW_KEYS].sort())) && !JSON.stringify(r).includes(SECRET), '① ONLY pid, command name and start time leave the read — never an environment\'s bytes (the token), never arguments', r.left);
  ok(LB.nameOf('MainThread', '/usr/local/bin/node') === 'node' && LB.nameOf('MainThread', '/usr/bin/python3.12 (deleted)') === 'python3.12' && LB.nameOf('MainThread', null) === 'MainThread' && LB.nameOf('x', '/' + 'a'.repeat(40)).length === 32, '① PURE nameOf: the program\'s base name (a deleted program\'s too), bounded as the row; no link: the stat\'s name', [LB.nameOf('MainThread', '/usr/local/bin/node'), LB.nameOf('MainThread', null)]);
  const statOnly = M.load('src/left-behind.js', anchored(SRC, "comm: nameOf(s.comm, await exeOf(procRoot, p)), start: s.start, startedAt:", "comm: String(s.comm).slice(0, 32), start: s.start, startedAt:", 'B-69a7 the program name (the release candidate\'s stat-only read)'), 'statonly');
  const ro = await statOnly.leftBehind({ ...READ, procRoot: root });
  ok(ro.left.some((x) => x.pid === 9101 && x.comm === 'MainThread'), '① RED CONTROL (the release candidate\'s read — the stat\'s name alone): the node process left behind is named «MainThread»', ro.left.map((x) => x.comm));
  const cut = await LB.leftBehind({ ...READ, procRoot: root, maxRows: 1 });
  ok(cut.scan.cut === true && cut.scan.scanned === 1, '① a read past its ROW bound reads no more than the bound and says CUT (the caller says «could not be read», never «nothing left»)', cut.scan);
  const none = await LB.leftBehind({ mark: MARK, ageMs: 0, procRoot: path.join(ROOT, 'no-such-proc'), now: NOW });
  ok(none.unread === 'no-proc' && none.left.length === 0, '① a machine with no /proc: «no-proc» (could not be read), never «nothing left»', none);
  const probe = await LB.leftBehind({ ...READ, mark: 'API_TOKEN=' + SECRET, procRoot: root });
  const probe2 = await LB.leftBehind({ ...READ, mark: MARK + '\0X', procRoot: root });
  ok(probe.unread === 'no-mark' && probe.left.length === 0 && probe2.unread === 'no-mark', '① the read asks ONLY a conversation\'s mark (CLAUDE_WEBUI_SESSION_ID=<id>) — any other variable is refused (no exact-match probe of a process\'s environment)', { probe, probe2 });
}
console.log('— ① the conversation\'s own chain, by record');
const C = 'CLAUDE_WEBUI_SESSION_ID=sess-lb-3';
const fresh = fakeProc([
  { pid: 9500, comm: 'systemd', start: BEFORE, ppid: 1, env: ['HOME=/x'] },                         // the user's manager (a subreaper), unmarked
  { pid: 9501, comm: 'dtach', start: AFTER, ppid: 9500, env: [C] },                                 // the dtach master, re-parented to it
  { pid: 9502, comm: 'node', start: AFTER, ppid: 9501, env: [C] },                                  // the wrapper (the meta's pid)
  { pid: 9503, comm: 'claude', start: AFTER, ppid: 9502, env: [C] },                                // the CLI (the meta's childPid)
  { pid: 9504, comm: 'bash', start: AFTER + 3, ppid: 9503, env: [C] },                              // a background shell it keeps
  { pid: 9505, comm: 'vite', start: AFTER + 4, ppid: 9500, env: [C] },                              // a leftover, re-parented to the manager
  { pid: 9510, comm: 'dtach', start: AFTER, ppid: 1, env: [C] },                                    // the pty: a dtach client, no proof alone
]);
const META = record({ pid: 9502, childPid: 9503, startedAt: NOW });
{
  const r = await LB.leftBehind({ mark: C, ageMs: TURN_AGE, own: [9510], records: [META], procRoot: fresh, now: NOW });
  ok(ids(r.left) === '9505' && ids(r.kept) === '9504', '① the chain KNOWN by its record (the wrapper\'s meta: pid + childPid): the CLI, the wrapper, the dtach master and the pty are never named; the CLI\'s shell is kept; the re-parented leftover is named', { left: r.left, kept: r.kept });
  const only = await LB.leftBehind({ mark: C, ageMs: TURN_AGE, own: [9510], records: [path.join(ROOT, 'no-such-meta.json')], procRoot: fresh, now: NOW });
  ok(only.unread === 'own-unknown' && !only.left.length && !only.kept.length, '① a FRESH chain known only by its pty (no record yet): «could not be read» (own-unknown) — nothing named, nothing endable', only);
  const stale = await LB.leftBehind({ mark: C, ageMs: TURN_AGE, own: [9510], recordPids: [9103], procRoot: root, now: NOW });
  const reborn = await LB.leftBehind({ mark: C, ageMs: TURN_AGE, own: [9510], records: [record({ childPid: 9503, childStart: 'l1' })], procRoot: fresh, now: NOW });
  const born = await LB.leftBehind({ mark: C, ageMs: TURN_AGE, own: [9510], records: [record({ childPid: 9503, childStart: 'l' + AFTER })], procRoot: fresh, now: NOW });
  ok(stale.unread === 'own-unknown' && reborn.unread === 'own-unknown' && ids(born.left) === '9505', '① a recorded pid proves the chain only while it is this conversation\'s (another mark: no) and of its recorded birth (a recycled pid: no; its birth: yes)', { stale: stale.unread, reborn: reborn.unread, born: ids(born.left) });
  const noLaw = M.load('src/left-behind.js', anchored(SRC, "  if (!known) { closed = true; envPrune(); out.unread = 'own-unknown'; return out; }", '', 'B-69a7 the own-chain law'), 'nolaw');
  const rl = await noLaw.leftBehind({ mark: C, ageMs: TURN_AGE, own: [9510], records: [], procRoot: fresh, now: NOW });
  ok(rl.left.some((x) => x.pid === 9501) && rl.left.some((x) => x.pid === 9503), '① RED CONTROL (no own-chain law): the conversation\'s own dtach master and CLI are named as leftovers', ids(rl.left));
  const noWalk = M.load('src/left-behind.js', anchored(SRC, "        if (k && ((await env(q)) || {}).mark !== true) break;\n        ownSet.add(q);", "        if (k) break;\n        ownSet.add(q);", 'B-69a7 the marked-ancestor walk'), 'nowalk');
  const rw = await noWalk.leftBehind({ mark: C, ageMs: TURN_AGE, own: [9510], records: [META], procRoot: fresh, now: NOW });
  ok(rw.left.some((x) => x.pid === 9501), '① RED CONTROL (no marked-ancestor walk): the dtach master is named as a leftover', ids(rw.left));
}
console.log('— ① a read stuck in the kernel: cut at its bound; the environ reads never hold more than their slots');
{
  const stuck = (n) => fakeProc([{ pid: 9300, comm: 'holder', start: BEFORE, ppid: 1, env: [MARK] }, { pid: 9700 + n, comm: 'stuck', start: AFTER, ppid: 1, fifo: true }]);
  const a = stuck(1), b = stuck(2);
  const ra = await LB.leftBehind({ ...READ, procRoot: a, maxMs: 300 });   // it RETURNS while the FIFO is still unreleased
  const before = JSON.stringify(ra);
  const rb = await LB.leftBehind({ ...READ, procRoot: b, maxMs: 300 });
  ok(ra.scan.cut === true && rb.scan.cut === true && LB.envSlotsBusy() === LB.ENV_SLOTS, '① an environ read that never returns (a FIFO standing in for a lock a stuck thread holds) CUTS the read at its bound — and keeps its slot while the kernel holds it', { a: ra.scan, b: rb.scan, busy: LB.envSlotsBusy() });
  const rc = await LB.leftBehind({ ...READ, procRoot: root, maxMs: 300 });
  ok(rc.scan.cut === true && rc.left.length === 0 && LB.envSlotsWaiting() === 0, '① with every environ slot held by the kernel, the next read takes none — cut, said «could not be read» (never a third pool thread), and its waiter is dropped at its close', { scan: rc.scan, waiting: LB.envSlotsWaiting() });
  for (const f of fifos) release(f);
  for (let k = 0; k < 100 && LB.envSlotsBusy() > 0; k++) await sleep(10);
  const rd = await LB.leftBehind({ ...READ, procRoot: root });
  ok(LB.envSlotsBusy() === 0 && ids(rd.left) === '9101,9102' && JSON.stringify(ra) === before, '① released, the slots come back and the next read answers; a late answer changed nothing returned', { busy: LB.envSlotsBusy(), left: ids(rd.left) });
}
console.log('— ② the device agent\'s op');
{
  const rec = record({ keeperPid: 9300 }), att = ATT;
  const op = await LB.leftBehindOp({ mark: MARK, ageMs: TURN_AGE }, { procRoot: root, keep: [[9200, 0]], records: [rec, att] });
  const local = await LB.leftBehind({ mark: MARK, ageMs: TURN_AGE, keep: [process.pid, 9200], records: [rec, att], procRoot: root });
  const rows = (l) => JSON.stringify(l.map((x) => [x.pid, x.comm, x.start]));
  ok(rows(op.left) === rows(local.left) && rows(op.kept) === rows(local.kept) && op.left.length === 2 && ids(op.kept) === '9301' && ids(op.jobs) === '9106' && !JSON.stringify(op).includes(SECRET), '② PARITY: the device agent\'s READ-ONLY op answers the same rows as the hub\'s read (its own tree and records held out; the chain known by the keeper\'s record; the keeper\'s attach client — a reconnect\'s — never named), the row keys only', { op: op.left, local: local.left });
  const noRec = await LB.leftBehindOp({ mark: MARK, ageMs: TURN_AGE }, { procRoot: root });
  const opProbe = await LB.leftBehindOp({ mark: 'PATH=/usr/bin', ageMs: TURN_AGE }, { procRoot: root, records: [rec] });
  ok(noRec.unread === 'own-unknown' && noRec.left.length === 0 && opProbe.unread === 'no-mark', '② the op with no record of the chain answers own-unknown (nothing named); it refuses any variable but a conversation\'s mark', { noRec, opProbe });
}
console.log('— ① red controls');
{
  const noMark = M.load('src/left-behind.js', anchored(SRC, "    if (!e.mark) return;\n", '', 'B-69a7 the mark filter'), 'nomark');
  const noHeld = M.load('src/left-behind.js', anchored(SRC, "    if (by === 'held') { put(() => { out.scan.held++; }); return; }\n", '', 'B-69a7 the held exclusion'), 'noheld');
  const rm = await noMark.leftBehind({ ...READ, procRoot: root });
  const rh = await noHeld.leftBehind({ ...READ, procRoot: root });
  ok(rm.left.some((x) => x.pid === 9103), '① RED CONTROL (no mark filter): another conversation\'s process is named', ids(rm.left));
  ok(rh.left.some((x) => x.pid === 9201), '① RED CONTROL (no held exclusion): the hub job\'s child is named', ids(rh.left));
}

console.log('— ③ the hub\'s one read after a settled Stop');
{
  const said = [];
  const bcast = (s, id, m) => said.push(m);
  const now = () => NOW;
  const BUF = fs.mkdtempSync(path.join(ROOT, 'buffers-'));
  const sess = (o = {}) => ({ backend: 'claude', _userInputAt: NOW - TURN_AGE, pty: { pid: 9300 }, _childPid: 9303, ...o });
  const nothing = await DOOR.afterStop(sess(), 'sess-lb-1', { broadcastToSession: bcast, now, buffersDir: BUF, read: async () => ({ left: [], kept: [], scan: { cut: false, unreadable: 0 } }) });
  ok(nothing === null && said.length === 0, '③ nothing left ⇒ nothing said', said);
  const s1 = sess();
  let asked = null;
  const d = await DOOR.afterStop(s1, 'sess-lb-1', { broadcastToSession: bcast, now, buffersDir: BUF, read: async (o) => { asked = o; return { left: [{ pid: 9101, comm: 'node', start: AFTER }], kept: [{ pid: 9301, comm: 'bash', start: AFTER }], jobs: [{ pid: 9106, comm: 'jobd', start: AFTER }], scan: { cut: false } }; } });
  const m = said[0];
  ok(said.length === 1 && m.op === 'meta' && m.subtype === 'left-behind' && m.sessionId === 'sess-lb-1' && d.door === true && d.at === NOW && d.left[0].comm === 'node' && d.kept[0].comm === 'bash' && d.jobs[0].comm === 'jobd' && Array.isArray(s1._leftBehind) && s1._leftBehind.length === 1 && s1._leftBehind[0].at === NOW && s1._leftBehind[0].rows.length === 1, '③ left, kept and a job\'s ⇒ said ONCE as a meta line of THIS conversation (names + pids; the door on this machine; the line\'s `at`), only the left rows on its End list', { m, s: s1._leftBehind });
  ok(!!asked && JSON.stringify(asked.recordPids) === '[9303]' && JSON.stringify(asked.own) === '[9300]' && asked.records.length === 1 && asked.records[0] === path.join(BUF, 'sess-lb-1.json') && asked.ageMs === TURN_AGE, '③ the read is asked with THIS conversation\'s RECORDS (the wrapper\'s own meta file, the recorded CLI pid) and its pty beside them (no proof alone), and the turn\'s age', asked && { own: asked.own, recordPids: asked.recordPids, records: asked.records });
  said.length = 0;
  const later = await DOOR.afterStop(s1, 'sess-lb-1', { broadcastToSession: bcast, now: () => NOW + 5000, buffersDir: BUF, read: async () => ({ left: [], kept: [], scan: { cut: false } }) });
  ok(later === null && said.length === 0 && s1._leftBehind.length === 1 && s1._leftBehind[0].at === NOW, '③ a later Stop whose read finds nothing NEW says nothing and keeps the earlier line\'s list', s1._leftBehind);
  let asked2 = null;
  await DOOR.afterStop(sess({ _turnBy: { by: 'notification', at: NOW - 5000 } }), 'sess-lb-1', { broadcastToSession: bcast, now, buffersDir: BUF, read: async (o) => { asked2 = o; return { left: [], kept: [], scan: {} }; } });
  ok(!!asked2 && asked2.ageMs === 5000, '③ a turn the CLI opened itself: the window starts at the CLI\'s init (session-brain _turnBy.at), never at an older input', asked2 && asked2.ageMs);
  // A CLOCK SET DURING THE TURN (主开发 r274 / r541): the turn's age takes out the step made since the turn opened (session-brain samples
  // the hub's wall-minus-monotonic step in _turnBy.step), so the kernel's birth-time cut names the turn's own start — RED: the age
  // read off the wall clock alone (a forward step lists an earlier turn's process, a backward one hides this turn's)
  const stepped = async (mod, step) => { let o = null; await mod.afterStop(sess({ _turnBy: { by: 'person', at: NOW - 5000, step: 0 } }), 'sess-lb-1', { broadcastToSession: bcast, now, buffersDir: BUF, wallStep: () => step, read: async (x) => { o = x; return { left: [], kept: [], scan: {} }; } }); return o && o.ageMs; };
  const fwd = await stepped(DOOR, 3000), back = await stepped(DOOR, -2000), none = await stepped(DOOR, 0);
  let noSample = null; await DOOR.afterStop(sess({ _turnBy: { by: 'person', at: NOW - 5000 } }), 'sess-lb-1', { broadcastToSession: bcast, now, buffersDir: BUF, wallStep: () => 3000, read: async (x) => { noSample = x; return { left: [], kept: [], scan: {} }; } });
  ok(fwd === 2000 && back === 7000 && none === 5000 && noSample && noSample.ageMs === 5000, '③ a wall clock set DURING the turn (+3 s / −2 s): the turn\'s age takes the step out (2 s / 7 s for a 5 s wall difference) — a turn with no step sample is aged as before', { fwd, back, none, noSample: noSample && noSample.ageMs });
  const DSRC = fs.readFileSync(path.join(REPO, 'src/server/left-behind-door.js'), 'utf8');
  const WALL = mutantCopies('left-behind-wall-age', REPO).load('src/server/left-behind-door.js', anchored(DSRC, "  const ageOf = () => Math.max(0, now() - started - stepSince(session, wallStep()));", "  const ageOf = () => Math.max(0, now() - started);", 'wall-age'), 'wall-age');
  const fwdRed = await stepped(WALL, 3000);
  ok(fwdRed === 5000, '③ RED CONTROL: the age read off the wall clock alone — a +3 s step during the turn widens the cut by 3 s (an earlier turn\'s process of this conversation listed as this one\'s)', fwdRed);
  const BSRC = fs.readFileSync(path.join(REPO, 'src/server/session-brain.js'), 'utf8');
  ok(BSRC.includes("function setTurnBy(session, v) { const f = { ...v, at: Date.now(), step: wallStep() }; session._turnBy = f; return f; }") && BSRC.includes("...(Number.isFinite(fact.step) ? { step: fact.step } : {})"), '③ the turn\'s opening samples the step (session-brain setTurnBy), and the opener\'s verdict keeps it (source pin)');
  // the REAL read through the door over the fresh chain: no meta file of the conversation's ⇒ said «could not be read», no door
  said.length = 0;
  const realRead = (o) => LB.leftBehind({ ...o, procRoot: fresh, now: NOW });
  const f1 = sess({ pty: { pid: 9510 }, _childPid: undefined });
  const unknown = await DOOR.afterStop(f1, 'sess-lb-3', { broadcastToSession: bcast, now, buffersDir: BUF, read: realRead });
  ok(!!unknown && unknown.unread === 'own-unknown' && unknown.door === false && unknown.left.length === 0 && !f1._leftBehind && said.length === 1, '③ a FIRST-TURN Stop before the wrapper\'s record is read (the CLI pid learned seconds later): «could not be read», nothing named, NO door', unknown);
  fs.writeFileSync(path.join(BUF, 'sess-lb-3.json'), JSON.stringify({ pid: 9502, childPid: 9503 }));
  const known = await DOOR.afterStop(sess({ pty: { pid: 9510 }, _childPid: undefined }), 'sess-lb-3', { broadcastToSession: bcast, now, buffersDir: BUF, read: realRead });
  ok(!!known && known.door === true && known.left.map((x) => x.comm).join(',') === 'vite' && known.kept.map((x) => x.comm).join(',') === 'bash', '③ the wrapper\'s own meta (the file the pid refresh reads) makes the chain known: only the leftover is named, with its door', known);
  said.length = 0;
  const s2 = sess();
  const cut1 = await DOOR.afterStop(s2, 'sess-lb-1', { broadcastToSession: bcast, now, buffersDir: BUF, read: async () => ({ left: [], kept: [], scan: { cut: true } }) });
  const cut2 = await DOOR.afterStop(s2, 'sess-lb-1', { broadcastToSession: bcast, now, buffersDir: BUF, read: async () => ({ left: [], kept: [], scan: { cut: true } }) });
  const unr = await DOOR.afterStop(s2, 'sess-lb-1', { broadcastToSession: bcast, now, buffersDir: BUF, read: async () => ({ left: [], kept: [], scan: { cut: false, unreadable: 2 } }) });
  ok(!!cut1 && cut1.unread === 'cut' && cut2 === null && !!unr && unr.unreadable === 2 && said.length === 2, '③ «could not be read» is said ONCE per conversation and reason (a second cut says nothing; a new reason — 2 unreadable — is said)', { cut1, cut2, unr, said: said.length });
  const rowsCut = async () => DOOR.afterStop(s2, 'sess-lb-1', { broadcastToSession: bcast, now, buffersDir: BUF, read: async () => ({ left: [{ pid: 9101, comm: 'node', start: AFTER }], kept: [], scan: { cut: true } }) });
  const withRows = await rowsCut();
  ok(!!withRows && withRows.unread === 'cut' && withRows.left.length === 1, '③ beside NAMED rows the caveat is always carried (a cut list never reads as a whole one), whatever was said before', withRows);
  said.length = 0;
  let askedRemote = null;
  const remote = await DOOR.afterStop(sess({ host: 'h-2', keeperSid: 'k-7' }), 'sess-lb-1', { broadcastToSession: bcast, now, hosts: { get: () => ({ name: 'Studio Mac' }), deviceBounded: async () => ({ leftBehind: async (o) => { askedRemote = o; return { left: [{ pid: 4242, comm: 'node', start: 1 }], kept: [], scan: { cut: false } }; } }) } });
  ok(!!remote && remote.machine === 'Studio Mac' && remote.door === false && remote.left[0].pid === 4242 && !!askedRemote && askedRemote.sid === 'k-7' && askedRemote.mark === MARK, '③ a paired machine: read through its agent\'s op (the keeper sid names the chain\'s record there), named with the machine, and NO door yet', remote);
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
  const NODE = path.basename(process.execPath);   // the planted processes run THIS node: named by its base name on every Node (Node 24 calls its main thread «MainThread»)
  const row = (p) => { const s = LB.statOf(fs.readFileSync(`/proc/${p}/stat`, 'utf8')); return { pid: p, start: s.start, comm: s.comm }; };   // the row as the read would list it
  let off = () => { };
  try {
    const cli = run({ CLAUDE_WEBUI_SESSION_ID: id });   // the conversation's own CLI, known by its record
    const mine = run({ CLAUDE_WEBUI_SESSION_ID: id }), theirs = run({ CLAUDE_WEBUI_SESSION_ID: `${id}-other` });
    const job = await runJob();
    off = PI.keepOut('left-behind-test-job', () => [[job.holder, 0]]);
    await sleep(150);
    const r = await LB.leftBehind({ mark, ageMs: 5000, keep: PI.keptOut([]), recordPids: [cli] });
    ok(r.left.some((x) => x.pid === mine && x.comm === NODE) && !r.left.some((x) => x.pid === theirs || x.pid === cli), '④ a REAL detached process carrying this conversation\'s mark is found, named by its program (this suite\'s own node); another conversation\'s is not, nor the conversation\'s own recorded CLI', { left: r.left, scan: r.scan });
    ok(!r.left.concat(r.kept).some((x) => x.pid === job.child) && r.scan.held >= 1, '④ a REAL hub job\'s child carrying the SAME mark is never named — held out by the hub\'s own record of the job, never by a name', { left: r.left, job });
    const noHeld = M.load('src/left-behind.js', anchored(SRC, "    if (by === 'held') { put(() => { out.scan.held++; }); return; }\n", '', 'B-69a7 the held exclusion (real)'), 'noheld-real');
    const rh = await noHeld.leftBehind({ mark, ageMs: 5000, keep: PI.keptOut([]), recordPids: [cli] });
    ok(rh.left.some((x) => x.pid === job.child), '④ RED CONTROL (no hub-held exclusion): the real job\'s child IS named', ids(rh.left));
    const session = { _leftBehind: [{ at: 7, mark, rows: [row(mine)] }] };
    const refused = await DOOR.endLeft(session, { by: null, at: 7 });
    const paired = await DOOR.endLeft({ host: 'h-2', _leftBehind: session._leftBehind }, { by: { kind: 'human' }, at: 7 });
    const wrongLine = await DOOR.endLeft(session, { by: { kind: 'human' }, at: 8 });
    ok(refused.reason === 'not-the-person' && paired.reason === 'paired-machine' && wrongLine.reason === 'nothing-listed' && session._leftBehind.length === 1, '④ a press that is not a person\'s is refused by name (not-the-person); on a paired machine there is no door yet (paired-machine); a line with no list here ends nothing', { refused, paired, wrongLine });
    const heldPress = await DOOR.endLeft({ _leftBehind: [{ at: 9, mark, rows: [row(job.child)] }] }, { by: { kind: 'human' }, at: 9, graceMs: 200 });
    ok(heldPress.ok && heldPress.held === 1 && heldPress.gone === 0 && heldPress.ended.length === 0 && alive(job.child), '④ a listed pid the hub holds AT THE PRESS (a job\'s) is never signalled — the held fence is applied again, and it is said as held, never «already ended»', heldPress);
    const reused = await DOOR.endLeft({ _leftBehind: [{ at: 1, mark, rows: [{ pid: mine, start: 1, comm: 'node' }] }] }, { by: { kind: 'human' }, at: 1, graceMs: 200 });
    ok(reused.ok && reused.gone === 1 && reused.ended.length === 0 && alive(mine), '④ a listed pid whose start time is not the one read (a reused pid) is NEVER signalled (counted gone)', reused);
    // the press's own re-check: a row that cannot be read again stays listed and is said; a failed press keeps its list; one press at a time
    const sUn = { _leftBehind: [{ at: 3, mark, rows: [row(mine)] }] };
    const unreadPress = await DOOR.endLeft(sUn, { by: { kind: 'human' }, at: 3, still: async () => 'unread' });
    ok(unreadPress.ok && unreadPress.unread === 1 && unreadPress.ended.length === 0 && Array.isArray(sUn._leftBehind) && sUn._leftBehind[0].rows.length === 1 && alive(mine), '④ a row that cannot be read again at the press is NOT ended, stays listed, and is said (press again)', { unreadPress, list: sUn._leftBehind });
    const failPress = await DOOR.endLeft(sUn, { by: { kind: 'human' }, at: 3, end: async () => { throw new Error('boom'); }, still: async (rw) => ({ pid: rw.pid, starttime: rw.start, comm: rw.comm }) });
    ok(failPress.ok === false && failPress.reason === 'press-failed' && Array.isArray(sUn._leftBehind) && sUn._leftBehind[0].rows.length === 1 && alive(mine), '④ a press that fails is SAID (press-failed) and keeps its list — a second press still finds it', { failPress, list: sUn._leftBehind });
    let freeEnd = null;
    const slow = DOOR.endLeft(sUn, { by: { kind: 'human' }, at: 3, still: async (rw) => ({ pid: rw.pid, starttime: rw.start, comm: rw.comm }), end: () => new Promise((res) => { freeEnd = () => res({ ended: [], left: [], stale: 0 }); }) });
    await sleep(20);
    const second = await DOOR.endLeft(sUn, { by: { kind: 'human' }, at: 3 });
    if (freeEnd) freeEnd();
    await slow;
    ok(second.ok === false && second.reason === 'already-pressed', '④ one press at a time on a line: a second press while the first runs is said (already-pressed)', second);
    const budgets = [];
    await DOOR.endLeft({ _leftBehind: [{ at: 4, mark, rows: [row(mine), row(theirs)] }] }, { by: { kind: 'human' }, at: 4, still: async (rw, mk, o) => { budgets.push(o.maxMs); return 'gone'; } });
    ok(budgets.length === 2 && budgets.every((b) => b > 0 && b <= 1500) && budgets[1] <= budgets[0], '④ the press\'s re-checks share ONE deadline (each row gets what is left of it, never a fresh bound each)', budgets);
    const dProc = fakeProc([{ pid: 9810, comm: 'fusey', start: AFTER, ppid: 1, env: [MARK], threadD: true }]);
    const dCheck = await LB.stillLeft({ pid: 9810, start: AFTER }, MARK, { procRoot: dProc });
    const noD = M.load('src/left-behind.js', anchored(SRC, "if (s && s.state === 'D') return null; }", '}', 'B-69a7 the D-thread check'), 'nod');
    const dMut = await noD.stillLeft({ pid: 9810, start: AFTER }, MARK, { procRoot: dProc });
    ok(dCheck === 'unread' && !!dMut && typeof dMut === 'object', '④ the press\'s own environ read has the scan\'s stuck check: a process with a thread in D is never read at the press («unread») — RED CONTROL: without the check it is read', { dCheck, dMut });
    const fifoProc = fakeProc([{ pid: 9800, comm: 'held', start: AFTER, ppid: 1, fifo: true }]);
    const stuckCheck = await LB.stillLeft({ pid: 9800, start: AFTER }, MARK, { procRoot: fifoProc, maxMs: 200 });
    for (const f of fifos) release(f);
    ok(stuckCheck === 'unread', '④ the press\'s own environ read has the scan\'s stuck check and time bound: a read that never returns answers «unread», never hangs the press', stuckCheck);
    const ended = await DOOR.endLeft(session, { by: { kind: 'human' }, at: 7, graceMs: 1000 });
    for (let k = 0; k < 50 && alive(mine); k++) await sleep(20);
    ok(ended.ok && ended.ended.includes(NODE) && !alive(mine) && alive(theirs) && alive(job.child) && alive(cli) && session._leftBehind === null, '④ «End them» (a person\'s press on its line): the listed process re-checked and ended; it says what ended; the other conversation\'s, the job\'s and the conversation\'s own untouched', ended);
    const noStart = M.load('src/left-behind.js', anchored(SRC, " || s.start !== Number(start)) { v = 'gone'; return; }", ") { v = 'gone'; return; }", 'B-69a7 the start-time check at the press'), 'nostart');
    const victim = run({ CLAUDE_WEBUI_SESSION_ID: id });
    await sleep(150);
    const m2 = await noStart.stillLeft({ pid: victim, start: 1 }, mark);
    ok(!!m2 && typeof m2 === 'object' && m2.pid === victim, '④ RED CONTROL (no start-time check at the press): a row with the wrong start time passes the re-check', m2);
  } finally {
    off();
    for (const f of fifos) release(f);
    for (const p of live) { try { if (fs.readFileSync(`/proc/${p}/cmdline`, 'utf8').includes('setTimeout')) process.kill(p, 'SIGKILL'); } catch { } }
  }
}

console.log('— ⑤ the «End them» line after a press (the page): the latest outcome in place, never appended');
{
  const { endLineWords } = await import(new URL('../src/lib/left-behind-line.js', import.meta.url));
  const base = 'Stopped — Its command tool left 1 process(es) running: node';
  const first = endLineWords(base, ['Already ending them']), second = endLineWords(base, ['Ended: node', '1 had already ended']), none = endLineWords(base, []);
  console.log(`    (after a first press: «${first}» · after a second: «${second}»)`);
  ok(first === `${base} — Already ending them` && second === `${base} — Ended: node · 1 had already ended` && none === base,
    '⑤ PURE endLineWords: the line\'s own words, then the LATEST press\'s outcome only — a second press says its outcome in place of the first', { first, second, none });
  const CV = fs.readFileSync(path.join(REPO, 'src/lib/chat-view.js'), 'utf8'), at = CV.indexOf('  _endLeftBehind(btn, words, at) {');
  const body = at >= 0 ? CV.slice(at, CV.indexOf('\n  }\n', at)) : '';
  ok(body.includes('words.textContent = endLineWords(words.dataset.base || words.textContent, said);') && !/words\.textContent \+=/.test(body) && CV.includes('words.dataset.base = words.textContent;'),   // stale-pins: kept — a deliberate absence check: the press must never append to the line
    '⑤ the page sets the line from its OWN words + the latest outcome (src/lib/chat-view.js _endLeftBehind) — no `textContent +=` left in the press', { found: at >= 0 });
}

console.log('— ⑥ a reload draws the line again (B-69a7 remainder (d)): the hub keeps what it said, an attach carries it');
{
  const said = [];
  const bcast = (s, id, m) => said.push(m);
  const sess = { backend: 'claude', _userInputAt: NOW - TURN_AGE, pty: { pid: 9300 }, _childPid: 9303 };
  const opts = (at, left) => ({ broadcastToSession: bcast, now: () => at, buffersDir: ROOT, read: async () => ({ left, kept: [], scan: { cut: false } }) });
  await DOOR.afterStop(sess, 'sess-lb-1', opts(NOW, [{ pid: 9101, comm: 'node', start: AFTER }]));
  const l1 = DOOR.linesOf(sess);
  console.log(`    (after a Stop the attach would carry: ${JSON.stringify(l1)})`);
  ok(l1.length === 1 && l1[0].at === NOW && l1[0].door === true && l1[0].left[0].comm === 'node' && JSON.stringify(l1[0]) === JSON.stringify(said[0].data),
    '⑥ the line a settled Stop SAID is kept: an attach (a reload) carries it as it was said, with its door while its End list stands', l1);
  const pressed = await DOOR.endLeft(sess, { by: { kind: 'human' }, at: NOW, still: async (rw) => ({ pid: rw.pid, starttime: rw.start, comm: rw.comm }), end: async (m) => ({ ended: m, left: [], stale: 0 }) });
  ok(pressed.ok && DOOR.linesOf(sess).length === 0, '⑥ a press that ended everything the line named: the line is no longer kept (a reload has nothing of it left to tell)', DOOR.linesOf(sess));
  await DOOR.afterStop(sess, 'sess-lb-1', opts(NOW + 1, [{ pid: 9102, comm: 'python3', start: AFTER }]));
  await DOOR.endLeft(sess, { by: { kind: 'human' }, at: NOW + 1, still: async () => 'unread' });
  const l2 = DOOR.linesOf(sess);
  ok(l2.length === 1 && l2[0].door === true, '⑥ a press that could not read a row again keeps the line and its door (press again — after a reload too)', l2);
  for (let k = 2; k < 7; k++) await DOOR.afterStop(sess, 'sess-lb-1', opts(NOW + k, [{ pid: 9200 + k, comm: 'sleep', start: AFTER }]));
  const l3 = DOOR.linesOf(sess);
  ok(l3.length === 4 && l3[0].at === NOW + 3 && l3[3].at === NOW + 6, '⑥ at most four lines are kept, newest last (as the End lists)', l3.map((x) => x.at));
  const paired = { backend: 'claude', host: 'h-2', _userInputAt: NOW - TURN_AGE };
  await DOOR.afterStop(paired, 'sess-lb-1', { broadcastToSession: bcast, now: () => NOW, hosts: { get: () => ({ name: 'Studio Mac' }), deviceBounded: async () => ({ leftBehind: async () => ({ left: [{ pid: 4242, comm: 'node', start: 1 }], kept: [], scan: { cut: false } }) }) } });
  const lp = DOOR.linesOf(paired);
  ok(lp.length === 1 && lp[0].door === false && lp[0].machine === 'Studio Mac', '⑥ a paired machine\'s line is kept too — named with its machine, no door', lp);
  // the attach and the page (source: the payload names it; the page draws it after the history, again only when its element is gone)
  const WH = fs.readFileSync(path.join(REPO, 'src/ws-handler.js'), 'utf8'), CV = fs.readFileSync(path.join(REPO, 'src/lib/chat-view.js'), 'utf8');
  const draws = CV.split("if (Array.isArray(meta.leftBehind)) for (const d of meta.leftBehind) this._sayLeftBehind(d || {});").length - 1;
  ok(WH.includes("leftBehind: (() => { try { return require('./server/left-behind-door.js').linesOf(session); } catch { return []; } })(),") && draws === 2
    && CV.includes('const had = d.at ? seen.get(d.at) : null;') && CV.includes('if (had && had.isConnected) return;'),
    '⑥ the chat attach carries linesOf(session); the page draws them after the history on BOTH of its roads (the identical slab and the full one) and a line again only when its element is gone', { draws });
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
report();

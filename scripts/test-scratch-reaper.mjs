// THE SCRATCH-ORPHAN REAPER JUDGES BY ITS ROOTS' OWNERSHIP EVIDENCE, ONE SWEEP AT A TIME (B-1d08, 2026-09-29).
//
// Three incidents in one day: ① two lanes ran `ci.mjs` fast tiers at once and one run's sweep reaped the stray another
// run's suite had just planted (under a scratch dir that suite had already removed — exit 144); ② a coordinator's
// `node scripts/ci.mjs --check-heavy > /tmp/vs-checkheavy.txt` was killed by a lane's fast tier: a FILE with the scratch
// shape was read as a gone root; ③ the reaper's actual target — a finished verifier's scratch server left 15
// `vibespace-device` daemons re-parented to systemd for an hour — must stay in reach.
//
// The rule under test (scripts/ci.mjs judgeScratch + scripts/scratch-run.mjs): a candidate is convicted only when
// (a) the root it names is a DIRECTORY under the scratch prefix, (b) that root's OWNER — the run record
// `<root>/.vs-run.json` (pid + starttime + boot) — is gone, or the dir is gone with it, and (c) it is older than the
// stale floor; a process naming ANY root whose owner is alive is never a candidate; the sweep takes a machine-wide
// flock(1) and a sweep that cannot get it skips and says so.
//
// Every leg is in-process over a FAKE proc root, except four DRY legs over the real /proc (the real processes this
// suite planted — each rooted under a root with a LIVE owner record or naming only a FILE, so no sweep on the box, on
// this code or older, can take one for litter: a live owner / a file is never a root here, and older code spares a
// process younger than the stale floor under an existing path) and the two-sweeps leg (two node children driving the
// REAL reaper over a fake proc root whose one victim is a process this suite started). Nothing but this suite's own
// processes is ever signalled, each by pid + starttime.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { judgeScratch, scratchOrphans, reapScratchOrphans, reapScratchOrphansAsync, reapByHand, acquireReaperLock, acquireReaperLockAsync, verdictReport, scratchRootClaims, SCRATCH_ROOT_RE, REAPER_LOCK_WAIT_MS, defaultReaperLockPath } from './ci.mjs';
import { scratch, scratchDir, scratchHome, stampScratchRun, readRunRecord, runOwnerState, RUN_RECORD, endDaemonsOf, endRootedProcesses } from './scratch.mjs';
import { procStat, procUid, machineBootId, makeRunRecord, procBootMs, procBornMs } from './scratch-run.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const FG = require('../src/fixture-guard.js');
let pass = 0, fail = 0;
const ok = (cond, name, detail) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); } };
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NOW = Date.now(), OLD = NOW - 30 * 60 * 1000, HOUR_AGO = NOW - 60 * 60 * 1000;
const LATER = () => Date.now() + 60 * 60 * 1000;   // a clock past the stale floor, for the DRY legs over the real /proc

// ── this suite's scratch: /tmp/vs-reaper-<pid> (made + owned here) and its siblings /tmp/vs-reaper-<pid>-<leg> ──
const MAIN = scratchDir('reaper');
const made = [MAIN];
const sib = (tag) => `${MAIN}-${tag}`;
const mkRoot = (tag) => { const d = sib(tag); fs.mkdirSync(d, { recursive: true }); made.push(d); return d; };
const writeRecord = (dir, rec) => fs.writeFileSync(path.join(dir, RUN_RECORD), JSON.stringify(rec) + '\n');
// a process with no scratch root in its cwd / env / argv: a REAL process runs in `/` with HOME `/`; a FAKE one names a
// literal home outside /tmp — never os.homedir(), which is itself a /tmp/vs-* scratch dir when a gate runs under a scratch HOME
const QUIET_CWD = '/';
const QUIET_ENV = { PATH: process.env.PATH, HOME: '/' };
const FAKE_HOME = '/home/reaper-owner';
const planted = [];   // [{pid, starttime, group}] — ended in `finally`, each by pid + starttime
const plant = (pid, { group = false } = {}) => { const st = procStat(pid); if (pid > 0 && st) planted.push({ pid, starttime: st.starttime, group }); return st; };
const endPlanted = () => {
  for (const p of planted) {
    const st = procStat(p.pid);
    if (!st || st.starttime !== p.starttime) continue;   // gone, or the number is somebody else's now
    try { process.kill(p.group ? -p.pid : p.pid, 'SIGKILL'); } catch { try { process.kill(p.pid, 'SIGKILL'); } catch { } }
  }
};
// a symlink first (rmSync follows a DANGLING link to its missing target and removes nothing), then the dirs + files
process.on('exit', () => { endPlanted(); for (const d of made) { try { if (fs.lstatSync(d).isSymbolicLink()) { fs.unlinkSync(d); continue; } } catch { continue; } try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } });

/** A FAKE proc root: /proc/<pid>/{stat,cmdline,environ,cwd} + sys/kernel/random/boot_id. */
function fakeProc(tag, bootId = 'boot-now') {
  const root = path.join(MAIN, 'proc-' + tag);
  fs.mkdirSync(path.join(root, 'sys', 'kernel', 'random'), { recursive: true });
  fs.writeFileSync(path.join(root, 'sys', 'kernel', 'random', 'boot_id'), bootId + '\n');
  const mk = (pid, { name, argv, raw = null, ppid = 1, cwd = FAKE_HOME, env = {}, born = NOW, state = 'S', starttime = 12345 }) => {
    const d = path.join(root, String(pid)); fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, 'stat'), `${pid} (${name.slice(0, 15)}) ${state} ${ppid} ${pid} ${pid} 0 -1 4194560 0 0 0 0 0 0 0 0 20 0 1 0 ${starttime} 0 0`);
    fs.writeFileSync(path.join(d, 'cmdline'), raw != null ? raw : (argv || [name]).join('\0') + '\0');
    fs.writeFileSync(path.join(d, 'environ'), Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\0') + '\0');
    fs.symlinkSync(cwd, path.join(d, 'cwd'));
    fs.utimesSync(d, born / 1000, born / 1000);
  };
  mk(1, { name: 'systemd', argv: ['/usr/lib/systemd/systemd', '--user'], ppid: 0, cwd: '/' });
  return { root, mk };
}

try {
// ── §1 THE RUN RECORD ────────────────────────────────────────────────────
console.log('\n§1 the run record (scripts/scratch-run.mjs)');
{
  const rec = readRunRecord(MAIN), me = procStat(process.pid);
  ok(!!rec && rec.v === 1 && rec.pid === process.pid && rec.starttime === me.starttime && me.starttime > 0 && rec.bootId === machineBootId() && rec.bootId.length > 0 && typeof rec.run === 'string' && rec.run.length > 0,
    `scratch.mjs scratchDir() creates the dir AND stamps ${RUN_RECORD}: this pid, its starttime, this boot, a run id (${JSON.stringify(rec)})`);
  ok(runOwnerState(rec).alive === true && /is alive$/.test(runOwnerState(rec).why), `the owner of a root this process made is ALIVE (${runOwnerState(rec).why})`);
  fs.rmSync(path.join(MAIN, RUN_RECORD));
  const home = scratchHome('reaper', fs, ['.vibespace']);
  const hrec = readRunRecord(home);
  ok(home === MAIN && !!hrec && hrec.pid === process.pid && fs.existsSync(path.join(home, '.vibespace')), 'scratchHome() stamps its home too (the server it hosts detaches its device daemon under it — litter exactly when this suite is gone)');
  const child = Number(String(spawnSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf8' }).stdout || '').trim());
  const deadRec = makeRunRecord({ pid: child });
  ok(child > 0 && deadRec.starttime === 0, `a record made for a process that has exited carries no starttime (pid ${child}: ${deadRec.starttime})`);
  const noProof = mkRoot('noproof'); writeRecord(noProof, deadRec);
  ok(readRunRecord(noProof) === null, '…and readRunRecord refuses it: a record that cannot prove an identity is NO record (the record-less rule judges that root)');
  const bad = mkRoot('badrec'); fs.writeFileSync(path.join(bad, RUN_RECORD), '{"pid": 4');
  ok(readRunRecord(bad) === null && readRunRecord(sib('nowhere')) === null, 'a torn record and a missing one are both null — never an owner');
  const F = fakeProc('owners');
  F.mk(4100, { name: 'node', starttime: 5000 });
  F.mk(4300, { name: 'node', starttime: 9999 });
  F.mk(4500, { name: 'node', starttime: 4500, state: 'Z' });
  const st = (r) => runOwnerState(r, { procRoot: F.root });
  ok(st({ run: 'r', pid: 4100, starttime: 5000, bootId: 'boot-now' }).alive === true, 'alive: the pid on this boot with the recorded starttime');
  ok(/pid 4200 is gone$/.test(st({ run: 'r', pid: 4200, starttime: 7000, bootId: 'boot-now' }).why) && !st({ pid: 4200, starttime: 7000, bootId: 'boot-now' }).alive, 'dead: the pid is gone');
  ok(/was reused \(starttime 9999 ≠ recorded 3000\)$/.test(st({ run: 'r', pid: 4300, starttime: 3000, bootId: 'boot-now' }).why), 'dead: the pid was REUSED — same number, another starttime (the pid-wrap rule: a pid is not an identity)');
  ok(/from another boot$/.test(st({ run: 'r', pid: 4100, starttime: 5000, bootId: 'boot-old' }).why), 'dead: a record from another boot, even when this boot has the same pid AND starttime');
  ok(/has exited \(a zombie\)$/.test(st({ run: 'r', pid: 4500, starttime: 4500, bootId: 'boot-now' }).why), 'dead: a zombie (exited, not yet reaped by its parent)');
  // verify r3 (T4): a FORGED record naming pid 1 — init, root's, alive for the whole boot, its starttime real — read as an owner
  // alive for ever (reproduced: a seam under such a root accepted by `--reap --dry-run`, a reparented process under it spared an
  // hour later); the owner must be a process of THIS uid, read off /proc/<pid>/status (real uid, readable whatever the process's dumpable state)
  const init = procStat(1), forged = { run: 'forged', pid: 1, starttime: init.starttime, bootId: machineBootId(), createdAt: NOW };
  ok(init.starttime > 0 && procUid(1) === 0 && process.getuid() !== 0 && runOwnerState(forged).alive === false && new RegExp(`^run forged pid 1 is another user's process \\(uid 0, not ${process.getuid()}\\)$`).test(runOwnerState(forged).why),
    `dead: a record naming pid 1 (init: uid 0, starttime ${init.starttime}) is another user's process, never an owner (${runOwnerState(forged).why})`);
  ok(runOwnerState(forged, { uid: 0 }).alive === true && runOwnerState({ run: 'r', pid: 4100, starttime: 5000, bootId: 'boot-now' }, { procRoot: F.root }).alive === true && procUid(4100, F.root) === null,
    'the uid is the caller\'s (asked as root, init is an owner); a fake table has no status file, so its rows carry no uid and the other facts decide');
  ok(SCRATCH_ROOT_RE.source === '^' + (FG.TMP_ROOTS[0] + '/' + FG.FIXTURE_CWD_PREFIX).replace(/\//g, '\\/') + '[A-Za-z0-9._-]+' && SCRATCH_ROOT_RE.test(MAIN) && !SCRATCH_ROOT_RE.test(FAKE_HOME),
    `the scratch prefix is src/fixture-guard.js's: ${FG.TMP_ROOTS[0]}/${FG.FIXTURE_CWD_PREFIX}* — what scratch.mjs mints (this suite's own root matches, the lane home does not)`);
}

// ── §2 THE THREE FACTS, OVER A FAKE PROC ROOT ────────────────────────────
console.log('\n§2 (a) a root is a directory · (b) its owner is gone · (c) it is old — over a fake proc root');
const F = fakeProc('rule');
const R = {
  other: mkRoot('other'), dead: mkRoot('dead'), reused: mkRoot('reused'), boot: mkRoot('boot'), zombie: mkRoot('zombie'),
  legacy: mkRoot('legacy'), legacy2: mkRoot('legacy2'), badrec: mkRoot('badrec2'),
  file: sib('file.txt'), checkheavy: sib('checkheavy.txt'), link: sib('link'),
  goneA: sib('gone-a'), goneB: sib('gone-b'), goneC: sib('gone-c'), goneD: sib('gone-d.json'), goneE: sib('gone-e'), goneF: sib('gone-f'),
};
fs.writeFileSync(R.file, 'the coordinator\'s log\n'); made.push(R.file);
const linkTarget = path.join(MAIN, 'link-target'); fs.mkdirSync(linkTarget); fs.symlinkSync(linkTarget, R.link); made.push(R.link);
writeRecord(R.other, { v: 1, run: 'lane-b', pid: 4100, starttime: 5000, bootId: 'boot-now', createdAt: NOW });
writeRecord(R.dead, { v: 1, run: 'verifier', pid: 4200, starttime: 7000, bootId: 'boot-now', createdAt: HOUR_AGO });
writeRecord(R.reused, { v: 1, run: 'wrapped', pid: 4300, starttime: 3000, bootId: 'boot-now', createdAt: HOUR_AGO });
writeRecord(R.boot, { v: 1, run: 'yesterday', pid: 4400, starttime: 4400, bootId: 'boot-old', createdAt: HOUR_AGO });
writeRecord(R.zombie, { v: 1, run: 'zombied', pid: 4500, starttime: 4500, bootId: 'boot-now', createdAt: HOUR_AGO });
fs.writeFileSync(path.join(R.badrec, RUN_RECORD), 'not json');
F.mk(4100, { name: 'node', starttime: 5000 });            // lane B's suite: ALIVE
F.mk(4300, { name: 'bash', starttime: 9999 });            // pid 4300 is somebody else now
F.mk(4400, { name: 'node', starttime: 4400 });            // same pid + starttime, but the record is from another boot
F.mk(4500, { name: 'node', starttime: 4500, state: 'Z' });
F.mk(610, { name: 'gnome-terminal-server', argv: ['/usr/libexec/gnome-terminal-server'] });
// (b) a live owner spares — a foreign stray lane B planted, stale + orphaned + named `node`: the name rule would take it
F.mk(500, { name: 'node', argv: ['node', '-e', 'setTimeout(()=>{},9e5)', `${R.other}/x`], born: OLD });
F.mk(501, { name: 'node', argv: ['node', 'server.js'], cwd: R.other, born: OLD });
F.mk(580, { name: 'node', argv: ['node', 'x.js'], cwd: R.goneF, env: { HOME: R.other }, born: OLD });   // cwd gone, HOME live-owned ⇒ spared
// (a) never a root: a file (present, or gone and never shown to be a directory), a symlink, a bare gone path, a file-typed env
F.mk(510, { name: 'sh', argv: ['sh', '-c', 'sleep 60; :', 'sh', R.file], born: OLD });                                                  // incident ②'s shape: a shell with a /tmp/vs-*.txt argument
F.mk(511, { name: 'node', raw: `node scripts/ci.mjs-probe --check-heavy > ${R.checkheavy}`, born: OLD });                                // incident ② as it was READ: a /tmp/vs-* name nothing proves a directory, gone
F.mk(562, { name: 'node', argv: ['node', R.goneB], born: OLD });
F.mk(564, { name: 'agent-browser', argv: ['agent-browser'], env: { AGENT_BROWSER_CONFIG: R.goneD }, born: OLD });
F.mk(570, { name: 'node', argv: ['node', 'x.js'], cwd: R.link, born: OLD });
// verify r1 (K1): a name the shape does not cover — an EXISTING dir whose name goes on with an excluded character — names no root
const PLUS = MAIN + '+x'; fs.mkdirSync(PLUS + '/sub', { recursive: true }); made.push(PLUS);
F.mk(571, { name: 'node', argv: ['node', 'x.js'], cwd: PLUS + '/sub', born: OLD });
F.mk(572, { name: 'node', argv: ['node', PLUS + '/y'], born: OLD });
// verify r2 (R4): the kernel's ` (deleted)` marker on a cwd that WAS the scratch root itself (what readlink says once the
// dir is unlinked — the isolated tiers run every suite with cwd = the worktree root): the root is named, and it is gone
F.mk(573, { name: 'vibespace-device', argv: ['vibespace-device'], cwd: `${R.goneA} (deleted)`, born: HOUR_AGO });
F.mk(574, { name: 'node', argv: ['node', 'x.js'], cwd: `${R.other} (deleted)`, born: OLD });   // verify r3 (T2): the path recreated (a live record there) — the process's OWN directory is gone: the dir-gone rule's, never the new record's
// verify r3 (T2): a directory a person literally named "… (deleted)" (linked: the kernel's stat says nlink 2) keeps its name, which the shape does not cover
const LIT = sib('lit') + ' (deleted)'; fs.mkdirSync(LIT); made.push(LIT);
F.mk(577, { name: 'node', argv: ['node', 'x.js'], cwd: LIT, born: OLD });
// verify r3 (T7): the deleted directory's PATH now holds a FILE — the kernel's gone cwd is a gone root whatever the path holds (the r3 revert
// table found the claim's `gone` short-circuit uncaught: without it the path's kind ("a file, not a directory") read the stray as no root)
F.mk(578, { name: 'vibespace-device', argv: ['vibespace-device'], cwd: `${R.file} (deleted)`, born: HOUR_AGO });
// verify r4 (X2b): the kernel's stat is asked ONLY for a cwd the scratch shape covers — through the magic link it reaches the cwd's own
// filesystem, and on a hung FUSE / NFS mount it blocks in D state (a frozen bindfs held the judge until SIGKILL; SIGTERM does not end
// the wait). A (deleted) cwd OUTSIDE /tmp/vs-* (a shell left in a removed worktree on a network mount) is never stat'd; 573's is.
// Observed by a spy on fs.statSync around the judge below (the module and this suite share node:fs's one object).
const OUTSIDE_DEL = path.join(FAKE_HOME, 'wt-removed') + ' (deleted)';
F.mk(579, { name: 'bash', argv: ['bash'], cwd: OUTSIDE_DEL, born: HOUR_AGO });
// verify r4 (X2c): a cwd in ANOTHER MOUNT NAMESPACE — the kernel prints a plain scratch-shaped path this namespace does not have (ENOENT ⇒
// "gone" by path) while the stat through the magic link finds a LINKED directory: not a gone root, never a group (measured on the real
// kernel under `sudo unshare -m`, a child of this uid: head convicted it "scratch dir gone"). Modelled: the root `exists` denies (NS_EXISTS)
// while the cwd link resolves to a directory that is there; judged in its own call below (the main run keeps the dir: the record-less rule).
const NSROOT = mkRoot('ns'); fs.mkdirSync(path.join(NSROOT, 'sub'));
const NS_EXISTS = (r) => r !== NSROOT && fs.existsSync(r);
F.mk(581, { name: 'sleep', argv: ['sleep', '600'], cwd: path.join(NSROOT, 'sub'), born: HOUR_AGO });
// verify r2 (R4): a path is NORMALIZED before the shape is read — `<gone>/../<live>/x` names the LIVE root, not the gone one it walks through
const DOTDOT = `${R.goneA}/../${path.basename(R.other)}`;
F.mk(575, { name: 'node', argv: ['node', 'x.js'], cwd: '/', env: { HOME: `${DOTDOT}/home` }, born: OLD });
F.mk(576, { name: 'node', argv: ['node', `${DOTDOT}/x.js`], born: OLD });
// (b) the owner is gone: dead / reused / another boot / a zombie / the dir gone — (c) once old; evidence, not names
F.mk(520, { name: 'sleep', argv: ['sleep', '3600'], cwd: R.dead, born: OLD });
F.mk(521, { name: 'node', argv: ['node', 'young.js'], cwd: R.dead });                                                                   // young ⇒ spared
F.mk(522, { name: 'node', argv: ['node', 'owned.js'], ppid: 610, cwd: R.dead, born: OLD });                                           // owned by a live terminal ⇒ spared
for (const p of [525, 526, 527]) F.mk(p, { name: 'vibespace-device', argv: ['vibespace-device'], cwd: '/', env: { HOME: R.dead, VIBESPACE_DEVICE_ROOT: `${R.dead}/device` }, born: HOUR_AGO });   // incident ③: a finished verifier's daemons, an hour old
F.mk(530, { name: 'node', argv: ['node', 'x.js'], cwd: R.reused, born: OLD });
F.mk(540, { name: 'node', argv: ['node', 'x.js'], cwd: R.boot, born: OLD });
F.mk(550, { name: 'node', argv: ['node', 'x.js'], cwd: R.zombie, born: OLD });
F.mk(560, { name: 'node', argv: ['node', 'x.js'], cwd: R.goneA, born: OLD });
F.mk(561, { name: 'node', argv: ['node', '-e', 'planted'], cwd: R.goneA });                                                             // incident ①: a stray just planted under a removed dir ⇒ spared
F.mk(563, { name: 'node', argv: ['node', `${R.goneC}/sub/x.js`], born: OLD });                                                          // a gone path that goes on beneath its root ⇒ was a directory
F.mk(565, { name: 'agent-browser', argv: ['agent-browser'], env: { AGENT_BROWSER_CONFIG: `${R.goneE}/cfg.json` }, born: OLD });
// an existing dir with NO record: the pre-record rule (all unowned + stale, then only the executables a suite starts)
F.mk(590, { name: 'node', argv: ['node', 'x.js'], cwd: R.legacy, born: OLD });
F.mk(591, { name: 'sleep', argv: ['sleep', '9'], cwd: R.legacy, born: OLD });
F.mk(595, { name: 'node', argv: ['node', 'x.js'], cwd: R.legacy2 });
F.mk(620, { name: 'node', argv: ['node', 'x.js'], cwd: R.badrec, born: OLD });
const ci_claims_plus = () => scratchRootClaims({ cwd: PLUS + '/sub', env: { HOME: PLUS + '/' }, argv: ['node', PLUS + '/y', '--flag=' + PLUS + '/z'] }).length + scratchRootClaims({ cwd: '/', env: {}, argv: ['node ' + PLUS + '/y --user-data-dir=' + PLUS + '/p'] }).length;
const statSpy = (fn) => { const seen = []; const real = fs.statSync; fs.statSync = function (p, ...a) { seen.push(String(p)); return real.call(fs, p, ...a); }; try { return { out: fn(), seen }; } finally { fs.statSync = real; } };
const cwdLink = (root, pid) => path.join(root, String(pid), 'cwd');
const { out: V, seen: V_STATS } = statSpy(() => judgeScratch({ procRoot: F.root, now: NOW, self: 999999 }));
const ids = (l) => l.map((o) => o.pid).sort((a, b) => a - b);
const EXPECT = [520, 525, 526, 527, 530, 540, 550, 560, 563, 565, 573, 574, 578, 590, 620];
const find = (l, pid) => l.find((o) => o.pid === pid) || null;
{
  ok(JSON.stringify(ids(V.victims)) === JSON.stringify(EXPECT), `exactly the orphans of gone owners + the record-less stale suite executables (got ${JSON.stringify(ids(V.victims))})`);
  ok(/its root's owner is alive \(run lane-b pid 4100 is alive\)/.test((find(V.spared, 500) || {}).why || '') && find(V.spared, 501) && !find(V.victims, 500),
    'THE BRIEF\'S LEG: a planted foreign process naming /tmp/vs-<other>/x whose owner is alive SURVIVES — stale, orphaned and named `node` though it is');
  ok(/owner is alive/.test((find(V.spared, 580) || {}).why || ''), 'a process naming ANY root whose owner is alive is spared, whatever else it names (its cwd is a gone root, its HOME a live one)');
  ok(/is a file, not a directory/.test((find(V.ignored, 510) || {}).why || '') && !find(V.victims, 510), 'THE BRIEF\'S LEG: a shell with a /tmp/vs-*.txt FILE argument SURVIVES — a file is never a root (incident ②)');
  ok(/is gone and its argv never showed it was a directory/.test((find(V.ignored, 511) || {}).why || '') && /is gone and its argv never showed/.test((find(V.ignored, 562) || {}).why || ''),
    'a gone /tmp/vs-* name no naming proves was a directory is no root — incident ② as the old sweep read it ("root gone"), and a bare gone argument');
  ok(/AGENT_BROWSER_CONFIG never showed/.test((find(V.ignored, 564) || {}).why || '') && find(V.victims, 565), 'AGENT_BROWSER_CONFIG names a FILE: equal to the gone root it proves nothing; going on beneath it (<root>/cfg.json) it proves a directory');
  ok(/is a symlink, not a directory/.test((find(V.ignored, 570) || {}).why || ''), 'a /tmp/vs-* symlink is a lookalike, never a root');
  const listedAnywhere = (pid) => !!(find(V.victims, pid) || find(V.spared, pid) || find(V.ignored, pid));
  ok(!listedAnywhere(571) && !listedAnywhere(572) && ci_claims_plus() === 0, `a process rooted in ${PLUS}/sub (a directory that EXISTS; ${MAIN} is its own root) names no scratch root — never "${MAIN} is gone" (verify r1 K1: the shape ends at a segment boundary)`);
  const dd = (o) => scratchRootClaims(o).map((c) => `${c.root}|${c.via}|${c.dirProof ? 'dir' : 'nodir'}`).join(' ');
  ok(/owner is alive/.test((find(V.spared, 575) || {}).why || '') && (find(V.spared, 575) || {}).root === R.other && /owner is alive/.test((find(V.spared, 576) || {}).why || '')
    && dd({ cwd: '/', env: { HOME: `${DOTDOT}/home` } }) === `${R.other}|HOME|dir` && dd({ cwd: '/', env: {}, argv: ['node', `${DOTDOT}/x.js`, `--flag=${DOTDOT}/y`] }) === `${R.other}|argv|dir` && dd({ cwd: '/', env: {}, argv: [`chrome --user-data-dir=${DOTDOT}/p`] }) === `${R.other}|--user-data-dir|dir ${R.other}|argv|dir`
    && dd({ cwd: `/tmp//vs-a/./x`, env: { HOME: '/tmp/vs-b/..' } }) === '/tmp/vs-a|cwd|dir' && dd({ cwd: '/', env: { HOME: '/tmp/vs-a/..' } }) === '',
    `verify r2 (R4): a path is normalized before the shape is read — HOME / argv / --user-data-dir through "<gone>/../<live>" name the LIVE root (its owner spares), "//" and "/." fold, "/tmp/vs-a/.." names nothing (${dd({ cwd: '/', env: { HOME: `${DOTDOT}/home` } })})`);
  const delClaims = scratchRootClaims({ cwd: `${R.goneA} (deleted)` });
  ok(delClaims.length === 1 && delClaims[0].root === R.goneA && delClaims[0].via === 'cwd' && delClaims[0].dirProof === true && delClaims[0].gone === true && (find(V.victims, 573) || {}).why === 'scratch dir gone' && find(V.victims, 573).via === 'cwd' && find(V.victims, 573).root === `${R.goneA} (deleted)`,
    `verify r2 (R4): a cwd that reads "<root> (deleted)" — the kernel's marker on an unlinked root — names that root (a directory, gone): the hour-old reparented daemon is reaped, its root printed as the kernel spells it (${JSON.stringify(delClaims)})`);
  // verify r3 (T2): the marker is the KERNEL's fact, read with the kernel's stat — (a) a process in the deleted inode of a path a NEW run
  // recreated is the dir-gone rule's (its own directory is gone; the record at the path is another directory's — r2 spared it by that
  // record, and the dbg-*.mjs fixed names (/tmp/vs-fixtest, twice over) make the shape real), (b) a directory literally named "… (deleted)"
  // is linked (nlink 2 — measured) and keeps its name: it names no root (r2's strip convicted a live reparented process there)
  ok((find(V.victims, 574) || {}).why === 'scratch dir gone' && find(V.victims, 574).root === `${R.other} (deleted)` && find(V.victims, 574).via === 'cwd' && !find(V.spared, 574),
    `verify r3 (T2): the process whose cwd is the DELETED inode of a path a live run recreated is reaped as dir-gone — the new record at that path is not its owner (${JSON.stringify(find(V.victims, 574) && find(V.victims, 574).root)})`);
  ok((find(V.victims, 578) || {}).why === 'scratch dir gone' && find(V.victims, 578).root === `${R.file} (deleted)` && !find(V.ignored, 578),
    `verify r3 (T7): a reparented hour-old daemon whose cwd the kernel says is gone is reaped as dir-gone even when its PATH now holds a file — never "${path.basename(R.file)} is a file, not a directory" (${JSON.stringify((find(V.victims, 578) || find(V.ignored, 578) || {}).why)})`);
  ok(!listedAnywhere(579) && !V_STATS.includes(cwdLink(F.root, 579)) && V_STATS.includes(cwdLink(F.root, 573)),
    `verify r4 (X2b): the (deleted) cwd outside the scratch shape (579) is never stat'd through its magic link — a hung mount there cannot hold the sweep — while the scratch-shaped one (573) is (stat'd: ${V_STATS.filter((p) => /\/cwd$/.test(p)).map((p) => path.basename(path.dirname(p))).join(' ')})`);
  const vNs = judgeScratch({ procRoot: F.root, now: NOW, self: 999999, exists: NS_EXISTS });
  ok(!vNs.victims.some((o) => o.pid === 581) && /not here, but the kernel finds its cwd a linked directory \(another mount namespace/.test((vNs.ignored.find((o) => o.pid === 581) || {}).why || '') && vNs.victims.some((o) => o.pid === 573),
    `verify r4 (X2c): the hour-old reparented daemon whose scratch-shaped cwd this namespace cannot see (gone by path, LINKED by the kernel's stat) names no root — never "scratch dir gone" — while the deleted cwd (573) still is (${JSON.stringify((vNs.ignored.find((o) => o.pid === 581) || vNs.victims.find((o) => o.pid === 581) || {}).why)})`);
  ok(!listedAnywhere(577) && scratchRootClaims({ cwd: LIT, cwdGone: false }).length === 0 && scratchRootClaims({ cwd: LIT }).length === 1,
    `verify r3 (T2): a process in an EXISTING directory literally named "${path.basename(LIT)}" is listed nowhere (the kernel's stat says linked: the marker is the name, the shape does not cover it); a string-only caller still trusts the marker`);
  const w = (pid) => (find(V.victims, pid) || {}).why || '';
  ok(/^owner gone: run verifier pid 4200 is gone$/.test(w(520)) && find(V.victims, 520).name === 'sleep', 'THE BRIEF\'S LEG: a process under a root whose owner pid is dead is reaped — whatever its name (an unlisted `sleep`)');
  ok([525, 526, 527].every((p) => /^owner gone: run verifier pid 4200 is gone$/.test(w(p)) && find(V.victims, p).via === 'HOME'), 'incident ③ stays in reach: a finished verifier\'s re-parented `vibespace-device` daemons (rooted by HOME, cwd /) are reaped');
  ok(/^owner gone: run wrapped pid 4300 was reused \(starttime 9999 ≠ recorded 3000\)$/.test(w(530)), 'THE BRIEF\'S LEG: a root whose owner pid was REUSED (same pid, another starttime) is judged dead — its orphan reaped');
  ok(/from another boot$/.test(w(540)) && /has exited \(a zombie\)$/.test(w(550)), 'an owner from another boot, and a zombie owner, are dead too');
  ok(w(560) === 'scratch dir gone' && find(V.victims, 560).via === 'cwd' && w(563) === 'scratch dir gone' && find(V.victims, 563).via === 'argv', 'a gone root proven a directory by the cwd, or by a path going on beneath it, is the owner gone with its dir');
  ok(/^young: /.test((find(V.spared, 561) || {}).why || '') && /^young: /.test((find(V.spared, 521) || {}).why || ''), '(c) a young orphan under a gone dir or a dead owner is SPARED — incident ①: one fast tier took the stray another run had just planted');
  ok(/owned by a live process outside the root/.test((find(V.spared, 522) || {}).why || ''), 'a member a live process outside the root parents is spared under a dead owner (a user\'s shell in the dir)');
  ok(/^orphaned 30 min \(no live suite owns /.test(w(590)) && /not an executable a suite starts/.test((find(V.spared, 591) || {}).why || '') && /youngest member/.test((find(V.spared, 595) || {}).why || ''),
    'a record-less existing dir keeps the pre-record rule: every member unowned + stale, then only the known executables');
  ok(/^orphaned/.test(w(620)), 'a torn record is no record: that root is judged by the record-less rule');
  ok(V.victims.every((o) => o.owner && Number.isFinite(o.ageMs) && o.via && o.root && o.starttime === 12345), 'every victim carries its EVIDENCE: root, what named it, the owner\'s state, its age, the starttime it was judged by');
}

let swapSweep = null, swapA = null;   // verify r3 (T3): the swap leg's sweep, driven again by control (19)
// ── §3 `--reap --dry-run`: THE VERDICT PER CANDIDATE, WITH ITS EVIDENCE ──
console.log('\n§3 --reap --dry-run prints the verdict per candidate with its evidence');
{
  const lines = []; const code = reapByHand({ dryRun: true, procRoot: F.root, now: NOW, self: 999999, log: (m) => lines.push(m) });
  const has = (re) => lines.some((l) => re.test(l));
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  ok(code === 0 && /^\[ci\] reaping 15 scratch orphan process\(es\) from /.test(lines[0]), `the head line counts the victims (exit ${code}: ${lines[0]})`);
  ok(has(new RegExp(`^\\[ci\\]   pid 520 \\(ppid 1\\) sleep: sleep 3600 — root ${esc(R.dead)} — owner gone: run verifier pid 4200 is gone — age 30 min — named by cwd$`)),
    'a victim line = pid, ppid, command, root, the rule, the OWNER state, the AGE and what named the root', lines.find((l) => l.includes('pid 520 ')));
  ok(has(new RegExp(`^\\[ci\\]   pid 560 .* — root ${esc(R.goneA)} — scratch dir gone — owner: the dir is gone \\(its run record with it\\) — age 30 min — named by cwd$`)), 'a gone-dir victim says the record went with the dir');
  ok(has(new RegExp(`^\\[ci\\]   spare pid 500 \\(ppid 1\\) node: .* — root ${esc(R.other)} — its root's owner is alive \\(run lane-b pid 4100 is alive\\) — age 30 min$`)), 'a spared candidate is printed with WHY (the live owner) and its age');
  ok(has(/^\[ci\]   spare pid 561 .* — young: 0 s < the 10 min stale floor/), '…and a young one says so');
  ok(has(new RegExp(`^\\[ci\\]   not a root: pid 510 \\(ppid 1\\) sh: sh -c sleep 60; : — ${esc(R.file)} is a file, not a directory$`)), 'a process naming the scratch shape where there is no root is printed as "not a root", with why');
  ok(/^\[ci\] --dry-run: 15 process\(es\) listed above, none signalled \(\d+ spared, 5 naming no scratch root\)$/.test(lines[lines.length - 1]), `the closing line (${lines[lines.length - 1]})`);
  // the two TEST seams (test-ci-heavy-launch §6): a tier's sweeps judge the test's own table, under the test's own lock
  process.env.VIBESPACE_CI_REAP_PROCFS = F.root; process.env.VIBESPACE_CI_REAPER_LOCK = path.join(MAIN, 'seam.lock');
  const seamed = ids(scratchOrphans({ now: NOW, self: 999999 })), seamLock = defaultReaperLockPath();
  delete process.env.VIBESPACE_CI_REAP_PROCFS; delete process.env.VIBESPACE_CI_REAPER_LOCK;
  ok(JSON.stringify(seamed) === JSON.stringify(EXPECT) && seamLock === path.join(MAIN, 'seam.lock') && /^\/tmp\/vibespace-ci-reaper-/.test(defaultReaperLockPath()),
    'VIBESPACE_CI_REAP_PROCFS / VIBESPACE_CI_REAPER_LOCK point a tier\'s sweeps at a test\'s own process table and lock (unset = the machine\'s)');
  const empty = verdictReport({});
  ok(empty[0] === '[ci] no scratch orphans' && /nothing to reap/.test(empty[1]), 'a dry run with nothing to reap says so');
  // VERIFY r1 (K7, 2026-09-29): THE SEAM IS HELD TO A SCRATCH ROOT AND ANNOUNCED. Reproduced on the real `--reap`: a table
  // under the lane's HOME naming a real pid (starttime 12345, never its own) under a gone root, 30 min old, and the real,
  // owned, claim-less `sleep` behind that number was SIGKILLed with nothing said about a fake table; a table that did not
  // exist made every sweep of a tier a silent []. GIT_ENV carries the variable to every suite and the detached heavy child.
  const LOCK_SEAM = path.join(MAIN, 'seam-sweep.lock');
  // a table: systemd, lane B's live suite (pid 4100 — R.other's owner), and one row; pids past pid_max are nobody's on the box
  const seamTable = (root, victimRow) => { fs.mkdirSync(path.join(root, 'sys', 'kernel', 'random'), { recursive: true }); fs.writeFileSync(path.join(root, 'sys', 'kernel', 'random', 'boot_id'), 'boot-now\n'); const mk = (pid, name, cwd, born, starttime = 12345) => { const d = path.join(root, String(pid)); fs.mkdirSync(d); fs.writeFileSync(path.join(d, 'stat'), `${pid} (${name}) S 1 ${pid} ${pid} 0 -1 4194560 0 0 0 0 0 0 0 0 20 0 1 0 ${starttime} 0 0`); fs.writeFileSync(path.join(d, 'cmdline'), name + '\0'); fs.writeFileSync(path.join(d, 'environ'), ''); fs.symlinkSync(cwd, path.join(d, 'cwd')); fs.utimesSync(d, born / 1000, born / 1000); }; mk(1, 'systemd', '/', NOW); mk(4100, 'node', FAKE_HOME, NOW, 5000); if (victimRow) mk(victimRow.pid, 'node', victimRow.cwd, victimRow.born); return root; };
  const outside = seamTable(fs.mkdtempSync('/var/tmp/vs-reaper-seam-'), { pid: 4999999, cwd: sib('gone-seam'), born: OLD }); made.push(outside);   // /var/tmp/vs-* is fixture-guard's other tmp root, NOT the reaper's scratch shape: a table there is anybody's
  const announced = seamTable(path.join(MAIN, 'proc-announced'), { pid: 4999998, cwd: R.other, born: OLD });   // under this suite's root; its one row is spared (R.other's owner 4100 is alive in this table) — nothing is ever signalled from it
  const withSeam = (v, f) => { const prev = process.env.VIBESPACE_CI_REAP_PROCFS; process.env.VIBESPACE_CI_REAP_PROCFS = v; try { return f(); } finally { if (prev === undefined) delete process.env.VIBESPACE_CI_REAP_PROCFS; else process.env.VIBESPACE_CI_REAP_PROCFS = prev; } };
  const thrown = (f) => { try { f(); return null; } catch (e) { return e.message; } };
  const refusedOut = withSeam(outside, () => thrown(() => reapScratchOrphans({ lockPath: LOCK_SEAM, log: () => { throw new Error('logged'); } })));
  ok(/^VIBESPACE_CI_REAP_PROCFS=\/var\/tmp\/vs-reaper-seam-.* refused: a fake process table is judged only under a \/tmp\/vs-\* scratch root/.test(refusedOut || ''), `a seam OUTSIDE a scratch root is REFUSED before anything is judged, logged or locked (${refusedOut})`);
  // verify r2 (R1): a seam is judged by its REAL path — a symlink under this suite's root to the outside table, and a symlinked component
  const seamLink = path.join(MAIN, 'seam-link'); fs.symlinkSync(outside, seamLink);
  const refusedLink = withSeam(seamLink, () => thrown(() => reapScratchOrphans({ lockPath: LOCK_SEAM })));
  ok(new RegExp(`^VIBESPACE_CI_REAP_PROCFS=${esc(seamLink)} refused \\(it resolves to ${esc(outside)}\\): a fake process table is judged only under`).test(refusedLink || ''), `a seam that is a SYMLINK under a scratch root to a table elsewhere is refused by its real path (${refusedLink})`);
  const seamLnkDir = path.join(MAIN, 'lnk'); fs.symlinkSync(path.dirname(outside), seamLnkDir);
  const refusedComponent = withSeam(path.join(seamLnkDir, path.basename(outside)), () => thrown(() => reapScratchOrphans({ lockPath: LOCK_SEAM })));
  ok(/refused \(it resolves to \/var\/tmp\/vs-reaper-seam-.*\): a fake process table/.test(refusedComponent || ''), `…and so is a seam with a symlinked component (${refusedComponent})`);
  // verify r2 (R1): a stale seam — a table under a scratch root whose owner is DEAD (a finished run's), or that has no record at all
  const staleRoot = mkRoot('staleseam'); writeRecord(staleRoot, { v: 1, run: 'finished-run', pid: 4999990, starttime: 777, bootId: machineBootId(), createdAt: HOUR_AGO });
  const staleTable = seamTable(path.join(staleRoot, 'procfs'), { pid: 4999989, cwd: sib('gone-stale'), born: OLD });
  const refusedStale = withSeam(staleTable, () => thrown(() => reapScratchOrphans({ lockPath: LOCK_SEAM })));
  ok(new RegExp(`refused: its scratch root ${esc(staleRoot)} has no live owner \\(run finished-run pid 4999990 is gone\\) — a seam is a live test's`).test(refusedStale || ''), `a seam under a scratch root whose owner is dead (a finished run's table) is refused, naming the owner's state (${refusedStale})`);
  // verify r3 (T4): a seam under a root whose record names pid 1 (init: root's, alive for the boot) was ACCEPTED for ever
  const forgedRoot = mkRoot('forgedseam'); writeRecord(forgedRoot, { v: 1, run: 'forged', pid: 1, starttime: procStat(1).starttime, bootId: machineBootId(), createdAt: HOUR_AGO });
  const forgedTable = seamTable(path.join(forgedRoot, 'procfs'), { pid: 4999988, cwd: sib('gone-forged'), born: OLD });
  const refusedForged = withSeam(forgedTable, () => thrown(() => reapScratchOrphans({ lockPath: LOCK_SEAM })));
  ok(new RegExp(`refused: its scratch root ${esc(forgedRoot)} has no live owner \\(run forged pid 1 is another user's process \\(uid 0, not ${process.getuid()}\\)\\)`).test(refusedForged || ''), `a seam under a root whose record names pid 1 (a forged owner, alive for the boot) is refused: the owner is not this user's process (${refusedForged})`);
  const noRecRoot = mkRoot('norecseam'); const noRecTable = seamTable(path.join(noRecRoot, 'procfs'), null);
  const refusedNoRec = withSeam(noRecTable, () => thrown(() => reapScratchOrphans({ lockPath: LOCK_SEAM })));
  ok(/has no live owner \(no run record\)/.test(refusedNoRec || ''), `…and one under a root with no run record (${refusedNoRec})`);
  const refusedGone = withSeam(path.join(MAIN, 'no-such-table'), () => thrown(() => reapScratchOrphans({ lockPath: LOCK_SEAM })));
  ok(/refused: not a directory/.test(refusedGone || ''), `a seam naming a table that is not there is refused, never a silent "nothing to reap" (${refusedGone})`);
  const refusedAsync = await withSeam(outside, () => reapScratchOrphansAsync({ lockPath: LOCK_SEAM }).then(() => null, (e) => e.message));
  ok(/refused: a fake process table/.test(refusedAsync || ''), 'the lanes\' async twin refuses it the same way');
  const byHandLines = []; const byHandCode = withSeam(outside, () => reapByHand({ dryRun: true, log: (m) => byHandLines.push(m) }));
  ok(byHandCode === 2 && byHandLines.length === 1 && /^\[ci\] --reap refused: VIBESPACE_CI_REAP_PROCFS=.* refused: a fake process table/.test(byHandLines[0]), '`--reap --dry-run` under a refused seam prints the refusal and exits 2 (nothing listed)', byHandLines);
  const wetLines = []; const wetCode = withSeam(outside, () => reapByHand({ lockPath: LOCK_SEAM, log: (m) => wetLines.push(m) }));
  ok(wetCode === 2 && wetLines.length === 1 && /--reap refused/.test(wetLines[0]), '…and so does `--reap` itself: the table\'s pid 4999999 was never signalled');
  const saidLines = []; const said = withSeam(announced, () => reapScratchOrphans({ lockPath: LOCK_SEAM, now: NOW, self: 999999, log: (m) => saidLines.push(m) }));
  ok(Array.isArray(said) && said.length === 0 && saidLines.length === 1 && saidLines[0] === `[ci] scratch reaper: judging the FAKE process table ${announced} (VIBESPACE_CI_REAP_PROCFS, a test seam) — its verdicts are listed and NOTHING is signalled (a seam is dry)`, 'a sweep under an ACCEPTED seam says first that its table is fake and dry (one line, before any verdict)', saidLines);
  // verify r3 (T3): THE TABLE ANNOUNCED IS THE TABLE JUDGED. The sweep resolved the seam once for its announce line and the judge's
  // own default resolved it again — a symlink re-pointed in between (here: by the announce line's own log callback) had the sweep
  // list another table's rows under the first table's name. Now the one resolution is handed to the judge (the control (19) below
  // re-resolves and lists table B's row).
  swapA = seamTable(path.join(MAIN, 'proc-swap-a'), null); const swapB = seamTable(path.join(MAIN, 'proc-swap-b'), { pid: 4999997, cwd: sib('gone-swap'), born: OLD });
  const swapLink = path.join(MAIN, 'seam-swap'); fs.symlinkSync(swapA, swapLink);
  const swapTo = (t) => { fs.unlinkSync(swapLink); fs.symlinkSync(t, swapLink); };
  swapSweep = (mod) => { swapTo(swapA); const lines = []; const list = withSeam(swapLink, () => mod.reapScratchOrphans({ lockPath: LOCK_SEAM, now: NOW, self: 999999, log: (m) => { lines.push(m); if (/judging the FAKE process table/.test(m)) swapTo(swapB); } })); return { list, lines }; };
  const swapped = swapSweep({ reapScratchOrphans });
  ok(swapped.list.length === 0 && swapped.lines.length === 1 && swapped.lines[0].includes(swapA) && !swapped.lines.some((l) => l.includes('4999997')), `the seam re-pointed to another table between the announce line and the judge: the sweep still judges the table it announced (${swapped.lines.length} line(s), ${swapped.list.length} listed)`);
  const cliSeam = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'ci.mjs'), '--reap', '--dry-run'], { encoding: 'utf8', cwd: REPO, env: { ...QUIET_ENV, VIBESPACE_CI_REAP_PROCFS: announced }, timeout: 60000 });
  const cliOut = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'ci.mjs'), '--reap', '--dry-run'], { encoding: 'utf8', cwd: REPO, env: { ...QUIET_ENV, VIBESPACE_CI_REAP_PROCFS: outside }, timeout: 60000 });
  ok(cliSeam.status === 0 && /^\[ci\] scratch reaper: judging the FAKE process table /.test(cliSeam.stdout) && /spare pid 4999998 .*owner is alive/.test(cliSeam.stdout) && /--dry-run: nothing to reap/.test(cliSeam.stdout),
    'the CLI as an operator runs it: an accepted seam is announced on the first line of `--reap --dry-run`', cliSeam.stdout.split('\n').slice(0, 3));
  ok(cliOut.status === 2 && /^\[ci\] --reap refused: VIBESPACE_CI_REAP_PROCFS=/.test(cliOut.stdout) && !/4999999/.test(cliOut.stdout), 'the CLI refuses the outside table (exit 2) and lists nothing from it', cliOut.stdout.split('\n').slice(0, 3));
  // VERIFY r2 (R2, 2026-09-29): A SEAM LISTS, NEVER SIGNALS. Reproduced on the real `--reap`: a table under an ACCEPTED scratch
  // root naming a real, owned, claim-less `sleep` of the verifier's (starttime 12345 — never its own) under a gone dir, 30 min
  // old, was SIGKILLed ("reaped 1 of 1"): the signal's re-check reads the SAME table, so no fake row can fail it. Now a real
  // child of THIS suite, named by a seam table under this suite's root, survives the sync sweep, the lanes' async twin and
  // `--reap` itself (in-process and as the CLI); the control copy (12) signals it and it dies.
  const seamVictim = spawn(process.execPath, ['-e', 'setInterval(() => { }, 1000)'], { cwd: QUIET_CWD, env: QUIET_ENV, stdio: 'ignore' });
  plant(seamVictim.pid); for (let i = 0; i < 100 && !procStat(seamVictim.pid); i++) sleepSync(10);
  const seamStart = procStat(seamVictim.pid).starttime;
  const dryTable = seamTable(path.join(MAIN, 'proc-dry'), { pid: seamVictim.pid, cwd: sib('gone-dry'), born: OLD });   // its row: starttime 12345 (never its own), a gone root, 30 min old
  const stillIt = () => { const st = procStat(seamVictim.pid); return !!st && st.state !== 'Z' && st.state !== 'X' && st.starttime === seamStart; };
  const dryLines = []; const dryList = withSeam(dryTable, () => reapScratchOrphans({ lockPath: LOCK_SEAM, now: NOW, self: 999999, graceMs: 300, log: (m) => dryLines.push(m) }));
  sleepSync(300);
  ok(dryList.length === 1 && dryList[0].pid === seamVictim.pid && stillIt() && dryLines.some((l) => l.includes(`pid ${seamVictim.pid} `)) && dryLines[dryLines.length - 1] === "[ci] scratch reaper: 1 victim(s) listed under the test seam, none signalled (verify r2 R2: a table's word about a pid is not the kernel's)",
    `THE R2 LEG: a real process this suite owns, named by an accepted seam table under a gone root, is LISTED by the sync sweep and NOT signalled (pid ${seamVictim.pid} still alive with its starttime)`, dryLines);
  // the seam stays set across the twin's awaits (the lock wait): the env is restored once the sweep has resolved
  const dryAsync = await (async () => { const prev = process.env.VIBESPACE_CI_REAP_PROCFS; process.env.VIBESPACE_CI_REAP_PROCFS = dryTable; try { return await reapScratchOrphansAsync({ lockPath: LOCK_SEAM, now: NOW, self: 999999, graceMs: 300, log: () => { } }); } finally { if (prev === undefined) delete process.env.VIBESPACE_CI_REAP_PROCFS; else process.env.VIBESPACE_CI_REAP_PROCFS = prev; } })();
  await sleep(300);
  ok(dryAsync.length === 1 && stillIt(), 'the lanes\' async twin under the seam lists it and signals nothing');
  const wetSeamLines = []; const wetSeamCode = withSeam(dryTable, () => reapByHand({ lockPath: LOCK_SEAM, now: NOW, self: 999999, graceMs: 300, log: (m) => wetSeamLines.push(m) }));
  sleepSync(300);
  ok(wetSeamCode === 0 && stillIt() && wetSeamLines[wetSeamLines.length - 1] === '[ci] test seam: 1 listed, none signalled' && !wetSeamLines.some((l) => /reaped \d+ of/.test(l)),
    '`--reap` (wet) under the seam exits 0 with a closing line that claims no reap', wetSeamLines);
  const cliWet = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'ci.mjs'), '--reap'], { encoding: 'utf8', cwd: REPO, env: { ...QUIET_ENV, VIBESPACE_CI_REAP_PROCFS: dryTable, VIBESPACE_CI_REAPER_LOCK: LOCK_SEAM }, timeout: 60000 });
  sleepSync(300);
  ok(cliWet.status === 0 && stillIt() && /listed under the test seam, none signalled/.test(cliWet.stdout) && /^\[ci\] test seam: 1 listed, none signalled$/m.test(cliWet.stdout), 'the CLI as an operator runs it: `--reap` under an accepted seam lists the pid and leaves it alive', cliWet.stdout.split('\n').slice(-3));
}

// ── §3b verify r4 (X4c): A TABLE THAT CANNOT BE READ IS SAID, NEVER "NOTHING TO REAP" ──
// r1 (K7) refused a seam naming no table; a table that vanished AFTER the seam was accepted (mid-sweep) still read as an empty sweep:
// the announce line, then silence — a test's own table, dry, but indistinguishable from a clean box. Now the judge THROWS naming the
// table: the tier's / launcher's catch sites print "scratch reaper skipped: …", `--reap` says "refused" and exits 2 on both paths, and
// the sweep's finally releases the lock.
console.log('\n§3b a process table that vanishes mid-sweep is said');
{
  const mkVanish = (tag) => { const T = fakeProc('vanish-' + tag); T.mk(4999950, { name: 'node', argv: ['node', 'x.js'], cwd: sib('gone-vanish'), born: OLD }); return T.root; };
  const withSeam = (table, fn) => { const prev = process.env.VIBESPACE_CI_REAP_PROCFS; process.env.VIBESPACE_CI_REAP_PROCFS = table; try { return fn(); } finally { if (prev === undefined) delete process.env.VIBESPACE_CI_REAP_PROCFS; else process.env.VIBESPACE_CI_REAP_PROCFS = prev; } };
  const vanishOnAnnounce = (table, lines) => (x) => { lines.push(x); if (/judging the FAKE process table/.test(x)) fs.rmSync(table, { recursive: true, force: true }); };
  const lk = path.join(MAIN, 'vanish.lock');
  const T1 = mkVanish('sync'); const l1 = []; let e1 = null;
  try { withSeam(T1, () => reapScratchOrphans({ lockPath: lk, log: vanishOnAnnounce(T1, l1), now: NOW, self: 999999 })); } catch (e) { e1 = e; }
  const L1 = acquireReaperLock({ lockPath: lk, waitMs: 300 }); if (L1.ok) L1.release();
  ok(!!e1 && /^the process table \S*vanish-sync could not be read \(ENOENT\) — nothing judged, nothing signalled/.test(e1.message) && l1.length === 1 && L1.ok, `the sync sweep under a table that vanished after its announce line THROWS naming the table (the callers print "scratch reaper skipped: …") and its lock is released (${e1 ? e1.message.slice(0, 100) : 'no throw: ' + JSON.stringify(l1)}; lock re-taken: ${L1.ok})`);
  const T2 = mkVanish('async'); const l2 = []; let e2 = null;
  try { await withSeam(T2, () => reapScratchOrphansAsync({ lockPath: lk, log: vanishOnAnnounce(T2, l2), now: NOW, self: 999999 })); } catch (e) { e2 = e; }
  ok(!!e2 && /could not be read \(ENOENT\)/.test(e2.message) && l2.length === 1, `…and so does the async twin (${e2 ? e2.message.slice(0, 60) : 'no throw: ' + JSON.stringify(l2)})`);
  const T3 = mkVanish('dry'); const l3 = []; const code3 = withSeam(T3, () => reapByHand({ dryRun: true, log: vanishOnAnnounce(T3, l3), now: NOW, self: 999999 }));
  ok(code3 === 2 && l3.length === 2 && /^\[ci\] --reap refused: the process table \S+ could not be read \(ENOENT\)/.test(l3[1]), `--reap --dry-run under a table that vanished after the announce line exits 2 saying so — never "nothing to reap" (${JSON.stringify(l3[1] || l3)})`);
  const T4 = mkVanish('wet'); const l4 = []; const code4 = withSeam(T4, () => reapByHand({ lockPath: lk, log: vanishOnAnnounce(T4, l4), now: NOW, self: 999999 }));
  ok(code4 === 2 && /^\[ci\] --reap refused: the process table \S+ could not be read/.test(l4[l4.length - 1] || ''), `…and the wet --reap too (exit ${code4}: ${JSON.stringify(l4[l4.length - 1])})`);
}

// ── §4 ONE SWEEP AT A TIME: THE MACHINE-WIDE flock ───────────────────────
console.log('\n§4 one sweep at a time (flock(1) held by one child; the kernel releases it)');
const LOCK = path.join(MAIN, 'reaper.lock');
{
  ok(REAPER_LOCK_WAIT_MS === 5000 && /^\/tmp\/vibespace-ci-reaper-\d+\.lock$/.test(defaultReaperLockPath()) && !SCRATCH_ROOT_RE.test(defaultReaperLockPath()),
    `the tiers wait 5 s for the machine's sweep lock (${defaultReaperLockPath()} — never a /tmp/vs-* name itself)`);
  const A = acquireReaperLock({ lockPath: LOCK, waitMs: 1000 });
  ok(A.ok && procStat(A.holder) && procStat(A.holder).comm === 'cat', `the lock is taken by ONE holder child (pid ${A.holder}: ${procStat(A.holder) && procStat(A.holder).comm})`);
  let t = Date.now(); const B = acquireReaperLock({ lockPath: LOCK, waitMs: 400 }); const waited = Date.now() - t;
  const namedHolder = /^another sweep holds .*reaper\.lock \(waited 0\.4 s\) — held by pid (\d+) \(cat, parent (\d+) \S+, for \d+ s\)$/.exec(B.why || '') || [];   // the parent's comm is node's (`MainThread` on Node 24)
  ok(!B.ok && Number(namedHolder[1]) === A.holder && Number(namedHolder[2]) === process.pid && waited >= 350 && waited < 3000, `a second taker waits its bound, then fails SAYING why — and WHO holds it: the holder's pid, its parent (this suite) and for how long (verify r2 R3; ${waited} ms: ${B.why})`);
  const skipLog = [];
  t = Date.now(); const sk = reapScratchOrphans({ procRoot: F.root, now: NOW, self: 999999, lockPath: LOCK, lockWaitMs: 300, log: (m) => skipLog.push(m) });
  ok(Array.isArray(sk) && sk.length === 0 && /another sweep holds/.test(sk.skipped || '') && skipLog.length === 1 && /^\[ci\] scratch reaper SKIPPED — another sweep holds .*: nothing judged, nothing signalled$/.test(skipLog[0]),
    'a sweep that cannot get the lock SKIPS and says so — one line, nothing judged, nothing signalled (the fake root\'s 12 victims untouched)', skipLog);
  const noProcLog = []; t = Date.now(); const np = reapScratchOrphans({ procRoot: path.join(MAIN, 'no-proc'), lockPath: LOCK, lockWaitMs: 300, log: (m) => noProcLog.push(m) });
  ok(Array.isArray(np) && np.length === 0 && !np.skipped && noProcLog.length === 0 && Date.now() - t < 250, 'a machine with no /proc (macOS) has nothing to judge: no lock is asked for and no skip is printed after every suite');
  const byHand = []; const code3 = reapByHand({ procRoot: F.root, now: NOW, self: 999999, lockPath: LOCK, lockWaitMs: 200, log: (m) => byHand.push(m) });
  ok(code3 === 3 && byHand.length === 1 && /SKIPPED/.test(byHand[0]), '`--reap` by hand under the same lock: a skip exits 3 (did not run) and says so');
  A.release();
  t = Date.now(); const C = acquireReaperLock({ lockPath: LOCK, waitMs: 3000 });
  ok(C.ok && Date.now() - t < 1500, `release frees it at once (${Date.now() - t} ms)`); C.release();
  // verify r1 (K4): a take TOUCHES the lock file — opened for append and never written, its times never moved, and the box's
  // systemd-tmpfiles rule (`q /tmp 1777 root root 10d`) would remove a lock in daily use while it is held; a removed lock file
  // admits a second sweep (rm under a holder ⇒ the next taker is granted — by hand that still holds, and is stated).
  const OLD_LOCK = path.join(MAIN, 'old.lock'); fs.writeFileSync(OLD_LOCK, ''); fs.utimesSync(OLD_LOCK, (NOW - 11 * 86400e3) / 1000, (NOW - 11 * 86400e3) / 1000);
  const T = acquireReaperLock({ lockPath: OLD_LOCK, waitMs: 500 }); const touchedAt = fs.statSync(OLD_LOCK).mtimeMs; T.release();
  ok(T.ok && touchedAt > NOW - 60e3, `a take refreshes the lock file's mtime (11 days old ⇒ ${Math.round((Date.now() - touchedAt) / 1000)} s old): a lock in use never ages into a tmp cleaner's rule`);
  // verify r3 (T6): a lock file this user cannot open (another uid's file of our name — the root-owned tmpfiles case) says so: r2 measured
  // "the lock holder exited 2" because a failed redirection on sh's special builtin `exec` ends the shell with its own status
  // verify r3 (T6): the pid in the file REUSED by an innocent process (here: this suite's own pid written over the holder's) — the
  // note named it as the holder ("held by pid P (MainThread, parent …)"); a holder is `cat`, anything else is said to be not one
  const A3 = acquireReaperLock({ lockPath: LOCK, waitMs: 1000 }); fs.writeFileSync(LOCK, `${process.pid}\n`);
  const B3 = acquireReaperLock({ lockPath: LOCK, waitMs: 300 }); A3.release();
  ok(A3.ok && !B3.ok && new RegExp(`^another sweep holds .*reaper\\.lock \\(waited 0\\.3 s\\) — the pid ${process.pid} it named now runs \\S+, not a holder \\(the number was reused, or the file is stale; the lock is the kernel's flock, still held by someone\\)$`).test(B3.why || ''), `a skip whose file names a pid that is no longer a \`cat\` says it is not a holder — never "held by" an innocent process (${B3.why})`);
  const RO = path.join(MAIN, 'ro.lock'); fs.writeFileSync(RO, ''); fs.chmodSync(RO, 0o000);
  const roTake = process.getuid() === 0 ? null : acquireReaperLock({ lockPath: RO, waitMs: 300 });
  ok(roTake === null || (!roTake.ok && roTake.why === `cannot open ${RO}`), `a lock file that cannot be opened fails SAYING so (${roTake ? roTake.why : 'skipped: root opens anything'})`);
  const A2 = await acquireReaperLockAsync({ lockPath: LOCK, waitMs: 1000 }); const B2 = await acquireReaperLockAsync({ lockPath: LOCK, waitMs: 300 });
  ok(A2.ok && !B2.ok && /another sweep holds/.test(B2.why), 'the async twin (the heavy tier\'s lanes) serialises on the same lock'); A2.release();
  // THE KERNEL RELEASES IT WHEN THE HOLDER'S OWNER DIES: a node that takes the lock and is then SIGKILLed mid-sweep
  const taker = spawn(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(pathToFileURL(path.join(REPO, 'scripts', 'ci.mjs')).href)}).then((m) => { const l = m.acquireReaperLock({ lockPath: process.argv[1], waitMs: 2000 }); console.log(l.ok ? 'HELD ' + l.holder : 'NO ' + l.why); setInterval(() => { }, 1000); });`, LOCK], { cwd: QUIET_CWD, env: QUIET_ENV, stdio: ['ignore', 'pipe', 'ignore'] });
  plant(taker.pid);
  let out = ''; taker.stdout.on('data', (d) => { out += d; });
  for (let i = 0; i < 200 && !/HELD|NO/.test(out); i++) await sleep(25);
  const heldBy = Number((/HELD (\d+)/.exec(out) || [])[1]);
  const D = acquireReaperLock({ lockPath: LOCK, waitMs: 200 });
  ok(/HELD/.test(out) && !D.ok, `a sweep in another process holds it (${out.trim()})`);
  try { process.kill(taker.pid, 'SIGKILL'); } catch { }
  t = Date.now(); const E = acquireReaperLock({ lockPath: LOCK, waitMs: 3000 });
  ok(E.ok && Date.now() - t < 2500 && !(procStat(heldBy) && procStat(heldBy).state !== 'Z'), `…SIGKILLed mid-sweep, its holder saw EOF and exited: the kernel released the lock (${Date.now() - t} ms) — no owner file, nothing to break`);
  E.release();
}

// ── §5 TWO SWEEPS STARTED TOGETHER: ONE SWEEPS, ONE SKIPS AND SAYS SO ────
console.log('\n§5 two sweeps started together: one sweeps, one skips and says so');
async function twoSweeps(modPath, tag, { victimIgnoresTerm }) {
  // the victim: a process THIS suite started, named nowhere as scratch on the real /proc; the fake root roots it under a gone dir, 30 min old
  const victim = spawn(process.execPath, ['-e', victimIgnoresTerm ? "process.on('SIGTERM', () => { }); setInterval(() => { }, 1000)" : 'setInterval(() => { }, 1000)'], { cwd: QUIET_CWD, env: QUIET_ENV, stdio: 'ignore' });
  plant(victim.pid);
  const P = fakeProc('two-' + tag);
  P.mk(victim.pid, { name: 'node', argv: ['node', 'leaked-server.js'], cwd: sib('gone-two-' + tag), born: OLD });
  const go = path.join(MAIN, `go-${tag}`), lock = path.join(MAIN, `two-${tag}.lock`);
  const driver = `import(${JSON.stringify(pathToFileURL(modPath).href)}).then((m) => {
    const [procRoot, lockPath, go] = process.argv.slice(1);
    require('fs').writeFileSync(go + '.ready.' + process.pid, '1');   // loaded: only now may the test say GO
    while (!require('fs').existsSync(go)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
    const lines = []; const list = m.reapScratchOrphans({ procRoot, lockPath, lockWaitMs: 1000, graceMs: 2500, self: 999999, log: (x) => lines.push(x) });
    console.log(JSON.stringify({ skipped: list.skipped || null, reaped: list.map((o) => o.pid), lines }));
  });`;
  const kids = [0, 1].map(() => spawn(process.execPath, ['-e', driver, P.root, lock, go], { cwd: QUIET_CWD, env: QUIET_ENV, stdio: ['ignore', 'pipe', 'pipe'] }));
  kids.forEach((k) => plant(k.pid));
  const outs = kids.map((k) => { let o = ''; k.stdout.on('data', (d) => { o += d; }); k.stderr.on('data', (d) => { o += d; }); return () => o; });
  const done = kids.map((k) => new Promise((r) => k.on('exit', r)));
  // GO only once BOTH have loaded the module (a slow load must not decide which one sweeps)
  const ready = () => fs.readdirSync(MAIN).filter((f) => f.startsWith(path.basename(go) + '.ready.')).length;
  for (let i = 0; i < 600 && ready() < 2; i++) await sleep(25);
  fs.writeFileSync(go, '1');
  await Promise.race([Promise.all(done), sleep(20000)]);
  const res = outs.map((o) => { try { return JSON.parse(o().trim().split('\n').pop()); } catch { return { raw: o() }; } });
  let victimGone = false; for (let i = 0; i < 40 && !(victimGone = !(procStat(victim.pid) && procStat(victim.pid).state !== 'Z')); i++) await sleep(50);
  return { res, victim: victim.pid, victimGone };
}
{
  const r = await twoSweeps(path.join(REPO, 'scripts', 'ci.mjs'), 'real', { victimIgnoresTerm: true });
  const swept = r.res.filter((x) => x && Array.isArray(x.reaped) && x.reaped.includes(r.victim)), skipped = r.res.filter((x) => x && x.skipped);
  ok(swept.length === 1 && skipped.length === 1 && /^another sweep holds .*two-real\.lock \(waited 1 s\) — held by pid \d+ \(cat, parent \d+ \S+, for \d+ s\)$/.test(skipped[0].skipped) && skipped[0].lines.length === 1 && /^\[ci\] scratch reaper SKIPPED — another sweep holds/.test(skipped[0].lines[0]),
    'THE BRIEF\'S LEG: two reapers started together — exactly one sweeps, the other waits its bound and SKIPS, saying so in one line', r.res);
  ok(swept.length === 1 && swept[0].lines.some((l) => l.includes(`pid ${r.victim} (ppid 1) node: node leaked-server.js — root ${sib('gone-two-real')} — scratch dir gone`)) && r.victimGone,
    `…and the one that swept reaped the leak (pid ${r.victim}, which ignored SIGTERM: SIGKILLed after the grace, while the lock was held)`);
}

// ── §5b THE SIGNAL RE-CHECKS THE IDENTITY IT JUDGED (verify r1 K5/K8) ────
// A pid recycled between the verdict and the signal is somebody else's: `sameProcess` reads the table's starttime again
// before SIGTERM and before SIGKILL. Driven on the lanes' async twin, whose grace is awaited on the event loop: the
// victim (this suite's, ignoring SIGTERM) is judged and TERMed; during the grace its row changes starttime — "another
// process has that number now" — and the SIGKILL pass leaves it alone. The reverted rule (a copy signalling by number
// alone) kills it: the control in §7.
console.log('\n§5b a victim is signalled only while its pid still carries the starttime it was judged by');
async function recycledPid(modPath, tag) {
  const m = await import(pathToFileURL(modPath).href);
  const victim = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => { }); setInterval(() => { }, 1000)"], { cwd: QUIET_CWD, env: QUIET_ENV, stdio: 'ignore' });
  plant(victim.pid); for (let i = 0; i < 100 && !procStat(victim.pid); i++) sleepSync(10);
  const P = fakeProc('recycle-' + tag);
  P.mk(victim.pid, { name: 'node', argv: ['node', 'leaked-server.js'], cwd: sib('gone-recycle-' + tag), born: OLD, starttime: 12345 });
  const statFile = path.join(P.root, String(victim.pid), 'stat');
  const lines = []; const sweep = m.reapScratchOrphansAsync({ procRoot: P.root, now: NOW, self: 999999, lockPath: path.join(MAIN, `recycle-${tag}.lock`), graceMs: 1500, log: (x) => lines.push(x) });
  await sleep(300);   // judged, SIGTERMed (ignored), in the grace
  fs.writeFileSync(statFile, fs.readFileSync(statFile, 'utf8').replace(' 12345 0 0', ' 99999 0 0'));   // the number is another process's now
  const list = await sweep;
  await sleep(200);
  const st = procStat(victim.pid);
  const alive = !!st && st.state !== 'Z' && st.state !== 'X' && st.starttime === planted.find((p) => p.pid === victim.pid).starttime;
  return { pid: victim.pid, alive, listed: list.some((o) => o.pid === victim.pid), lines };
}
{
  const r = await recycledPid(path.join(REPO, 'scripts', 'ci.mjs'), 'real');
  ok(r.listed && r.lines.some((l) => l.includes(`pid ${r.pid} `)) && r.alive, `the victim was judged and TERMed (it ignored it); its number changed hands during the grace ⇒ NOT SIGKILLed — still alive (pid ${r.pid})`, r.lines);
}

// ── §5c `--reap`'s closing line counts a ZOMBIE as reaped (verify r1 K5) ──
// A victim that is a child of the sweeping process dies on SIGTERM but is not reaped until that process's event loop
// runs — during a SYNC sweep it is a zombie, and `kill(pid, 0)` still succeeds. The closing line read "1 still alive
// after SIGKILL" for a dead process. Driven with a real child of this suite over a fake table (its one row).
console.log('\n§5c the closing line of --reap counts a dead-but-unreaped victim as reaped');
async function zombieVictim(modPath, tag) {
  const m = await import(pathToFileURL(modPath).href);
  const victim = spawn(process.execPath, ['-e', 'setInterval(() => { }, 1000)'], { cwd: QUIET_CWD, env: QUIET_ENV, stdio: 'ignore' });   // NOT detached: this suite is its parent
  plant(victim.pid); for (let i = 0; i < 100 && !procStat(victim.pid); i++) sleepSync(10);
  const P = fakeProc('zombie-' + tag);
  P.mk(victim.pid, { name: 'node', argv: ['node', 'leaked-server.js'], cwd: sib('gone-zombie-' + tag), born: OLD, starttime: 12345 });
  const lines = []; const code = m.reapByHand({ procRoot: P.root, now: NOW, self: 999999, lockPath: path.join(MAIN, `zombie-${tag}.lock`), graceMs: 500, log: (x) => lines.push(x) });
  const st = procStat(victim.pid);
  return { pid: victim.pid, code, last: lines[lines.length - 1] || '', state: st ? st.state : 'gone' };
}
{
  const r = await zombieVictim(path.join(REPO, 'scripts', 'ci.mjs'), 'real');
  ok(r.code === 0 && r.state === 'Z' && r.last === '[ci] reaped 1 of 1 scratch orphan process(es)', `the victim is a zombie at the closing line (state ${r.state}) and the line says reaped 1 of 1 (${r.last})`);
}

// ── §6 THE REAL /proc, DRY: THE BRIEF'S TWO SURVIVORS, PLANTED FOR REAL ──
console.log('\n§6 the real /proc (dry, the clock moved past the stale floor): a foreign stray under a live owner and a shell with a file argument survive');
const REAL_OTHER = mkRoot('realother'), REAL_FILE = sib('realfile.txt');
fs.writeFileSync(REAL_FILE, 'a log a shell redirects to\n'); made.push(REAL_FILE);
// the OWNER: another "run" — a live process of this suite's, which exits when its stdin closes (or in 2 min)
const owner = spawn(process.execPath, ['-e', "process.stdin.resume(); process.stdin.on('end', () => process.exit(0)); setTimeout(() => process.exit(0), 120000)"], { cwd: QUIET_CWD, env: QUIET_ENV, stdio: ['pipe', 'ignore', 'ignore'] });
plant(owner.pid);
for (let i = 0; i < 100 && !procStat(owner.pid); i++) sleepSync(10);
stampScratchRun(REAL_OTHER, { pid: owner.pid, run: 'foreign-run' });
// the two planted strays: ORPHANED (re-parented to systemd through a parent that exits), bounded lifetimes, no scratch cwd/env
const orphan = (argv) => Number(String(spawnSync(process.execPath, ['-e', "const c = require('child_process').spawn(process.argv[1], JSON.parse(process.argv[2]), { detached: true, stdio: 'ignore', cwd: process.argv[3] }); c.unref(); console.log(c.pid);", argv[0], JSON.stringify(argv.slice(1)), QUIET_CWD], { encoding: 'utf8', env: QUIET_ENV, timeout: 10000 }).stdout || '').trim());
const pA = orphan([process.execPath, '-e', 'setTimeout(() => { }, 90000)', `${REAL_OTHER}/x`]);
plant(pA);
const pB = orphan(['sh', '-c', 'sleep 90; :', 'sh', REAL_FILE]);
plant(pB, { group: true });
for (let i = 0; i < 100 && !(procStat(pA) && procStat(pB)); i++) sleepSync(10);
const isOrphan = (pid) => { const st = procStat(pid); const pp = st && procStat(st.ppid); return !!st && (st.ppid === 1 || (!!pp && pp.comm === 'systemd')); };
{
  ok(pA > 0 && pB > 0 && isOrphan(pA) && isOrphan(pB), `both strays are real ORPHANS (re-parented to systemd): nothing but the new evidence rules can spare them (pids ${pA}, ${pB})`);
  const v = judgeScratch({ now: LATER() });
  ok(!v.victims.some((o) => o.pid === pA) && /its root's owner is alive \(run foreign-run pid \d+ is alive\)/.test((find(v.spared, pA) || {}).why || ''),
    `THE BRIEF'S LEG, FOR REAL: a planted foreign process naming ${REAL_OTHER}/x whose owner is alive SURVIVES — even an hour "later" (${(find(v.spared, pA) || {}).why})`);
  ok(!v.victims.some((o) => o.pid === pB) && /is a file, not a directory/.test((find(v.ignored, pB) || {}).why || ''),
    `THE BRIEF'S LEG, FOR REAL: a shell with a /tmp/vs-*.txt argument SURVIVES — a file is never a root (${(find(v.ignored, pB) || {}).why})`);
  // the CLI, as an operator runs it: the same two verdicts in its dry-run report
  const cli = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'ci.mjs'), '--reap', '--dry-run'], { encoding: 'utf8', cwd: REPO, env: QUIET_ENV, timeout: 60000 });
  const cl = (cli.stdout || '').split('\n');
  ok(cli.status === 0 && cl.some((l) => l.startsWith(`[ci]   spare pid ${pA} `) && l.includes('owner is alive')) && cl.some((l) => l.startsWith(`[ci]   not a root: pid ${pB} `) && l.includes('a file, not a directory')) && cl.some((l) => /^\[ci\] --dry-run: /.test(l)),
    '`node scripts/ci.mjs --reap --dry-run` prints both verdicts with their evidence and signals nothing', cl.filter((l) => l.includes(String(pA)) || l.includes(String(pB)) || /--dry-run/.test(l)));
}

// verify r2 (R4): the kernel's marker, FOR REAL — a child of this suite whose cwd was a scratch root that is then unlinked
const DEL = mkRoot('delcwd');
const delChild = spawn(process.execPath, ['-e', 'setInterval(() => { }, 1000)'], { cwd: DEL, env: QUIET_ENV, stdio: 'ignore' });
plant(delChild.pid); for (let i = 0; i < 100 && !procStat(delChild.pid); i++) sleepSync(10);
fs.rmSync(DEL, { recursive: true, force: true });
{
  const link = fs.readlinkSync(`/proc/${delChild.pid}/cwd`), v = judgeScratch({ now: LATER() }), row = find(v.spared, delChild.pid) || {};
  ok(link === `${DEL} (deleted)` && /owned by a live process outside the root/.test(row.why || '') && row.root === `${DEL} (deleted)`,
    `THE KERNEL'S MARKER, FOR REAL: readlink(/proc/<pid>/cwd) of an unlinked root reads "${link}" and the sweep names "${DEL} (deleted)" as its gone root (spared only because this suite owns it; reparented and old it is the dir-gone rule's)`);
  // verify r3 (T2), FOR REAL: (a) the path recreated and stamped by ANOTHER live run (the §6 owner) — the child is grouped under the
  // deleted inode's key and spared by ownership alone, never by that record; (b) a reparented process in a directory literally named
  // "… (deleted)" (nlink 2) names no root and is listed nowhere, an hour "later" (r2's strip convicted it: cwd-proven, dir-gone)
  const RR = mkRoot('recreated'); const rrChild = spawn(process.execPath, ['-e', 'setInterval(() => { }, 1000)'], { cwd: RR, env: QUIET_ENV, stdio: 'ignore' });
  plant(rrChild.pid); for (let i = 0; i < 100 && !procStat(rrChild.pid); i++) sleepSync(10);
  fs.rmSync(RR, { recursive: true, force: true }); fs.mkdirSync(RR); stampScratchRun(RR, { pid: owner.pid, run: 'foreign-run' });
  const rrRow = find(judgeScratch({ now: LATER() }).spared, rrChild.pid) || {};
  ok(fs.statSync(`/proc/${rrChild.pid}/cwd`).nlink === 0 && rrRow.root === `${RR} (deleted)` && /owned by a live process outside the root/.test(rrRow.why || '') && !/owner is alive/.test(rrRow.why || ''),
    `verify r3 (T2) FOR REAL: a child whose directory was removed and the path recreated by another live run (nlink 0) is grouped under "${path.basename(RR)} (deleted)" and spared by ownership, not by the new record (${rrRow.why})`);
  const REAL_LIT = sib('reallit') + ' (deleted)'; fs.mkdirSync(REAL_LIT); made.push(REAL_LIT);
  const pLit2 = Number(String(spawnSync(process.execPath, ['-e', "const c = require('child_process').spawn(process.execPath, ['-e', 'setTimeout(() => { }, 90000)'], { detached: true, stdio: 'ignore', cwd: process.argv[1] }); c.unref(); console.log(c.pid);", REAL_LIT], { encoding: 'utf8', env: QUIET_ENV, timeout: 10000 }).stdout || '').trim());
  plant(pLit2); for (let i = 0; i < 100 && !procStat(pLit2); i++) sleepSync(10);
  const vLit = judgeScratch({ now: LATER() }), litLink = fs.readlinkSync(`/proc/${pLit2}/cwd`), litNlink = fs.statSync(`/proc/${pLit2}/cwd`).nlink;
  ok(isOrphan(pLit2) && litLink === REAL_LIT && litNlink > 0 && ![...vLit.victims, ...vLit.spared, ...vLit.ignored].some((o) => o.pid === pLit2) && !!procStat(pLit2),
    `verify r3 (T2) FOR REAL: a reparented process in the EXISTING "${path.basename(REAL_LIT)}" (readlink ${JSON.stringify(litLink)}, nlink ${litNlink}) names no root and is listed nowhere an hour "later" — never "${sib('reallit')} is gone"`);
}

// ── §7 CONTROLS: patched copies (scripts/mutant-copy.mjs), each one rule removed ──
console.log('\n§7 controls: each rule removed in a patched copy turns its leg red');
const M = mutantCopies('reaper', REPO);
const ciSrc = fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf8'), runSrc = fs.readFileSync(path.join(REPO, 'scripts', 'scratch-run.mjs'), 'utf8');
const copy = async (tag, edits, { runEdits = null } = {}) => {
  let src = ciSrc;
  for (const [from, to] of edits) { if (!src.includes(from)) return { missing: from }; src = src.replace(from, to); }
  if (runEdits) {
    let rs = runSrc; for (const [from, to] of runEdits) { if (!rs.includes(from)) return { missing: from }; rs = rs.replace(from, to); }
    src = src.replace("from './scratch-run.mjs';", `from ${JSON.stringify(pathToFileURL(M.write('scripts/scratch-run.mjs', rs, tag + '-run', { esm: true })).href)};`);
  }
  return import(pathToFileURL(M.write('scripts/ci.mjs', src, tag, { esm: true })).href);
};
const listed = (mod, pid, opts) => (mod && mod.judgeScratch ? mod.judgeScratch(opts).victims.some((o) => o.pid === pid) : null);
{
  // (1) the name-only rule: the run record ignored ⇒ every existing dir is judged by the pre-record NAME rule
  const c1 = await copy('name-only', [['readRecord = readRunRecord, bootId', 'readRecord = () => null, bootId']]);
  ok(listed(c1, 500, { procRoot: F.root, now: NOW, self: 999999 }) === true && listed(c1, pA, { now: LATER() }) === true,
    `CONTROL (name-only rule): a copy that ignores the run record reaps the foreign stray under a LIVE owner — the fake one AND the real one (${JSON.stringify(c1.missing || '')})`);
  // (2) the lock removed ⇒ both sweeps run
  const c2 = await copy('no-lock', [['export function acquireReaperLock({ lockPath = defaultReaperLockPath(), waitMs = REAPER_LOCK_WAIT_MS } = {}) {\n', 'export function acquireReaperLock({ lockPath = defaultReaperLockPath(), waitMs = REAPER_LOCK_WAIT_MS } = {}) {\n  return { ok: true, release() { } }; // CONTROL: the lock removed\n']]);
  const r2 = c2 && !c2.missing ? await twoSweeps(M.files[M.files.length - 1], 'nolock', { victimIgnoresTerm: false }) : null;
  ok(!!r2 && r2.res.filter((x) => x && x.skipped).length === 0 && r2.res.filter((x) => x && Array.isArray(x.reaped) && x.reaped.includes(r2.victim)).length === 2,
    'CONTROL (the lock removed): the two sweeps started together BOTH sweep (both judge, both signal the same victim) — the one-sweeps-one-skips leg can go red', r2 ? r2.res : c2);
  // (3) the file-as-root accepted: a non-directory read as a GONE root, and a gone name taken as a directory (incident ②'s reading)
  const c3 = await copy('file-root', [["if (!st.isDirectory()) return { kind: 'other', why: 'a file, not a directory' };", "if (!st.isDirectory()) return { kind: 'gone' };"], ['return ri.kind === \'dir\' || (ri.kind === \'gone\' && x.dirProof && !x.linked);', 'return ri.kind === \'dir\' || ri.kind === \'gone\';']]);
  ok(listed(c3, 510, { procRoot: F.root, now: NOW, self: 999999 }) === true && listed(c3, 511, { procRoot: F.root, now: NOW, self: 999999 }) === true && listed(c3, pB, { now: LATER() }) === true,
    `CONTROL (file-as-root accepted): the shell with the file argument is reaped as "scratch dir gone" — the fake rows and the real planted shell (${JSON.stringify(c3.missing || '')})`);
  // (4) the age rule removed ⇒ incident ①
  const c4 = await copy('no-age', [['          else if (ageOf(i) < staleMs) kept.push(', '          else if (false) kept.push(']]);
  ok(listed(c4, 561, { procRoot: F.root, now: NOW, self: 999999 }) === true && listed(c4, 521, { procRoot: F.root, now: NOW, self: 999999 }) === true,
    'CONTROL (the age rule removed): the stray just planted under a removed dir is reaped at once — incident ①');
  // (5) the starttime ignored ⇒ a recycled pid reads as the owner
  const c5 = await copy('no-starttime', [], { runEdits: [['  if (st.starttime !== Number(rec.starttime)) return', '  if (false) return']] });
  ok(listed(c5, 530, { procRoot: F.root, now: NOW, self: 999999 }) === false && listed(c5, 520, { procRoot: F.root, now: NOW, self: 999999 }) === true,
    'CONTROL (starttime ignored): a copy that trusts the pid alone reads the REUSED pid as the owner and spares its orphan — the reuse leg can go red');
  // (6) verify r1 K7: the seam taken as given ⇒ a table anywhere is judged (the incident: a real `--reap` over a table under the lane HOME)
  const c6 = await copy('seam-as-given', [["  const m = SCRATCH_ROOT_RE.exec(p);\n  if (!m || PRODUCT_ROOT_RE.test(m[0])) throw", "  const m = SCRATCH_ROOT_RE.exec(p);\n  if (false) throw"], ["  const own = seamOwner(m[0]);\n  if (!own.alive) throw", "  const own = { alive: true, why: 'control' };\n  if (!own.alive) throw"]]);   // (a table outside the shape has no scratch root to own it: the owner rule is neutralised with the shape rule)
  const outsideTable = made.find((d) => /^\/var\/tmp\/vs-reaper-seam-/.test(d));
  const c6lines = []; const c6code = c6 && !c6.missing ? (() => { const prev = process.env.VIBESPACE_CI_REAP_PROCFS; process.env.VIBESPACE_CI_REAP_PROCFS = outsideTable; try { return c6.reapByHand({ dryRun: true, now: NOW, self: 999999, log: (m) => c6lines.push(m) }); } finally { if (prev === undefined) delete process.env.VIBESPACE_CI_REAP_PROCFS; else process.env.VIBESPACE_CI_REAP_PROCFS = prev; } })() : null;
  ok(c6code === 0 && c6lines.some((l) => /pid 4999999 .*scratch dir gone/.test(l)) && !c6lines.some((l) => /refused/.test(l)), `CONTROL (the seam taken as given): a copy that skips the scratch-root check judges the table under /var/tmp and lists its pid as a victim — the refusal leg can go red (${JSON.stringify(c6.missing || c6lines.slice(0, 2))})`);
  // (7) verify r1 K5/K8: the signal by number alone ⇒ a recycled pid is SIGKILLed
  const c7 = await copy('signal-by-number', [["const sameProcess = (o, procRoot = defaultProcRoot()) => { const st = procStat(o.pid, procRoot); return !!st && st.state !== 'Z' && st.state !== 'X' && (!o.starttime || st.starttime === o.starttime); };", 'const sameProcess = (o) => alive(o.pid);']]);
  const r7 = c7 && !c7.missing ? await recycledPid(M.files[M.files.length - 1], 'bynumber') : null;
  ok(!!r7 && r7.listed && !r7.alive, `CONTROL (the signal by number alone): a copy that never re-reads the starttime SIGKILLs the pid whose number changed hands — the §5b leg can go red (${r7 ? 'pid ' + r7.pid + ' alive=' + r7.alive : JSON.stringify(c7)})`);
  // (8) verify r1 K5: the closing line by `kill(pid, 0)` ⇒ a zombie reads as "still alive after SIGKILL"
  const c8 = await copy('alive-by-kill0', [['  const left = list.filter((o) => stillRunning(o.pid));', '  const left = list.filter((o) => alive(o.pid));']]);
  const r8 = c8 && !c8.missing ? await zombieVictim(M.files[M.files.length - 1], 'bykill0') : null;
  ok(!!r8 && r8.state === 'Z' && /1 still alive after SIGKILL/.test(r8.last), `CONTROL (alive by kill(pid, 0)): a copy reads the zombie as alive — the §5c leg can go red (${r8 ? r8.last : JSON.stringify(c8)})`);
  // (9) verify r1 K4: the holder without the touch ⇒ the lock file keeps aging while in use
  const c9 = await copy('no-touch', [['flock -w "$2" 9 || exit 75; echo "$$" > "$1" 2>/dev/null; exec cat', 'flock -w "$2" 9 || exit 75; exec cat']]);
  const OLD9 = path.join(MAIN, 'old9.lock'); fs.writeFileSync(OLD9, ''); fs.utimesSync(OLD9, (NOW - 11 * 86400e3) / 1000, (NOW - 11 * 86400e3) / 1000);
  const T9 = c9 && !c9.missing ? c9.acquireReaperLock({ lockPath: OLD9, waitMs: 500 }) : null; const age9 = fs.statSync(OLD9).mtimeMs; const B9 = T9 && T9.ok ? c9.acquireReaperLock({ lockPath: OLD9, waitMs: 200 }) : null; if (T9 && T9.ok) T9.release();
  ok(!!T9 && T9.ok && age9 < NOW - 10 * 86400e3 && !!B9 && !B9.ok && / — its holder wrote no pid /.test(B9.why || ''), `CONTROL (no touch, no pid): a copy whose holder never writes the file leaves it 11 days old while held, and a skip under it cannot name the holder — the touch leg and the holder-named leg can go red (${T9 ? Math.round((NOW - age9) / 86400e3) + ' d; ' + (B9 && B9.why) : JSON.stringify(c9)})`);
  // (10) verify r1 K1: the pre-fix shape — cut at the first excluded character, the rest ignored ⇒ an existing `/tmp/vs-a+b` claims a gone `/tmp/vs-a`
  const c10 = await copy('shape-cut', [["    const next = s.charAt(m[0].length); if (next && next !== '/') continue;\n    const proof = c.dir || next === '/';", "    const next = s.charAt(m[0].length);\n    const proof = c.dir || next === '/';"], ['(\\/tmp\\/vs-[A-Za-z0-9._-]+)(\\/|$)/g', '(\\/tmp\\/vs-[A-Za-z0-9._-]+)(\\/?)/g'], ['(\\/tmp\\/vs-[A-Za-z0-9._-]+)(\\/|$)/.exec(normArg(s))', '(\\/tmp\\/vs-[A-Za-z0-9._-]+)(\\/?)/.exec(normArg(s))']]);
  const v10 = c10 && c10.judgeScratch ? c10.judgeScratch({ procRoot: F.root, now: NOW, self: 999999 }) : null;
  ok(!!v10 && v10.victims.some((o) => o.pid === 571 && o.root === MAIN) && (c10.scratchRootClaims({ cwd: '/', env: {}, argv: ['node', PLUS + '/y'] }).length === 1),
    `CONTROL (the shape cut at an excluded character): a copy convicts the process rooted in the existing ${PLUS}/sub as "${MAIN} is gone" and reads the argv lookalike as a root — the K1 leg can go red (${v10 ? JSON.stringify((v10.victims.find((o) => o.pid === 571) || {}).why) : JSON.stringify(c10)})`);
  // (12) verify r2 R2: the seam SIGNALS ⇒ the real pid a scratch-root table names dies (the re-check reads the same table)
  // verify r3 (T1): THREE walls stand between a seam and a signal — the caller's `if (seam) return`, the signal site's own refusal
  // under VIBESPACE_CI_REAP_PROCFS, and the re-check against the KERNEL's /proc (a fake row's starttime is never the real one);
  // this control removes all three, (12b) below removes each alone and the child lives
  const SYNC_DRY_RETURN = ["    if (seam) { log(seamDryLine(list.length)); return list; } // verify r2 R2: a seam lists, never signals\n    signalVictims(list, 'SIGTERM', opts.procRoot);\n    const until = Date.now() + graceMs;\n    while (Date.now() < until && list.some((o) => alive(o.pid) && sameProcess(o, opts.procRoot || '/proc'))) Atomics.wait", "    signalVictims(list, 'SIGTERM', opts.procRoot);\n    const until = Date.now() + graceMs;\n    while (Date.now() < until && list.some((o) => alive(o.pid) && sameProcess(o, opts.procRoot || '/proc'))) Atomics.wait"];
  const ASYNC_DRY_RETURN = ["    if (seam) { log(seamDryLine(list.length)); return list; } // verify r2 R2: a seam lists, never signals\n    signalVictims(list, 'SIGTERM', opts.procRoot);\n    const until = Date.now() + graceMs;\n    while (Date.now() < until && list.some((o) => alive(o.pid) && sameProcess(o, opts.procRoot || '/proc'))) await", "    signalVictims(list, 'SIGTERM', opts.procRoot);\n    const until = Date.now() + graceMs;\n    while (Date.now() < until && list.some((o) => alive(o.pid) && sameProcess(o, opts.procRoot || '/proc'))) await"];
  const SIGNAL_CHOKE = ["  if (!procRoot && process.env.VIBESPACE_CI_REAP_PROCFS) { log(`[ci] scratch reaper: ${list.length} victim(s) NOT signalled — VIBESPACE_CI_REAP_PROCFS is set and no in-process table was handed in (a seam is dry)`); return 0; } // an env seam: a table's word about a pid is not the kernel's\n", ''];
  const KERNEL_RECHECK = ["  let n = 0; for (const o of list) { if (sameProcess(o, procRoot || '/proc')) {", "  let n = 0; for (const o of list) { if (sameProcess(o, procRoot)) {"];
  const c12 = await copy('seam-signals', [SYNC_DRY_RETURN, SIGNAL_CHOKE, KERNEL_RECHECK]);
  const v12 = spawn(process.execPath, ['-e', 'setInterval(() => { }, 1000)'], { cwd: QUIET_CWD, env: QUIET_ENV, stdio: 'ignore' }); plant(v12.pid); for (let i = 0; i < 100 && !procStat(v12.pid); i++) sleepSync(10);
  const P12 = fakeProc('c12'); P12.mk(v12.pid, { name: 'node', argv: ['node', 'leaked-server.js'], cwd: sib('gone-c12'), born: OLD });
  const r12 = c12 && !c12.missing ? (() => { const prev = process.env.VIBESPACE_CI_REAP_PROCFS; process.env.VIBESPACE_CI_REAP_PROCFS = P12.root; try { return c12.reapScratchOrphans({ lockPath: path.join(MAIN, 'c12.lock'), now: NOW, self: 999999, graceMs: 500, log: () => { } }); } finally { if (prev === undefined) delete process.env.VIBESPACE_CI_REAP_PROCFS; else process.env.VIBESPACE_CI_REAP_PROCFS = prev; } })() : null;
  let dead12 = false; for (let i = 0; i < 40 && !(dead12 = !(procStat(v12.pid) && procStat(v12.pid).state !== 'Z')); i++) await sleep(50);
  ok(!!r12 && r12.length === 1 && dead12, `CONTROL (the seam signals): a copy that signals under the seam kills the real pid the table named (pid ${v12.pid} dead=${dead12}) — the R2 leg can go red (${JSON.stringify((c12 && c12.missing) || '')})`);
  // (12b) verify r3 (T1): THE CALLER'S FLAG IS NOT LOAD-BEARING. Reproduced on a copy of r2's product: one NEW caller of
  // signalVictims (judge, then signal — no `if (seam)`) under a seam naming a real child of this suite: SIGKILLed off the fake
  // row (the identity re-check read the seam's own table). Now each wall alone: the sync caller's return removed, the async
  // caller's return removed, a third caller that never had one — the child lives through all three; the signal site refuses.
  const NEW_CALLER = ['/** SIGTERM, then SIGKILL the survivors after `graceMs`', "export function newCallerSweep(opts = {}) { const list = scratchOrphans(opts); signalVictims(list, 'SIGKILL', opts.procRoot, opts.log); return list; }\n/** SIGTERM, then SIGKILL the survivors after `graceMs`"];
  const c12b = await copy('seam-caller-forgets', [SYNC_DRY_RETURN, ASYNC_DRY_RETURN, NEW_CALLER]);
  const v12b = spawn(process.execPath, ['-e', 'setInterval(() => { }, 1000)'], { cwd: QUIET_CWD, env: QUIET_ENV, stdio: 'ignore' }); plant(v12b.pid); for (let i = 0; i < 100 && !procStat(v12b.pid); i++) sleepSync(10);
  const start12b = procStat(v12b.pid).starttime; const lines12b = [];
  const P12b = fakeProc('c12b'); P12b.mk(v12b.pid, { name: 'node', argv: ['node', 'leaked-server.js'], cwd: sib('gone-c12b'), born: OLD });
  const r12b = c12b && !c12b.missing ? await (async () => { const prev = process.env.VIBESPACE_CI_REAP_PROCFS; process.env.VIBESPACE_CI_REAP_PROCFS = P12b.root; try { const a = c12b.reapScratchOrphans({ lockPath: path.join(MAIN, 'c12b.lock'), now: NOW, self: 999999, graceMs: 300, log: () => { } }); const b = await c12b.reapScratchOrphansAsync({ lockPath: path.join(MAIN, 'c12b.lock'), now: NOW, self: 999999, graceMs: 300, log: () => { } }); const c = c12b.newCallerSweep({ now: NOW, self: 999999, log: (x) => lines12b.push(x) }); return [a, b, c].map((l) => l.map((o) => o.pid)); } finally { if (prev === undefined) delete process.env.VIBESPACE_CI_REAP_PROCFS; else process.env.VIBESPACE_CI_REAP_PROCFS = prev; } })() : null;
  await sleep(400);
  const still12b = () => { const st = procStat(v12b.pid); return !!st && st.state !== 'Z' && st.state !== 'X' && st.starttime === start12b; };
  ok(!!r12b && r12b.every((l) => l.length === 1 && l[0] === v12b.pid) && still12b(), `verify r3 (T1): a copy whose sync AND async callers forgot the dry return, plus a third caller that never had one, all LIST the child under the seam and NONE signals it — the signal site is the choke point (pid ${v12b.pid} alive=${still12b()}; ${JSON.stringify((c12b && c12b.missing) || r12b)})`);
  ok(lines12b.some((l) => /^\[ci\] scratch reaper: 1 victim\(s\) NOT signalled — VIBESPACE_CI_REAP_PROCFS is set and no in-process table was handed in/.test(l)), `verify r4 (X1c): the signal site's refusal is SAID to the forgetful caller's log — never a silent return 0 behind a closing line that counts survivors of a signal never sent (${JSON.stringify(lines12b)})`);
  ok(/if \(!procRoot && process\.env\.VIBESPACE_CI_REAP_PROCFS\) \{ log\(`\[ci\] scratch reaper: \$\{list\.length\} victim\(s\) NOT signalled/.test(ciSrc) && /sameProcess\(o, procRoot \|\| '\/proc'\)/.test(ciSrc) && !/sameProcess\(o, opts\.procRoot\)\)/.test(ciSrc), 'WIRING: signalVictims refuses under the env seam and re-checks identity against the kernel\'s /proc unless an in-process table was handed in (and so does the grace loop)');
  // (13) verify r2 R4: the kernel's (deleted) marker not stripped ⇒ a cwd that WAS the root names no root at all (r1's boundary rule alone)
  const c13 = await copy('deleted-marker-kept', [["  const cands = [{ p: cwdDel ? cwdStr.replace(/ \\(deleted\\)$/, '') : cwdStr, via: 'cwd', dir: true, gone: cwdDel }", "  const cands = [{ p: cwdStr, via: 'cwd', dir: true, gone: false }"]]);
  const v13 = c13 && c13.judgeScratch ? c13.judgeScratch({ procRoot: F.root, now: NOW, self: 999999 }) : null;
  ok(!!v13 && ![...v13.victims, ...v13.spared, ...v13.ignored].some((o) => o.pid === 573) && c13.scratchRootClaims({ cwd: R.goneA + ' (deleted)' }).length === 0, `CONTROL (the (deleted) marker kept): a copy that reads the kernel's marker as part of the name lists the hour-old daemon NOWHERE — the R4 leg can go red (${JSON.stringify((c13 && c13.missing) || '')})`);
  // (14) verify r2 R1: the seam's path taken lexically ⇒ a symlink under a scratch root to the outside table is accepted
  const c14 = await copy('seam-lexical-path', [["  let p; try { p = fs.realpathSync(v); } catch { p = path.resolve(v); }", "  const p = path.resolve(v);"]]);
  const c14lines = []; const c14code = c14 && !c14.missing ? (() => { const prev = process.env.VIBESPACE_CI_REAP_PROCFS; process.env.VIBESPACE_CI_REAP_PROCFS = path.join(MAIN, 'seam-link'); try { return c14.reapByHand({ dryRun: true, now: NOW, self: 999999, log: (m) => c14lines.push(m) }); } finally { if (prev === undefined) delete process.env.VIBESPACE_CI_REAP_PROCFS; else process.env.VIBESPACE_CI_REAP_PROCFS = prev; } })() : null;
  ok(c14code === 0 && c14lines.some((l) => /pid 4999999 .*scratch dir gone/.test(l)) && !c14lines.some((l) => /refused/.test(l)), `CONTROL (the seam's path taken lexically): a copy that never resolves the symlink judges the table under /var/tmp through ${path.join(MAIN, 'seam-link')} — the symlink leg can go red (${JSON.stringify((c14 && c14.missing) || c14lines.slice(0, 1))})`);
  // (15) verify r2 R1: the seam's root owner not asked ⇒ a finished run's stale table is accepted
  const c15 = await copy('seam-owner-unasked', [["  const own = seamOwner(m[0]);\n  if (!own.alive) throw", "  const own = { alive: true, why: 'control' };\n  if (!own.alive) throw"]]);
  const c15lines = []; const c15code = c15 && !c15.missing ? (() => { const prev = process.env.VIBESPACE_CI_REAP_PROCFS; process.env.VIBESPACE_CI_REAP_PROCFS = path.join(sib('staleseam'), 'procfs'); try { return c15.reapByHand({ dryRun: true, now: NOW, self: 999999, log: (m) => c15lines.push(m) }); } finally { if (prev === undefined) delete process.env.VIBESPACE_CI_REAP_PROCFS; else process.env.VIBESPACE_CI_REAP_PROCFS = prev; } })() : null;
  ok(c15code === 0 && c15lines.some((l) => /pid 4999989 .*scratch dir gone/.test(l)) && !c15lines.some((l) => /refused/.test(l)), `CONTROL (the seam's owner unasked): a copy that never reads the root's record judges the finished run's table — the stale-seam leg can go red (${JSON.stringify((c15 && c15.missing) || c15lines.slice(0, 1))})`);
  // (16) verify r2 R4: no normalization ⇒ "<gone>/../<live>" is read as the gone root and its process convicted after the floor
  const c16 = await copy('path-unnormalized', [["const normPath = (x) => { const s = String(x || ''); return s.startsWith('/') ? path.posix.normalize(s) : s; };", "const normPath = (x) => String(x || '');"]]);
  const v16 = c16 && c16.judgeScratch ? c16.judgeScratch({ procRoot: F.root, now: NOW, self: 999999 }) : null;
  ok(!!v16 && v16.victims.some((o) => o.pid === 575 && o.root === R.goneA) && v16.victims.some((o) => o.pid === 576 && o.root === R.goneA), `CONTROL (paths unnormalized): a copy that reads the shape off the raw string convicts both under the GONE root the path walks through — the normalization leg can go red (${JSON.stringify((c16 && c16.missing) || (v16 && (v16.victims.find((o) => o.pid === 575) || {}).why))})`);
  // (17) verify r3 (T2): the kernel's stat ignored ⇒ the marker is trusted as a string ⇒ the literal-name directory's process is convicted
  const c17 = await copy('kernel-stat-ignored', [["cwdGone = st ? st.nlink === 0 : code === 'ENOENT'; }", 'cwdGone = true; }']]);
  const v17 = c17 && c17.judgeScratch ? c17.judgeScratch({ procRoot: F.root, now: NOW, self: 999999 }) : null;
  ok(!!v17 && v17.victims.some((o) => o.pid === 577 && o.why === 'scratch dir gone' && o.root === `${sib('lit')} (deleted)`), `CONTROL (the kernel's stat ignored): a copy that trusts the marker as a string convicts the process in the EXISTING literal-name directory as dir-gone — the T2 literal-name leg can go red (${JSON.stringify((c17 && c17.missing) || (v17 && (v17.victims.find((o) => o.pid === 577) || {}).why))})`);
  // (18) verify r3 (T2): a gone claim read through the PATH ⇒ a new run's record at the recreated path spares the old run's stray
  const c18 = await copy('gone-claim-by-path', [['    const live = claims.map((c) => (c.gone ? null : rootInfo(c.root))).find((ri) => ri && ri.owner && ri.owner.alive);', '    const live = claims.map((c) => rootInfo(c.root)).find((ri) => ri && ri.owner && ri.owner.alive);']]);
  const v18 = c18 && c18.judgeScratch ? c18.judgeScratch({ procRoot: F.root, now: NOW, self: 999999 }) : null;
  ok(!!v18 && !v18.victims.some((o) => o.pid === 574) && /owner is alive/.test((v18.spared.find((o) => o.pid === 574) || {}).why || ''), `CONTROL (a gone claim read through the path): a copy that asks the recreated path's record spares the stray in the deleted inode — the T2 recreated-path leg can go red (${JSON.stringify((c18 && c18.missing) || (v18 && (v18.spared.find((o) => o.pid === 574) || {}).why))})`);
  // (19) verify r3 (T3): the judge resolves the seam again ⇒ a symlink re-pointed after the announce line is judged in its place
  const c19 = await copy('seam-resolved-twice', [["    const list = scratchOrphans({ ...opts, procRoot: table });\n    if (!list.length) return list;\n    for (const line of reapReport(list)) log(line);\n    if (seam) { log(seamDryLine(list.length)); return list; } // verify r2 R2: a seam lists, never signals\n    signalVictims(list, 'SIGTERM', opts.procRoot);\n    const until = Date.now() + graceMs;\n    while (Date.now() < until && list.some((o) => alive(o.pid) && sameProcess(o, opts.procRoot || '/proc'))) Atomics.wait", "    const list = scratchOrphans(opts);\n    if (!list.length) return list;\n    for (const line of reapReport(list)) log(line);\n    if (seam) { log(seamDryLine(list.length)); return list; } // verify r2 R2: a seam lists, never signals\n    signalVictims(list, 'SIGTERM', opts.procRoot);\n    const until = Date.now() + graceMs;\n    while (Date.now() < until && list.some((o) => alive(o.pid) && sameProcess(o, opts.procRoot || '/proc'))) Atomics.wait"]]);
  const r19 = c19 && !c19.missing ? swapSweep(c19) : null;
  ok(!!r19 && r19.list.length === 1 && r19.list[0].pid === 4999997 && r19.lines[0].includes(swapA) && r19.lines.some((l) => l.includes('4999997')), `CONTROL (the seam resolved twice): a copy whose judge resolves the seam itself announces table A and lists table B's row — the T3 leg can go red (${JSON.stringify((c19 && c19.missing) || (r19 && r19.list.map((o) => o.pid)))})`);
  // (20) verify r3 (T4): the owner's uid unasked ⇒ a record naming pid 1 is an owner alive for ever (the seam under it accepted, its root's strays spared)
  const c20 = await copy('owner-uid-unasked', [], { runEdits: [['  const puid = uid == null ? null : procUid(rec.pid, procRoot);\n  if (puid != null && puid !== uid) return', '  const puid = null;\n  if (puid != null && puid !== uid) return']] });
  const forgedDir = mkRoot('forgedctl'); writeRecord(forgedDir, { v: 1, run: 'forged', pid: 1, starttime: procStat(1).starttime, bootId: machineBootId(), createdAt: HOUR_AGO });
  const pForged = orphan([process.execPath, '-e', 'setTimeout(() => { }, 90000)', `${forgedDir}/x`]); plant(pForged); for (let i = 0; i < 100 && !procStat(pForged); i++) sleepSync(10);
  const v20 = c20 && c20.judgeScratch ? c20.judgeScratch({ now: LATER() }) : null, v20real = judgeScratch({ now: LATER() });
  ok(!!v20 && /owner is alive \(run forged pid 1 is alive\)/.test((v20.spared.find((o) => o.pid === pForged) || {}).why || '') && /^owner gone: run forged pid 1 is another user's process/.test((v20real.victims.find((o) => o.pid === pForged) || {}).why || ''),
    `CONTROL (the owner's uid unasked): a copy that never asks whose process pid 1 is spares the reparented stray under the forged root for ever, where the product convicts it an hour later (${JSON.stringify((c20 && c20.missing) || (v20real.victims.find((o) => o.pid === pForged) || {}).why)})`);
  // (21) verify r3 (T6): the holder's open on the bare special builtin ⇒ a file it cannot open ends sh with exit 2, the `cannot open` line never printed
  const c21 = await copy('holder-bare-exec', [["const LOCK_HOLDER_SH = 'command exec 9>>", "const LOCK_HOLDER_SH = 'exec 9>>"]]);
  const RO21 = path.join(MAIN, 'ro21.lock'); fs.writeFileSync(RO21, ''); fs.chmodSync(RO21, 0o000);
  const t21 = c21 && !c21.missing && process.getuid() !== 0 ? c21.acquireReaperLock({ lockPath: RO21, waitMs: 300 }) : null;
  ok(process.getuid() === 0 || (!!t21 && !t21.ok && /^the lock holder exited 2$/.test(t21.why || '')), `CONTROL (the holder's bare exec): a copy whose holder opens the file on the special builtin reads "the lock holder exited 2" for a file it cannot open — the cannot-open leg can go red (${JSON.stringify((c21 && c21.missing) || (t21 && t21.why))})`);
  // (22) verify r3 (T6): the holder's comm unasked ⇒ a reused pid is named as the holder
  const c22 = await copy('holder-comm-unasked', [["  if (st.comm !== 'cat') return ` — the pid ${pid} it named now runs ${st.comm}, not a holder", "  if (false) return ` — the pid ${pid} it named now runs ${st.comm}, not a holder"]]);
  const A22 = c22 && !c22.missing ? c22.acquireReaperLock({ lockPath: path.join(MAIN, 'c22.lock'), waitMs: 1000 }) : null; if (A22 && A22.ok) fs.writeFileSync(path.join(MAIN, 'c22.lock'), `${process.pid}\n`);
  const B22 = A22 && A22.ok ? c22.acquireReaperLock({ lockPath: path.join(MAIN, 'c22.lock'), waitMs: 300 }) : null; if (A22 && A22.ok) A22.release();
  ok(!!B22 && !B22.ok && new RegExp(` — held by pid ${process.pid} \\(\\S+, parent \\d+`).test(B22.why || ''), `CONTROL (the holder's comm unasked): a copy names this suite (the reused number) as the holder — the reused-pid leg can go red (${JSON.stringify((c22 && c22.missing) || (B22 && B22.why))})`);
  // (23) verify r4 (X2b): the stat unconfined ⇒ every (deleted) cwd on the box is stat'd through its magic link — a hung mount anywhere holds the sweep
  const c23 = await copy('stat-unconfined', [["  if (/ \\(deleted\\)$/.test(cwd) && SCRATCH_ROOT_RE.test(cwd)) { let st = null, code = null;", "  if (/ \\(deleted\\)$/.test(cwd)) { let st = null, code = null;"]]);
  const s23 = c23 && !c23.missing ? statSpy(() => c23.judgeScratch({ procRoot: F.root, now: NOW, self: 999999 })) : null;
  ok(!!s23 && s23.seen.includes(cwdLink(F.root, 579)) && s23.seen.includes(cwdLink(F.root, 573)), `CONTROL (the stat unconfined): a copy stats the (deleted) cwd outside the scratch shape too — the X2b leg can go red (${JSON.stringify((c23 && c23.missing) || (s23 && s23.seen.filter((p) => /\/cwd$/.test(p)).length))})`);
  // (24) verify r4 (X2c): the kernel's answer about the directory itself unasked ⇒ a cwd gone by path is a gone root, whatever namespace holds it
  const c24 = await copy('linked-unasked', [["  const linkedElsewhere = (i) => { try { const st = fs.statSync(path.join(procRoot, String(i.pid), 'cwd')); return st.isDirectory() && st.nlink > 0; } catch { return false; } };", "  const linkedElsewhere = (i) => false;"]]);
  const v24 = c24 && !c24.missing ? c24.judgeScratch({ procRoot: F.root, now: NOW, self: 999999, exists: NS_EXISTS }) : null;
  ok(!!v24 && v24.victims.some((o) => o.pid === 581 && o.why === 'scratch dir gone' && o.root === NSROOT), `CONTROL (the linked directory unasked): a copy convicts the daemon in another mount namespace as "scratch dir gone" — the X2c leg can go red (${JSON.stringify((c24 && c24.missing) || (v24 && (v24.victims.find((o) => o.pid === 581) || v24.ignored.find((o) => o.pid === 581) || {}).why))})`);
  // (25) B-442c (2026-10-02, the 16:23 OOM): THE AGE IS THE KERNEL'S — btime + starttime, never the /proc/<pid> dir's mtime. procfs
  // stamps that mtime when it instantiates the inode; the OOM's dentry eviction re-instantiated every one at 16:23:10, and
  // `--reap --dry-run` spared hour-old orphans as "young: 42 s". A table that states its boot (a root `stat` with btime): a row
  // born an hour ago by its STARTTIME whose dir reads NOW, and the reverse, both under a gone root.
  {
    const T = fakeProc('btime'), BOOT_S = Math.floor(NOW / 1000) - 86400, GONE = sib('gone-btime');
    fs.writeFileSync(path.join(T.root, 'stat'), `cpu  1 2 3 4\nbtime ${BOOT_S}\nprocesses 9\n`);
    const tick = (bornMs) => Math.round((bornMs - BOOT_S * 1000) / 10);   // USER_HZ = 100
    T.mk(4700, { name: 'vibespace-device', argv: ['vibespace-device'], cwd: GONE, born: NOW, starttime: tick(HOUR_AGO) });
    T.mk(4701, { name: 'node', argv: ['node', 'x.js'], cwd: GONE, born: HOUR_AGO, starttime: tick(NOW - 60 * 1000) });
    const V = judgeScratch({ procRoot: T.root, now: NOW, self: 999999 });
    const v = V.victims.find((o) => o.pid === 4700), sp = V.spared.find((o) => o.pid === 4701);
    ok(!!v && Math.abs(v.ageMs - 3600 * 1000) < 2000, `B-442c: a process born an hour ago by its starttime is OLD although its /proc dir reads NOW (the post-eviction state) — convicted at ${v ? Math.round(v.ageMs / 60000) : '?'} min`, v || V.spared.find((o) => o.pid === 4700));
    ok(!!sp && /^young: (?:1 min|60 s) /.test(sp.why), `B-442c: …and one born a minute ago is YOUNG although its dir reads an hour — the age has ONE source (${sp && sp.why})`);
    const c25 = await copy('dir-mtime-age', [['  let bornMs = procBornMs({ starttime }, bootMs);\n  if (bornMs == null) try {', '  let bornMs = null;\n  try {']]);
    const v25 = c25 && !c25.missing ? c25.judgeScratch({ procRoot: T.root, now: NOW, self: 999999 }) : null;
    const s25 = v25 && v25.spared.find((o) => o.pid === 4700);
    ok(!!s25 && /^young: \d+ s < the 10 min stale floor/.test(s25.why), `CONTROL (the pre-fix age, the dir's mtime): a copy spares the hour-old orphan as "${s25 ? s25.why.slice(0, 40) : (c25 && c25.missing) || '?'}" — the incident's words`);
    // the REAL kernel agrees with this process's OWN clock (node's timeOrigin is its start, measured without /proc)
    const mine = procBornMs(procStat(process.pid), procBootMs());
    ok(mine != null && Math.abs(mine - performance.timeOrigin) < 1500, `B-442c: on the real /proc, btime + starttime / USER_HZ is this process's start by its own clock (Δ ${mine == null ? '?' : Math.round(mine - performance.timeOrigin)} ms; a wrong USER_HZ would be off by its uptime)`);
  }
  // (26) B-442c: a scratch server's DAEMON is ended by its OWN root env. Real processes under a scratch root: A = a daemon (title
  // vibespace-device) in state/agentd.pid; B = a self-upgrade's re-exec child (`node <root>/<ver>/agentd.js`) NOT yet in the pid
  // file; C = a session-shaped sibling with the same env (not a daemon); D = a daemon of ANOTHER root. The pre-fix suite's kill
  // (the pid file only) leaves B — the incident's orphan; endDaemonsOf ends A and B and nothing else.
  {
    const R = mkRoot('daemons'), DR = path.join(R, 'd'), OTHER = path.join(mkRoot('daemons-other'), 'd');
    fs.mkdirSync(path.join(DR, 'state'), { recursive: true }); fs.mkdirSync(path.join(DR, '9.9.9'), { recursive: true });
    const BUNDLE = path.join(DR, '9.9.9', 'agentd.js'); fs.writeFileSync(BUNDLE, 'setInterval(() => { }, 1e6);\n');
    const run = (argv, env) => { const c = spawn(process.execPath, argv, { cwd: QUIET_CWD, env: { ...QUIET_ENV, ...env }, stdio: 'ignore', detached: true }); c.unref(); plant(c.pid); return c.pid; };
    const TITLE = "process.title = 'vibespace-device'; setInterval(() => { }, 1e6);";
    const A = run(['-e', TITLE], { VIBESPACE_AGENTD_ROOT: DR }), B = run([BUNDLE], { VIBESPACE_AGENTD_ROOT: DR });
    const C = run(['-e', 'setInterval(() => { }, 1e6);'], { VIBESPACE_AGENTD_ROOT: DR }), D = run(['-e', TITLE], { VIBESPACE_DEVICE_ROOT: OTHER });
    const comm = (pid) => { try { return fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim(); } catch { return ''; } };
    for (let k = 0; k < 100 && !(comm(A).startsWith('vibespace-devic') && comm(D).startsWith('vibespace-devic')); k++) sleepSync(20);
    fs.writeFileSync(path.join(DR, 'state', 'agentd.pid'), String(A));
    const alive = (pid) => { const st = procStat(pid); return !!st && st.state !== 'Z' && st.state !== 'X'; };
    // endRootedProcesses LISTS a daemon rooted by nothing but its root env (signal 0): its title hides argv, HOME and cwd are `/`
    ok(endRootedProcesses(R, { signal: 0 }).includes(A) && !endRootedProcesses(R, { signal: 0 }).includes(D), 'B-442c: endRootedProcesses names a title-rewritten daemon by its VIBESPACE_*_ROOT env (cwd and HOME `/`, argv hidden) — and not another root\'s');
    try { process.kill(Number(fs.readFileSync(path.join(DR, 'state', 'agentd.pid'), 'utf8')), 'SIGKILL'); } catch { }   // the pre-fix killDaemons
    sleepSync(150);
    ok(!alive(A) && alive(B), `CONTROL (the pre-fix suite's kill, the pid file only): the daemon it names is gone and the re-exec child it never named survives (pid ${B}) — the incident's orphan`);
    const ended = endDaemonsOf(DR, { passes: 2, settleMs: 50 });
    sleepSync(150);
    ok(ended.includes(B) && !alive(B), `B-442c: endDaemonsOf ends the re-exec child by its root env + its agentd bundle argv (ended ${JSON.stringify(ended)})`);
    ok(alive(C) && alive(D) && !ended.includes(C) && !ended.includes(D), 'B-442c: …and leaves a non-daemon with the same env (a session) and another root\'s daemon alive');
    let refused = null; try { endDaemonsOf('/home'); } catch (e) { refused = e.message; }
    ok(/refusing root/.test(refused || ''), 'endDaemonsOf refuses a root outside /tmp (a scratch dir only)');
  }
  for (const c of copiesCensus(M.files, M.dir, REPO, { minCopies: 25 })) ok(c.pass, c.name + (c.pass ? '' : ' — ' + c.detail));
}
// the owner record really is what spared the real stray: end the owner, and the same (dry) judgement convicts it
{
  owner.stdin.end();
  for (let i = 0; i < 100 && procStat(owner.pid) && procStat(owner.pid).state !== 'Z'; i++) await sleep(20);
  const v = judgeScratch({ now: LATER() });
  ok(/^owner gone: run foreign-run pid \d+ (is gone|has exited \(a zombie\))$/.test((find(v.victims, pA) || {}).why || ''), `…and once its owner has exited the same stray IS convicted (dry: ${(find(v.victims, pA) || {}).why}) — the record, not luck, spared it`);
  ok(/^young: /.test((find(judgeScratch({}).spared, pA) || {}).why || ''), '…while with the real clock it is seconds old and spared: no sweep on the box can take it before this suite ends it');
}

// ── §8 WIRING: who writes a record, who takes the lock ───────────────────
console.log('\n§8 wiring');
{
  const ci = ciSrc, scr = fs.readFileSync(path.join(REPO, 'scripts', 'scratch.mjs'), 'utf8'), mut = fs.readFileSync(path.join(REPO, 'scripts', 'mutant-copy.mjs'), 'utf8');
  const fnBody = (src, head) => { const i = src.indexOf(head); if (i < 0) return ''; const j = src.indexOf('\n}\n', i); return src.slice(i, j < 0 ? undefined : j); };
  ok(/stampScratchRun\(wt, \{ run: GIT_ENV\.VIBESPACE_CI_RUN \}\)/.test(fnBody(ci, 'function addScratchWorktree(')), 'ci.mjs stamps its isolated scratch worktree (both tiers) with this run\'s record');
  ok(/markCiRun\('fast'\)/.test(fnBody(ci, 'function fastGate(')) && /markCiRun\('heavy'\)/.test(fnBody(ci, 'async function heavyGate(')), 'both tiers name their run (VIBESPACE_CI_RUN) for every record their suites write');
  ok(!/acquireMachineLock\(/.test(fnBody(ci, 'function fastGate(')), 'the FAST tier does not take the heavy machine lock: two fast tiers may run — only their SWEEPS serialise');
  ok(/const lock = acquireReaperLock\(/.test(fnBody(ci, 'export function reapScratchOrphans(')) && /const lock = await acquireReaperLockAsync\(/.test(fnBody(ci, 'export async function reapScratchOrphansAsync(')), 'both reapers take the sweep lock first');
  ok(/stampScratchRun\(dir\)/.test(fnBody(scr, 'export function scratchDir(')) && /stampScratchRun\(home\)/.test(fnBody(scr, 'export function scratchHome(')) && /stampScratchRun\(dir\)/.test(fnBody(mut, 'export function mutantCopies(')),
    'scratch.mjs scratchDir + scratchHome and mutant-copy\'s dirs stamp their roots');
  // every stub repository the gate's own gates build copies ALL of ci.mjs's relative imports (a missing sibling = a stub whose ci.mjs cannot load)
  const sibs = [...ci.matchAll(/^import [^\n]* from '\.\/([^']+)';$/gm)].map((m) => m[1]).sort();
  const stubbers = ['test-ci-gate.mjs', 'test-ci-heavy-launch.mjs'].map((f) => [f, fnBody(fs.readFileSync(path.join(REPO, 'scripts', f), 'utf8'), 'function stubGateRepo(')]);
  ok(sibs.includes('scratch-run.mjs') && stubbers.every(([, b]) => sibs.every((s) => b.includes(`'${s}'`))), `both stub builders copy every sibling ci.mjs imports (${sibs.join(', ')})`, stubbers.map(([f, b]) => [f, sibs.filter((s) => !b.includes(`'${s}'`))]));
  ok(/^\.vs-run\.json$/m.test(fs.readFileSync(path.join(REPO, '.gitignore'), 'utf8')), '.vs-run.json is gitignored (the isolated worktree\'s record is never a change)');
  // verify r2 (R6): the launcher's pre-launch sweep SAYS a refused seam (r1 K7 replaced a bare `catch { }`) — nothing gated
  // that print (the revert table found it uncaught); a launcher's stderr is the one place a pusher sees the refusal before the tier
  ok(/try \{ reapScratchOrphans\(\{ log: \(m\) => console\.error\(m\) \}\); \} catch \(e\) \{ console\.error\(`\[ci:heavy\] scratch reaper skipped: \$\{e && e\.message\}`\); \}/.test(fnBody(ci, 'function heavyLaunch(')),
    'WIRING: the heavy launcher prints a refused seam (`[ci:heavy] scratch reaper skipped: …`) instead of swallowing it');
}
} finally {
  endPlanted();
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
// B-35e3 pull-mount freshness (2.369.202): the rclone argv of a pull mount and heldRefresher's rules over a fake /proc — idle costs nothing, a GET finds held files, a moved device stat drops their pages (plus one same-second pass), gone holders stop the ticks
// The real chain (agentd + rclone + held readers) is test-device-mount-rclone's
// B-35e3 leg; this suite pins the rules it cannot make deterministic.
// Run: node scripts/test-pull-refresh.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const { heldRefresher, pullMountArgs, isMountDaemonOf, mountDaemonsOf, killMountDaemons } = require('../src/device-mount.js');
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 2000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await sleep(5); } return cond(); };
// a value that stays the same for n looks in a row (an effect that is NOT coming — never a fixed sleep)
const quiet = async (f, ms = 3000, n = 15) => { const t0 = Date.now(); let last, same = 0; while (Date.now() - t0 < ms) { const v = f(); if (v === last) { if (++same >= n) return v; } else { same = 0; last = v; } await sleep(3); } return f(); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pullref-'));
const proc = path.join(tmp, 'proc');
const mp = path.join(tmp, 'mnt');
const hold = (pid, fd, target) => { fs.mkdirSync(path.join(proc, String(pid), 'fd'), { recursive: true }); fs.symlinkSync(target, path.join(proc, String(pid), 'fd', String(fd))); };
const db = path.join(mp, 'chat.db');
hold(111, 3, db);
hold(111, 4, '/elsewhere/x.db'); // outside the mount
hold(222, 5, mp + '2/y.db'); // a sibling dir that merely shares the prefix
fs.mkdirSync(path.join(proc, 'self'), { recursive: true }); // non-numeric entries are skipped

let scans = 0, slowScan = 0;
const realReaddir = fs.promises.readdir;
fs.promises.readdir = async function (p, ...a) { if (p === proc) { scans++; if (slowScan) await sleep(slowScan); } return realReaddir.call(this, p, ...a); };

const remote = new Map([[db, { size: 8192, mtime: 'Fri, 02 Oct 2026 10:00:00 GMT' }]]);
let stats = 0, down = false; const inval = [];
const r = heldRefresher({
  mountpoint: mp, procRoot: proc, tickMs: 40, scanGapMs: 120, scanDelayMs: 10,
  statRemote: async (abs) => { stats++; return down ? null : (remote.get(abs) || null); },
  invalidate: async (paths) => { inval.push([...paths]); },
});
// §15 A — THE REAL CHAIN (B-fcc7), started here so its mount waits run beside §1–§14's: a fake fusermount3 AND fusermount on
// PATH (their argv logged), a fake rclone (`mount vsdev: <mp> …`: writes <mp>.pid, then sleeps as itself), one that dies at
// once, a fake device. Every child here is ended by its HANDLE or by the leg that saw it exit — never a pid read back (r1 #7)
const FC = path.join(tmp, 'fcc7'); fs.mkdirSync(path.join(FC, 'bin'), { recursive: true });
const fuseLog = path.join(FC, 'fusermount.log'); fs.writeFileSync(fuseLog, '');
for (const f of ['fusermount3', 'fusermount']) fs.writeFileSync(path.join(FC, 'bin', f), `#!/bin/sh\necho "$*" >> '${fuseLog}'\n`, { mode: 0o755 });
const RC = path.join(FC, 'bin', 'fake-rclone');
fs.writeFileSync(RC, '#!/bin/sh\necho $$ > "$3.pid"\nexec sleep 60\n', { mode: 0o755 });
const RCD = path.join(FC, 'bin', 'fake-rclone-dies');
fs.writeFileSync(RCD, '#!/bin/sh\nexit 3\n', { mode: 0o755 });
const PATH0 = process.env.PATH; process.env.PATH = path.join(FC, 'bin') + ':' + PATH0;
// the RELEASE's source of a file (the red controls) — an OLD git object: a depth-1 checkout does not hold it (test-architecture
// §75), so a missing one is null and its control says SKIP by name
const BASE_REF = 'b06f36e90';
const releaseSrc = (rel) => {
  try { return require('child_process').execFileSync('git', ['show', `${BASE_REF}:${rel}`], { cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch { return null; }
};
const fuses = (mpX) => fs.readFileSync(fuseLog, 'utf8').split('\n').filter((l) => l === `-uz ${mpX}`).length;
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const kids = [];   // ChildProcess handles this suite spawned itself
const pidFile = async (mpX) => { let v = 0; await until(() => { try { v = Number(fs.readFileSync(mpX + '.pid', 'utf8')); } catch { v = 0; } return v > 0; }); return v; };
const realChain = (async () => {
  const DM = require('../src/device-mount.js');
  const mpA = path.join(FC, 'mnt-a'); const gone = [], unserved = [];
  const device = { serveFolder: async () => ({ port: 4100 }), tcpForward: async () => { throw new Error('no forward in this leg'); }, unserveFolder: async (port) => { unserved.push(port); } };
  const h = await DM.deviceFolderMount({ device, remotePath: '/x', mountpoint: mpA, rcloneBin: RC, onGone: (g) => gone.push(g) });
  const pidA = await pidFile(mpA);   // the module's own rclone (THIS process started it): its exit is seen below (onGone)
  const r = { up: !!h && fuses(mpA) === 1 && pidA > 0, upWhy: `fuses ${fuses(mpA)} pid ${pidA}` };
  process.kill(pidA, 'SIGTERM');
  await until(() => gone.length === 1 && fuses(mpA) === 2);
  r.released = gone.length === 1 && gone[0].why === 'rclone-exit' && fuses(mpA) === 2 && unserved.includes(h.devicePort);
  r.releasedWhy = JSON.stringify({ gone, fuses: fuses(mpA), unserved });
  r.bridgeShut = await new Promise((res) => { const c = net.connect(h.bridgePort, '127.0.0.1'); c.on('connect', () => { c.destroy(); res(false); }); c.on('error', () => res(true)); });
  const u0 = unserved.length; await h.teardown();
  r.once = fuses(mpA) === 2 && unserved.length === u0; r.onceWhy = JSON.stringify({ fuses: fuses(mpA), unserved });
  // releaseStale on THIS box's /proc: a stale daemon (argv0 names rclone, as a real one) of a mount point left by a dead hub
  const mpS = path.join(FC, 'mnt-stale');
  const { spawn } = require('child_process');
  const st = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)', 'mount', 'vsdev:', mpS, '--read-only'], { argv0: path.join(FC, 'bin', 'rclone'), detached: true, stdio: 'ignore' });
  st.unref(); kids.push(st);
  await until(() => { try { return fs.readFileSync(`/proc/${st.pid}/cmdline`, 'utf8').includes(mpS); } catch { return false; } });
  const said = [];
  const hit = await DM.releaseStale(mpS, { log: (l) => said.push(String(l)) });
  await until(() => st.exitCode !== null || st.signalCode !== null);
  r.stale = fuses(mpS) === 1 && JSON.stringify(hit) === JSON.stringify([st.pid]) && st.signalCode === 'SIGKILL' && said.some((l) => l.startsWith(`pull mount ${mpS}: ended its stale daemon ${st.pid} (start `));
  r.staleWhy = JSON.stringify({ fuses: fuses(mpS), hit, pid: st.pid, sig: st.signalCode, said });
  return r;
})().catch((e) => ({ upWhy: String(e && e.stack || e) }));
// r1 #1/#8: an rclone that dies while the mount is awaited is a FAILED mount, and its mount point is released all the same
const dyingChain = (async () => {
  const DM = require('../src/device-mount.js');
  const mpF = path.join(FC, 'mnt-f'); const gone = [], unserved = [];
  const device = { serveFolder: async () => ({ port: 4300 }), tcpForward: async () => { throw new Error('no forward in this leg'); }, unserveFolder: async (p) => { unserved.push(p); } };
  let err = null; try { await DM.deviceFolderMount({ device, remotePath: '/x', mountpoint: mpF, rcloneBin: RCD, onGone: (g) => gone.push(g) }); } catch (e) { err = String(e && e.message); }
  await until(() => fuses(mpF) === 2);
  return { err, fuses: fuses(mpF), gone: gone.length, unserved };
})().catch((e) => ({ err: 'leg: ' + String(e && e.stack || e) }));

// §15 A's RED CONTROL, beside it: the release's src/device-mount.js (its requires pointed at today's tree), run in a CHILD — the
// release leaves its bridge listening after rclone's exit (nothing is released), and the child's own exit closes it: rclone's
// exit is HANDLED (its journal line) and the mount point stays a FUSE entry, nobody told
const realChainControl = (async () => {
  const SRCD = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src');
  const relText = releaseSrc('src/device-mount.js');
  if (relText == null) return { skip: true };
  const relDM = path.join(FC, 'device-mount-release.js');
  fs.writeFileSync(relDM, relText.replace(/require\('\.\//g, `require('${SRCD}/`));
  const child = path.join(FC, 'release-control.cjs');
  fs.writeFileSync(child, [
    "const fs = require('fs');",
    "const [relDM, mpR, RC, fuseLog] = process.argv.slice(2);",
    "const sleep = (ms) => new Promise((r) => setTimeout(r, ms));",
    "const fuses = () => fs.readFileSync(fuseLog, 'utf8').split('\\n').filter((l) => l === '-uz ' + mpR).length;",
    "(async () => {",
    "  const lines = [], gone = [];",
    "  const device = { serveFolder: async () => ({ port: 4200 }), tcpForward: async () => { throw new Error('no forward'); }, unserveFolder: async () => { } };",
    "  await require(relDM).deviceFolderMount({ device, remotePath: '/x', mountpoint: mpR, rcloneBin: RC, log: (l) => lines.push(String(l)), onGone: (g) => gone.push(g) });",
    "  let pid = 0; for (let i = 0; i < 400 && !pid; i++) { try { pid = Number(fs.readFileSync(mpR + '.pid', 'utf8')); } catch { } if (!pid) await sleep(5); }",
    "  process.kill(pid, 'SIGTERM');   // the fake rclone THIS process's module started",
    "  const said = () => lines.some((l) => l.startsWith('pull refresh stopped: rclone for ' + mpR + ' exited'));",
    "  for (let i = 0; i < 400 && !said(); i++) await sleep(5);",
    "  process.stdout.write(JSON.stringify({ handled: said(), fuses: fuses(), gone: gone.length }));",
    "  process.exit(0);",
    "})().catch((e) => { process.stdout.write(JSON.stringify({ err: String(e && e.stack || e) })); process.exit(0); });",
  ].join('\n'));
  const { execFile } = require('child_process');
  const outTxt = await new Promise((res) => { const c = execFile(process.execPath, [child, relDM, path.join(FC, 'mnt-r'), RC, fuseLog], { env: process.env }, (e, so) => res(String(so || ''))); kids.push(c); });
  try { return JSON.parse(outTxt); } catch { return { err: 'no answer: ' + outTxt.slice(0, 200) }; }
})().catch((e) => ({ err: String(e && e.stack || e) }));

try {
  console.log('§1 the pull mount argv');
  const args = pullMountArgs('/m');
  check('no --no-modtime (it pinned every mtime to the mount time)', !args.includes('--no-modtime'), args.join(' '));
  check('no --direct-io (MAP_SHARED mmap fails with ENODEV under it)', !args.includes('--direct-io'));
  check('read-only, dir-cache 5s, attr-timeout 1s', args.includes('--read-only') && args[args.indexOf('--dir-cache-time') + 1] === '5s' && args[args.indexOf('--attr-timeout') + 1] === '1s');

  console.log('§2 an idle mount costs nothing');
  await sleep(200);
  check('no /proc scan and no device stat before any GET', scans === 0 && stats === 0 && r.held.size === 0, `scans ${scans} stats ${stats}`);

  console.log('§3 a GET finds the held files of THIS mount only');
  r.sawRead(); r.sawRead(); r.sawRead();
  await until(() => r.held.size > 0);
  check('the held file is found', r.held.has(db), JSON.stringify([...r.held.keys()]));
  check('outside files and prefix siblings are not', r.held.size === 1);
  check('three GETs inside the scan gap = one scan', scans === 1, `scans ${scans}`);
  await until(() => inval.length >= 1);
  check('a newly found held file gets one pass (it may have changed before we looked)', inval.length === 1 && inval[0][0] === db, JSON.stringify(inval));

  console.log('§4 unchanged device stat: no invalidation');
  await sleep(200);
  check('quiet while the stat holds', inval.length === 1, `${inval.length} passes`);

  console.log('§5 a same-size rewrite (mtime moved) drops the pages, then once more');
  remote.set(db, { size: 8192, mtime: 'Fri, 02 Oct 2026 10:05:00 GMT' });
  await until(() => inval.length >= 2);
  check('the moved stat is invalidated', inval.length >= 2 && inval[1][0] === db, JSON.stringify(inval));
  await until(() => inval.length >= 3);
  check('the next pass runs once more (whole-second mtime: a second write in that second has no new stat)', inval.length === 3);
  await sleep(200);
  check('then quiet', inval.length === 3, `${inval.length} passes`);

  console.log('§6 device unreachable: no verdict, the baseline survives');
  down = true;
  remote.set(db, { size: 8192, mtime: 'Fri, 02 Oct 2026 10:09:00 GMT' });
  await sleep(200);
  check('no invalidation while statRemote answers null', inval.length === 3);
  down = false;
  await until(() => inval.length >= 4);
  check('the change made while unreachable lands once the device answers', inval.length >= 4);
  await sleep(150);

  console.log('§7 a GET during a scan gets its own pass');
  const before = scans; slowScan = 80;
  await sleep(150); // past the scan gap
  r.sawRead();
  await until(() => scans > before);
  r.sawRead(); // the scan is in flight
  await until(() => scans > before + 1, 1500);
  check('a second scan follows', scans === before + 2, `scans ${scans - before}`);
  slowScan = 0;

  console.log('§8 the holder closes: the file leaves, the ticks stop');
  fs.unlinkSync(path.join(proc, '111', 'fd', '3'));
  await until(() => r.held.size === 0);
  check('the closed file left the held set', r.held.size === 0);
  const s0 = stats; await sleep(250);
  check('no device stat once nothing is held', stats === s0, `${stats - s0} more`);

  console.log('§9 stop() ends every timer');
  hold(111, 6, db); r.sawRead(); r.stop();
  const s1 = stats, sc1 = scans; await sleep(250);
  check('nothing runs after stop', stats === s1 && scans === sc1 && r.held.size === 0);
  console.log('§10 the device stops answering: said once, then a slow probe; its answer is said too (verify r1)');
  const logs = []; let down2 = true, stats2 = 0;
  const mpB = path.join(tmp, 'mnt-b'); hold(333, 3, path.join(mpB, 'a.bin'));
  const rB = heldRefresher({ mountpoint: mpB, procRoot: proc, tickMs: 20, scanGapMs: 50, scanDelayMs: 5, log: (m) => logs.push(m),
    statRemote: async () => { stats2++; return down2 ? null : { size: 1, mtime: 'm' }; }, invalidate: async () => { } });
  rB.sawRead();
  await until(() => logs.some((l) => /has not answered 3 passes/.test(l)), 3000);
  check('three passes without an answer are said once in the journal', logs.filter((l) => /has not answered/.test(l)).length === 1, JSON.stringify(logs));
  const sB = stats2; await sleep(200);
  check('then it probes slowly (no spinning on an offline machine)', stats2 - sB <= 1, `${stats2 - sB} stats in 200 ms at a 20 ms tick`);
  down2 = false;
  await until(() => logs.some((l) => /answers again/.test(l)), 1500);
  check('the first answer is said and the tick restored', logs.some((l) => /answers again/.test(l)), JSON.stringify(logs));
  rB.stop();

  console.log('§11 five pull mounts read at once share ONE /proc scan (verify r1)');
  const rs = [0, 1, 2, 3, 4].map((i) => {
    const m = path.join(tmp, 'mnt-c' + i); hold(400 + i, 3, path.join(m, 'f.db'));
    return heldRefresher({ mountpoint: m, procRoot: proc, tickMs: 1e6, scanGapMs: 50, scanDelayMs: 20, statRemote: async () => null, invalidate: async () => { } });
  });
  await sleep(100); const sc0 = scans;
  rs.forEach((x) => x.sawRead());
  await until(() => rs.every((x) => x.held.size === 1));
  check('every mount finds its own held file', rs.every((x, i) => x.held.size === 1 && x.held.has(path.join(tmp, 'mnt-c' + i, 'f.db'))), rs.map((x) => [...x.held.keys()].join()).join(' | '));
  check('one /proc scan served all five', scans - sc0 === 1, `${scans - sc0} scans`);
  rs[0].sawRead(); await sleep(150);
  check('a GET after that scan gets a new one (never a scan older than the GET)', scans - sc0 === 2, `${scans - sc0} scans`);
  rs.forEach((x) => x.stop());

  console.log('§12 a SQLite -wal grown past what its reader can read is left alone, said once (verify r1)');
  const mpW = path.join(tmp, 'mnt-w'); const wdb = path.join(mpW, 'x.db');
  const wst = new Map([[wdb, { size: 4096, mtime: 'a' }], [wdb + '-wal', { size: 0, mtime: 'a' }], [wdb + '-shm', { size: 32768, mtime: 'a' }]]);
  [wdb, wdb + '-wal', wdb + '-shm'].forEach((f, i) => hold(500, 3 + i, f));
  const wl = [], winv = [];
  const rW = heldRefresher({ mountpoint: mpW, procRoot: proc, tickMs: 30, scanGapMs: 50, scanDelayMs: 5, log: (m) => wl.push(m),
    statRemote: async (abs) => wst.get(abs) || null, invalidate: async (p) => { winv.push([...p].sort()); } });
  rW.sawRead();
  await until(() => winv.length >= 1); await sleep(100);
  const w0 = winv.length;
  wst.set(wdb + '-wal', { size: 8272, mtime: 'b' }); wst.set(wdb + '-shm', { size: 32768, mtime: 'b' });
  await sleep(200);
  check('a -wal grown past its open-time size is not refreshed (the -shm would point at frames the reader cannot read: disk I/O error)', winv.length === w0, JSON.stringify(winv.slice(w0)));
  check('said once', wl.filter((l) => /outgrew/.test(l)).length === 1, JSON.stringify(wl));
  wst.set(wdb + '-wal', { size: 0, mtime: 'c' }); wst.set(wdb, { size: 4096, mtime: 'c' }); wst.set(wdb + '-shm', { size: 32768, mtime: 'c' });
  await until(() => winv.length > w0);
  check('back within that size (a TRUNCATE checkpoint) the family refreshes', winv.length > w0 && winv[w0].length === 3, JSON.stringify(winv.slice(w0)));
  rW.stop();

  console.log('§12b a pass stats a family file by file: a commit or a checkpoint landing between two of its stats is looked at again before it is judged (B-0c75)');
  // The fake device lands the change right after a chosen answer — the torn pass §12 met only under load, at a fixed point
  const mpT = path.join(tmp, 'mnt-t'); const tdb = path.join(mpT, 't.db');
  const tst = new Map([[tdb, { size: 4096, mtime: 'a' }], [tdb + '-wal', { size: 0, mtime: 'a' }], [tdb + '-shm', { size: 32768, mtime: 'a' }]]);
  [tdb, tdb + '-wal', tdb + '-shm'].forEach((f, i) => hold(510, 3 + i, f));
  const tinv = [], tlook = []; let tear = null; // [after(abs), the device change]
  const rT = heldRefresher({ mountpoint: mpT, procRoot: proc, tickMs: 20, scanGapMs: 50, scanDelayMs: 5,
    statRemote: async (abs) => { const v = tst.get(abs) || null; tlook.push(path.basename(abs)); if (tear && tear[0](abs)) { tear[1](); tear = null; tlook.push('TEAR'); } return v; },
    invalidate: async (p) => { tinv.push([...p].map((f) => path.basename(f)).sort()); } });
  rT.sawRead();
  await until(() => tinv.length >= 1 && tlook.length >= 6);
  const first = tlook[0], t0 = tinv.length; // a pass looks at the held files in one fixed order
  tear = [(a) => a.endsWith('-wal'), () => { tst.set(tdb + '-wal', { size: 8272, mtime: 'b' }); tst.set(tdb + '-shm', { size: 32768, mtime: 'b' }); }];
  await until(() => !tear && tlook.length - tlook.lastIndexOf('TEAR') > 9);
  check('a commit landing right after the -wal is answered leaves the family alone (its -wal is looked at again)', tinv.length === t0, JSON.stringify({ inv: tinv.slice(t0), looks: tlook.slice(tlook.lastIndexOf('TEAR') - 3, tlook.lastIndexOf('TEAR') + 7) }));
  const t1 = tinv.length;
  tear = [(a) => path.basename(a) === first, () => { tst.set(tdb + '-wal', { size: 0, mtime: 'c' }); tst.set(tdb, { size: 4096, mtime: 'c' }); tst.set(tdb + '-shm', { size: 32768, mtime: 'c' }); }];
  await until(() => !tear && tinv.length > t1);
  check('a checkpoint landing right after the first answer of a pass refreshes the family as one', tinv.length > t1 && tinv[t1].length === 3, JSON.stringify({ inv: tinv.slice(t1), looks: tlook.slice(tlook.lastIndexOf('TEAR') - 1, tlook.lastIndexOf('TEAR') + 7) }));
  rT.stop();

  console.log('§13 wiring: rclone exiting stops the refresher; no sync fs call on the mountpoint (verify r1)');
  const src = fs.readFileSync(new URL('../src/device-mount.js', import.meta.url), 'utf8');
  check('rclone exiting stops the refresher and says so', /rc\.on\('exit'[\s\S]{0,200}refresher\.stop\(\)[\s\S]{0,40}log\(/.test(src));
  check('the mountpoint is resolved asynchronously (never realpathSync on a mountpoint)', !/realpathSync\(mountpoint\)/.test(src) && /await fs\.promises\.realpath\(mountpoint\)/.test(src));

  console.log('§14 B-1ea6: the pre-clean finds a stale daemon by its argv ELEMENTS, off the loop, re-checked at the signal');
  {
    const P = path.join(tmp, 'proc-b1ea6'), M = path.join(tmp, 'mounts');
    const mac = path.join(M, 'mac'), macbook = path.join(M, 'macbook'), inner = path.join(mac, 'inner');
    const fake = (pid, argv, start, state = 'S') => {
      fs.mkdirSync(path.join(P, String(pid)), { recursive: true });
      fs.writeFileSync(path.join(P, String(pid), 'cmdline'), argv.join('\0') + '\0');
      fs.writeFileSync(path.join(P, String(pid), 'stat'), `${pid} (${path.basename(argv[0])}) ${state} 1 ${pid} ${pid} 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 ${start} 0 0`);
    };
    fs.mkdirSync(path.join(P, 'self'), { recursive: true }); fs.writeFileSync(path.join(P, 'self', 'stat'), '1 (node) S');
    fake(301, ['/usr/bin/rclone', ...pullMountArgs(mac)], 1000);       // THE stale daemon of …/mac
    fake(302, ['/usr/bin/rclone', ...pullMountArgs(macbook)], 2000);   // a sibling whose path merely starts with …/mac
    fake(303, ['/usr/bin/rclone', ...pullMountArgs(inner)], 3000);     // another mount UNDER …/mac
    fake(304, ['/usr/bin/vim', mac + '/notes.txt', 'mount'], 4000);    // not rclone
    fake(305, ['/usr/bin/rclone', 'lsf', mac], 5000);                  // rclone, not a mount
    check('isMountDaemonOf: the exact element only — the prefix sibling, the mount under it, another program and a non-mount rclone are not it',
      isMountDaemonOf(['/usr/bin/rclone', ...pullMountArgs(mac)], mac) && !isMountDaemonOf(['/usr/bin/rclone', ...pullMountArgs(macbook)], mac)
      && !isMountDaemonOf(['/usr/bin/rclone', ...pullMountArgs(inner)], mac) && !isMountDaemonOf(['/usr/bin/vim', mac, 'mount'], mac)
      && !isMountDaemonOf(['/usr/bin/rclone', 'lsf', mac], mac) && !isMountDaemonOf(null, mac) && !isMountDaemonOf(['rclone', 'mount', ''], ''));
    let syncProc = 0;
    const rds = fs.readdirSync, rfs = fs.readFileSync;
    fs.readdirSync = function (q, ...a) { if (String(q).startsWith(P)) syncProc++; return rds.call(this, q, ...a); };
    fs.readFileSync = function (q, ...a) { if (String(q).startsWith(P)) syncProc++; return rfs.call(this, q, ...a); };
    let found; try { found = await mountDaemonsOf(mac, { procRoot: P }); } finally { fs.readdirSync = rds; fs.readFileSync = rfs; }
    check('the scan names …/mac\'s daemon alone, with its start time', JSON.stringify(found) === JSON.stringify([{ pid: 301, starttime: 1000 }]), JSON.stringify(found));
    check('the scan reads /proc off the loop (no sync read under the proc root)', syncProc === 0, `sync reads ${syncProc}`);
    const sig = [];
    const hit = await killMountDaemons(mac, { procRoot: P, kill: (p, s) => sig.push([p, s]), say: () => {} });
    check('healing …/mac signals ITS daemon only — never …/macbook\'s, never the mount under it', JSON.stringify(sig) === JSON.stringify([[301, 'SIGKILL']]) && JSON.stringify(hit) === JSON.stringify([301]), JSON.stringify(sig));
    const sig2 = [];
    await killMountDaemons(macbook, { procRoot: P, kill: (p, s) => sig2.push([p, s]), say: () => {} });
    check('healing …/macbook signals ITS daemon only', JSON.stringify(sig2) === JSON.stringify([[302, 'SIGKILL']]), JSON.stringify(sig2));
    // a STALL placed in the window between the scan and the signal: the pid is recycled (a new start time) — not signalled
    const rp = fs.promises.readFile; let seen = 0;
    fs.promises.readFile = async function (q, ...a) {
      if (q === path.join(P, '301', 'cmdline') && ++seen === 2) fake(301, ['/usr/bin/rclone', ...pullMountArgs(mac)], 1001);
      return rp.call(this, q, ...a);
    };
    const sig3 = [], said = [];
    try { await killMountDaemons(mac, { procRoot: P, kill: (p, s) => sig3.push([p, s]), say: (l) => said.push(l) }); } finally { fs.promises.readFile = rp; }
    check('a pid recycled between the scan and the signal is never signalled (and said once)', sig3.length === 0 && said.length === 1 && /pid-recycled/.test(said[0]), JSON.stringify({ sig3, said }));
    fake(301, ['/usr/bin/rclone', ...pullMountArgs(mac)], 1000);
    // the command line changed in the window (the same start, another program now): not signalled
    seen = 0;
    fs.promises.readFile = async function (q, ...a) {
      if (q === path.join(P, '301', 'cmdline') && ++seen === 2) fs.writeFileSync(path.join(P, '301', 'cmdline'), ['/usr/bin/rclone', 'lsf', mac].join('\0'));
      return rp.call(this, q, ...a);
    };
    const sig4 = [];
    try { await killMountDaemons(mac, { procRoot: P, kill: (p, s) => sig4.push([p, s]), say: () => {} }); } finally { fs.promises.readFile = rp; }
    check('a command line that no longer names the mount at the signal is never signalled', sig4.length === 0, JSON.stringify(sig4));
    fake(301, ['/usr/bin/rclone', ...pullMountArgs(mac)], 1000);
    // the cure (the readers' 2): a process in uninterruptible sleep is never read further — its command line can hold a pool thread
    fake(306, ['/usr/bin/rclone', ...pullMountArgs(mac)], 6000, 'D');
    const rpD = fs.promises.readFile; let dRead = 0;
    fs.promises.readFile = async function (q, ...a) { if (q === path.join(P, '306', 'cmdline')) dRead++; return rpD.call(this, q, ...a); };
    let foundD, sigD = [];
    try { foundD = await mountDaemonsOf(mac, { procRoot: P }); await killMountDaemons(mac, { procRoot: P, kill: (p, s) => sigD.push([p, s]), say: () => {} }); } finally { fs.promises.readFile = rpD; }
    check('a process asleep in the kernel (D) is skipped — its command line is never read, it is never signalled', JSON.stringify(foundD) === JSON.stringify([{ pid: 301, starttime: 1000 }]) && dRead === 0 && sigD.every(([p]) => p !== 306), JSON.stringify({ foundD, dRead, sigD }));
    { // cure 2: a process LEFT asleep is SAID once — at the walk (named by its comm, never its command line) and at the re-check
      fake(307, ['/usr/bin/rclone', ...pullMountArgs(mac)], 7000, 'D');   // a fresh pid (306 was said by the leg above)
      const saidD = [];
      await killMountDaemons(mac, { procRoot: P, kill: () => {}, say: (l) => saidD.push(l) });
      await killMountDaemons(mac, { procRoot: P, kill: () => {}, say: (l) => saidD.push(l) });
      const walkSaid = saidD.filter((l) => /rclone process 307 is asleep in the kernel — not read, not signalled/.test(l)).length;
      fs.rmSync(path.join(P, '307'), { recursive: true, force: true });
      let st2 = 0;
      fs.promises.readFile = async function (q, ...a) { if (q === path.join(P, '301', 'stat') && ++st2 === 2) return `301 (rclone) D 1 301 301 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 1000 0 0`; return rpD.call(this, q, ...a); };
      const sigR = [], saidR = [];
      try { await killMountDaemons(mac, { procRoot: P, kill: (p, s) => sigR.push(p), say: (l) => saidR.push(l) }); } finally { fs.promises.readFile = rpD; }
      check('cure 2: a process left asleep in the kernel is SAID once — at the walk by its comm (twice walked, once said), and the stale daemon found asleep at the re-check is said and left (never signalled)',
        walkSaid === 1 && sigR.length === 0 && saidR.some((l) => /its stale daemon 301 is asleep in the kernel — left/.test(l)), JSON.stringify({ walkSaid, saidD, sigR, saidR }));
    }
    {
      const dsrc0 = fs.readFileSync(new URL('../src/device-mount.js', import.meta.url), 'utf8');
      const noSkip = "    if (!st || st.state === 'D') continue;\n    let argv; try { argv = (await fs.promises.readFile(`${procRoot}/${pid}/cmdline`";
      if (!dsrc0.includes(noSkip)) check('CONTROL: the D-skip anchor was found in mountDaemonsOf', false);
      else {
        const SRCX = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src');
        const cpD = path.join(tmp, 'device-mount-no-dskip.js');
        fs.writeFileSync(cpD, dsrc0.replace(noSkip, noSkip.replace("if (!st || st.state === 'D') continue;", 'if (!st) continue;')).replace(/require\('\.\//g, `require('${SRCX}/`));
        const foundC = await require(cpD).mountDaemonsOf(mac, { procRoot: P });
        check('CONTROL (no D skip): the sleeping process is read and found (red)', foundC.some((x) => x.pid === 306), JSON.stringify(foundC));
      }
    }
    fs.rmSync(path.join(P, '306'), { recursive: true, force: true });
    check('no /proc ⇒ nothing found, nothing signalled (the fusermount pass alone)', (await mountDaemonsOf(mac, { procRoot: path.join(tmp, 'no-proc') })).length === 0);
    const dsrc = fs.readFileSync(new URL('../src/device-mount.js', import.meta.url), 'utf8');
    check('the pre-clean goes through killMountDaemons; no sync /proc walk and no substring match is left in the file',
/if \(!preCleaned\) await releaseStale\(mountpoint, \{ log \}\);[^\n]*\n  await fs\.promises\.mkdir\(mountpoint/.test(dsrc) && /if \(\(await lazyUnmount\(mountpoint, \{ say: log, ms \}\)\) === 'hung'\) throw [^\n]*\n  return killMountDaemons\(mountpoint/.test(dsrc) && !/readdirSync\('\/proc'\)/.test(dsrc) && !/cmd\.includes\(mountpoint\)/.test(dsrc));
    // RED CONTROL: the release's predicate (a substring of the joined command line) in a patched copy — the leg goes red
    const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src');
    const body = /function isMountDaemonOf\(argv, mountpoint\) \{\n[\s\S]*?\n\}\n/;
    if (!body.test(dsrc)) check('CONTROL: the isMountDaemonOf body was found in src/device-mount.js', false);
    else {
      const rel = 'function isMountDaemonOf(argv, mountpoint) {\n  const cmd = (argv || []).join(\' \');\n  return cmd.includes(\'rclone\') && cmd.includes(\' mount \') && cmd.includes(mountpoint);\n}\n';
      const cp = path.join(tmp, 'device-mount-release-predicate.js');
      fs.writeFileSync(cp, dsrc.replace(body, rel).replace(/require\('\.\//g, `require('${SRC}/`));
      const R = require(cp);
      const sigC = [];
      await R.killMountDaemons(mac, { procRoot: P, kill: (p, s) => sigC.push([p, s]), say: () => {} });
      const pids = sigC.map((x) => x[0]).sort();
      check('CONTROL (the release\'s substring rule): healing …/mac ALSO signals …/macbook\'s daemon and the mount under it (red)', pids.includes(302) && pids.includes(303) && pids.includes(301), JSON.stringify(pids));
    }
    // RED CONTROL 2: the signal NOT re-checked (the scan's pid killed as read) — the recycled pid is signalled
    const reck = /    let argv; try \{ argv = \(await fs\.promises\.readFile\(`\$\{procRoot\}\/\$\{id\.pid\}\/cmdline`[^\n]*\n    if \(!isMountDaemonOf\(argv, mountpoint\)\) continue;\n    const r = PI\.signalIdentity\(id, 'SIGKILL'[^\n]*\n/;
    if (!reck.test(dsrc)) check('CONTROL 2: the re-check lines were found in killMountDaemons', false);
    else {
      const cp2 = path.join(tmp, 'device-mount-no-recheck.js');
      fs.writeFileSync(cp2, dsrc.replace(reck, "    const r = { ok: true }; (kill || process.kill)(id.pid, 'SIGKILL');\n").replace(/require\('\.\//g, `require('${SRC}/`));
      const R2 = require(cp2);
      let n = 0; const sigR = [];
      fs.promises.readFile = async function (q, ...a) { if (q === path.join(P, '301', 'stat') && ++n === 1) { const v = await rp.call(this, q, ...a); fake(301, ['/usr/bin/rclone', ...pullMountArgs(mac)], 1001); return v; } return rp.call(this, q, ...a); };
      try { await R2.killMountDaemons(mac, { procRoot: P, kill: (p, s) => sigR.push([p, s]), say: () => {} }); } finally { fs.promises.readFile = rp; }
      check('CONTROL 2 (no re-check at the signal): the pid recycled after the scan IS signalled (red)', sigR.length === 1 && sigR[0][0] === 301, JSON.stringify(sigR));
      fake(301, ['/usr/bin/rclone', ...pullMountArgs(mac)], 1000);
    }
  }

  console.log('§15 B-fcc7: an offline machine\'s pull mount is released at once (a lazy unmount), never a zombie FUSE entry');
  {
    // A) THE REAL CHAIN (started at the suite's top, beside §1–§14's waits): rclone exiting released the mount point
    const ra = await realChain;
    check('A: the mount came up (the pre-clean\'s lazy unmount ran once)', ra.up, ra.upWhy);
    check('A: rclone exiting = the mount point lazy-unmounted at once, the owner told, the device\'s folder server released', ra.released, ra.releasedWhy);
    check('A: the bridge is closed', ra.bridgeShut);
    check('A: a later teardown releases nothing twice (no second unmount, no second unserve)', ra.once, ra.onceWhy);
    check('A: releaseStale — a stale daemon of the mount point (argv0 rclone, left by a dead hub) is ended after the lazy unmount', ra.stale, ra.staleWhy);
    const dy = await dyingChain;
    check('A: an rclone that dies while the mount is awaited ⇒ a FAILED mount, its mount point released all the same, its folder server let go, nobody told «gone»', /rclone webdav mount exited/.test(dy.err || '') && dy.fuses === 2 && dy.gone === 0 && JSON.stringify(dy.unserved) === JSON.stringify([4300]), JSON.stringify(dy));
    { // the unmount LADDER (r1 #3): fusermount3 first, fusermount when it is not here, neither said once
      const DM = require('../src/device-mount.js');
      const B2 = path.join(FC, 'bin2'), B0 = path.join(FC, 'bin-empty'); fs.mkdirSync(B2, { recursive: true }); fs.mkdirSync(B0, { recursive: true });
      fs.writeFileSync(path.join(B2, 'fusermount'), `#!/bin/sh\necho "$*" >> '${fuseLog}'\n`, { mode: 0o755 });
      const said = [];
      let a1, a2, a3;
      try {
        a1 = await DM.lazyUnmount(path.join(FC, 'mnt-l3'));
        process.env.PATH = B2; a2 = await DM.lazyUnmount(path.join(FC, 'mnt-l2'));
        process.env.PATH = B0; a3 = await DM.lazyUnmount(path.join(FC, 'mnt-l0'), { say: (l) => said.push(l) }); await DM.lazyUnmount(path.join(FC, 'mnt-l0b'), { say: (l) => said.push(l) });
      } finally { process.env.PATH = path.join(FC, 'bin') + ':' + PATH0; }
      check('A: the unmount ladder — fusermount3 when it is here, fusermount when it is not, neither ⇒ said ONCE (never a silent no-op)', a1 === 'ok' && fuses(path.join(FC, 'mnt-l3')) === 1 && a2 === 'ok' && fuses(path.join(FC, 'mnt-l2')) === 1 && a3 === 'missing' && said.length === 1 && /neither fusermount3 nor fusermount is on PATH/.test(said[0]), JSON.stringify({ a1, a2, a3, said }));
    }
    { // the cure (the readers' 1): THE UNMOUNT CHILD HAS A BOUND — a hung one is ended by its handle, said once, never waited on
      const DM = require('../src/device-mount.js');
      const B3 = path.join(FC, 'bin-hang'); fs.mkdirSync(B3, { recursive: true });
      const hangLog = path.join(FC, 'hang.log'); fs.writeFileSync(hangLog, '');
      fs.writeFileSync(path.join(B3, 'fusermount3'), `#!/bin/sh\necho "$*" >> '${hangLog}'\nexec sleep 30\n`, { mode: 0o755 });
      const spawns = () => fs.readFileSync(hangLog, 'utf8').split('\n').filter(Boolean).length;
      const mpH = path.join(FC, 'mnt-hang'), said = [];
      let a1, a2, rel = null, stuckAfter = null;
      try {
        process.env.PATH = B3 + ':' + PATH0;
        a1 = await DM.lazyUnmount(mpH, { ms: 40, say: (l) => said.push(l) });
        a2 = await DM.lazyUnmount(mpH, { ms: 40, say: (l) => said.push(l) });   // its first child has not exited yet: no second one
        const n2 = spawns();
        await until(() => !DM.unmountStuckOf(mpH));   // the killed child exits — the mount point may be tried again
        stuckAfter = DM.unmountStuckOf(mpH);
        try { await DM.releaseStale(path.join(FC, 'mnt-hang2'), { ms: 40, log: () => {} }); } catch (e) { rel = e && e.code; }
        check('A: a hung unmount answers «hung» at its bound, its child ended by the handle, SAID once; while that child lives the mount point gets no second child; a release over it fails BY NAME (unmount_hung)',
          a1 === 'hung' && a2 === 'hung' && n2 === 1 && said.length === 1 && /could not release the folder — its unmount did not answer/.test(said[0]) && stuckAfter === false && rel === 'unmount_hung', JSON.stringify({ a1, a2, n2, said, stuckAfter, rel }));
      } finally { process.env.PATH = path.join(FC, 'bin') + ':' + PATH0; }
    }
    const rc0 = await realChainControl;
    if (rc0.skip) console.log(`  SKIP test-pull-refresh §15 A CONTROL: the release ${BASE_REF} is not in this checkout (a depth-1 clone)`);
    else check('A CONTROL (the release\'s device-mount.js): rclone\'s exit is handled and the mount point is NOT released, nobody told (red)', rc0.handled === true && rc0.fuses === 1 && rc0.gone === 0, JSON.stringify(rc0));

    // B) THE MANAGER over a stub chain (machine-mounts reads src/device-mount.js's exports at each call): instant, no spawn
    const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src');
    const DMX = require('../src/device-mount.js');
    const real = { deviceFolderMount: DMX.deviceFolderMount, releaseStale: DMX.releaseStale };
    const chains = [], released = [], events = [];
    let gate = null;   // a mount held open (r1 #4: the link closes while it is being made)
    DMX.deviceFolderMount = async ({ mountpoint, onGone, preCleaned }) => { const c = { mp: mountpoint, onGone, torn: 0, preCleaned: !!preCleaned }; events.push(['mount', mountpoint]); if (gate) await gate.p; chains.push(c); return { mountpoint, devicePort: 1, bridgePort: 1, teardown: async () => { c.torn++; } }; };
    let hungFor = null;   // a mount point whose release HANGS (the stub's answer, as releaseStale's own by name)
    DMX.releaseStale = async (mp) => { released.push(mp); events.push(['release', mp]); if (mp === hungFor) throw Object.assign(new Error(`could not release the folder ${mp} — its unmount did not answer in 10 s`), { code: 'unmount_hung' }); return []; };
    const run = async (MM, label) => {
      const dataDir = path.join(tmp, 'fcc7-' + label); fs.mkdirSync(dataDir, { recursive: true });
      const mpB = path.join(tmp, 'fcc7', label + '-b'), mpC = path.join(tmp, 'fcc7', label + '-c'), mpD = path.join(tmp, 'fcc7', label + '-d');
      fs.writeFileSync(path.join(dataDir, 'machine-mounts.json'), JSON.stringify({ mounts: [
        { id: 'mm-b', dir: 'pull', hostId: 'h1', remotePath: '/x', mountpoint: mpB, createdAt: 1 },
        { id: 'mm-c', dir: 'pull', hostId: 'h2', remotePath: '/y', mountpoint: mpC, createdAt: 1 },
        { id: 'mm-d', dir: 'pull', hostId: 'h3', remotePath: '/z', mountpoint: mpD, createdAt: 1 },   // an ssh machine, unreachable
      ] }));
      const online = { d1: true, d2: false };
      const hosts = { get: (id) => { const h = ({ h1: { id: 'h1', transport: 'dial', deviceId: 'd1' }, h2: { id: 'h2', transport: 'dial', deviceId: 'd2' }, h3: { id: 'h3', transport: 'ssh' } })[id]; if (!h) throw new Error('unknown machine'); return h; },
        dialOnline: (d) => !!online[d], deviceBounded: async (id) => { if (id === 'h3') throw new Error('ssh: connect timed out'); return {}; }, findByDeviceId: (d) => ({ d1: { id: 'h1' }, d2: { id: 'h2' } })[d] || null };
      let notified = 0;
      const mm = new MM({ dataDir, hosts, rcloneBin: () => 'rclone', broadcast: (m) => { if (m && m.type === 'machine-mounts-updated') notified++; }, log: () => {} });
      clearInterval(mm._sweep);
      const rowB = () => mm.list().find((r) => r.id === 'mm-b');
      const chainB = () => chains.filter((c) => c.mp === mpB).at(-1);
      const up = async () => { online.d1 = true; if (!rowB().live) { mm.onMachineLinked('h1'); await until(() => rowB().live); } return chainB(); };
      const out = {};
      try {
        await mm.restore();
        out.bootReleased = released.includes(mpC);
        await until(() => rowB().live); out.up = rowB().live;
        const evB = events.filter((e) => e[1] === mpB).map((e) => e[0]);
        out.releaseFirst = evB[0] === 'release' && evB[1] === 'mount' && !!chainB() && chainB().preCleaned;
        await until(() => !mm._mounting.has('mm-d')); out.sshReleased = released.includes(mpD) && !mm.list().find((r) => r.id === 'mm-d').live;
        { const c = await up(); online.d1 = false; const n0 = notified;   // the link closes
          out.unlinked = typeof mm.onMachineUnlinked === 'function' ? mm.onMachineUnlinked('h1') : 'no such door';
          await Promise.resolve(); await Promise.resolve();
          out.offline = { live: rowB().live, online: rowB().online, torn: c.torn, told: notified > n0 }; }
        { const c = await up(); out.relinked = rowB().live && c !== chains.find((x) => x.mp === mpB); }
        { const old = chains.filter((x) => x.mp === mpB)[0], c = await up(); const n1 = notified;   // a STALE chain's exit leaves the newer one alone
          if (old !== c && typeof old.onGone === 'function') old.onGone({ why: 'rclone-exit' });
          out.staleGone = { live: rowB().live, told: notified > n1 }; }
        { const c = await up(); const n2 = notified;   // its rclone exits (young: right after the mount)
          out.rcExit = { said: typeof c.onGone === 'function' };
          if (out.rcExit.said) c.onGone({ why: 'rclone-exit', code: 1, sig: null });
          Object.assign(out.rcExit, { live: rowB().live, told: notified > n2, backoff: !!(mm._pullRetryAt && mm._pullRetryAt.get('mm-b') > Date.now()) }); }
        { // r1 #4: the link closes WHILE the mount is being made — no live chain to tear down yet; the mount lets go when it lands
          mm._live.delete('mm-b'); let open; gate = { p: new Promise((r) => { open = r; }) };
          const m0 = events.filter((e) => e[0] === 'mount' && e[1] === mpB).length;
          online.d1 = true; mm.onMachineLinked('h1');
          await until(() => events.filter((e) => e[0] === 'mount' && e[1] === mpB).length > m0);   // the mount is being made (held at the gate)
          online.d1 = false; const n3 = typeof mm.onMachineUnlinked === 'function' ? mm.onMachineUnlinked('h1') : 'no such door';
          gate = null; open();
          await until(() => !mm._mounting.has('mm-b')); await Promise.resolve();
          out.inflight = { unlinked: n3, live: rowB().live, torn: chainB() ? chainB().torn : null }; }
        { const c = await up(); online.d1 = false;   // the sweep finds a live pull of an offline machine
          await mm._healthSweep(); await Promise.resolve(); await Promise.resolve();
          out.sweep = { live: rowB().live, torn: c.torn }; }
        { // the cure (the readers' 1): a release that HUNG is said on the row and the record leaves the mounting set
          online.d1 = true; hungFor = mpB; let err = null;
          try { await mm._up(mm._state.mounts.find((r) => r.id === 'mm-b')); } catch (e) { err = e && e.code; }
          const after = { err, mounting: mm._mounting.has('mm-b'), error: rowB().error || null, live: rowB().live };
          hungFor = null; await mm._up(mm._state.mounts.find((r) => r.id === 'mm-b'));
          out.hung = { ...after, cleared: rowB().error == null && rowB().live }; }
      } finally { clearInterval(mm._sweep); }
      return out;
    };
    let o, oc;
    try {
      o = await run(require('../src/machine-mounts.js').MachineMounts, 'now');
      // RED CONTROL: the release's machine-mounts.js (its requires pointed at today's tree, so the same stub chain)
      const relSrc = releaseSrc('src/machine-mounts.js');
      if (relSrc != null) {
        const cpM = path.join(tmp, 'machine-mounts-release.js');
        fs.writeFileSync(cpM, relSrc.replace(/require\('\.\//g, `require('${SRC}/`));
        released.length = 0;
        oc = await run(require(cpM).MachineMounts, 'release');
      }
      // the cure (the readers' 3): the boot's releases go ONE AFTER ANOTHER, every record marked at once — a machine that dials
      // in meanwhile WAITS for its records' releases instead of racing them
      const boot = async (MM) => {
        const dataDir = path.join(tmp, 'fcc7-boot-' + Math.random().toString(36).slice(2)); fs.mkdirSync(dataDir, { recursive: true });
        const mpC = path.join(tmp, 'fcc7', 'boot-c'), mpE = path.join(tmp, 'fcc7', 'boot-e');
        fs.writeFileSync(path.join(dataDir, 'machine-mounts.json'), JSON.stringify({ mounts: [
          { id: 'mm-c', dir: 'pull', hostId: 'h2', remotePath: '/y', mountpoint: mpC, createdAt: 1 },
          { id: 'mm-e', dir: 'pull', hostId: 'h2', remotePath: '/w', mountpoint: mpE, createdAt: 1 },
        ] }));
        const online = { d2: false }, ev = [], pend = [];
        let auto = false;   // until set, a release HOLDS (a gate the leg opens); after, it answers at once
        const hosts = { get: (id) => { if (id !== 'h2') throw new Error('unknown machine'); return { id: 'h2', transport: 'dial', deviceId: 'd2' }; }, dialOnline: (d) => !!online[d], deviceBounded: async () => ({}), findByDeviceId: () => ({ id: 'h2' }) };
        DMX.releaseStale = async (mp) => { const n = path.basename(mp); ev.push('release-start ' + n); if (!auto) await new Promise((r) => pend.push({ mp, open: r })); ev.push('release-end ' + n); return []; };
        DMX.deviceFolderMount = async ({ mountpoint }) => { ev.push('mount ' + path.basename(mountpoint)); return { mountpoint, devicePort: 1, bridgePort: 1, teardown: async () => { } }; };
        const mm = new MM({ dataDir, hosts, rcloneBin: () => 'rclone', broadcast: () => { }, log: () => { } });
        clearInterval(mm._sweep);
        const restored = mm.restore();
        await until(() => pend.length === 1);
        const firstOnly = ev.join() === 'release-start boot-c';
        online.d2 = true; mm.onMachineLinked('h2');   // the machine dials in WHILE the boot still releases
        await quiet(() => ev.length);
        const raced = ev.filter((e) => e === 'release-start boot-c').length > 1 || ev.some((e) => e.startsWith('mount'));
        auto = true; for (const g of pend.splice(0)) g.open();
        await restored;
        await until(() => ev.filter((e) => e.startsWith('mount')).length >= 2);
        const at = (e) => ev.indexOf(e);
        return { firstOnly, raced, oneByOne: at('release-end boot-c') >= 0 && at('release-start boot-e') > at('release-end boot-c'),
          waited: at('mount boot-c') > at('release-end boot-c') && at('mount boot-e') > at('release-end boot-e'), ev };
      };
      const bo = await boot(require('../src/machine-mounts.js').MachineMounts);
      check('B: at boot the offline machine\'s releases run ONE AFTER ANOTHER; a dial-in meanwhile starts nothing on a record until ITS release has ended (never racing it)', bo.firstOnly && !bo.raced && bo.oneByOne && bo.waited, JSON.stringify(bo));
      const MSRC = fs.readFileSync(path.join(SRC, 'machine-mounts.js'), 'utf8');
      const noWait = '    if (rel) { try { await rel; } catch { } }\n';
      if (!MSRC.includes(noWait)) check('CONTROL: the wait anchor was found in machine-mounts _up', false);
      else {
        const cpW = path.join(tmp, 'machine-mounts-no-wait.js');
        fs.writeFileSync(cpW, MSRC.replace(noWait, '').replace(/require\('\.\//g, `require('${SRC}/`));
        const bw = await boot(require(cpW).MachineMounts);
        check('CONTROL (the dial-in does not wait): the heal releases / mounts a record while its boot release still runs (red)', bw.raced, JSON.stringify(bw));
      }
    } finally { Object.assign(DMX, real); }
    check('B: the recorded pull mounts at boot while its machine is linked', o.up === true, JSON.stringify(o));
    check('B: at boot, an OFFLINE machine\'s recorded pull is released now (releaseStale)', o.bootReleased === true, JSON.stringify(o));
    check('B: a heal RELEASES FIRST — before the machine is asked anything — and tells the chain it is pre-cleaned (r1 #2)', o.releaseFirst === true, JSON.stringify(events.slice(0, 8)));
    check('B: an ssh machine that cannot be reached (online by definition) still has its mount point released by the failed heal (r1 #2)', o.sshReleased === true, JSON.stringify(o));
    check('B: the machine\'s link closes ⇒ its live pull is torn down at once (the lazy unmount), the row says offline, the clients told',
      o.unlinked === 1 && o.offline.live === false && o.offline.online === false && o.offline.torn === 1 && o.offline.told, JSON.stringify(o.offline));
    check('B: the re-dial mounts it again (a new chain)', o.relinked === true);
    check('B: an OLD chain\'s late exit never drops the newer live chain', o.staleGone.live === true && !o.staleGone.told, JSON.stringify(o.staleGone));
    check('B: its rclone exiting ⇒ the row is not live at once, the clients told; a chain that died YOUNG keeps the 5-min backoff (r1 #5)', o.rcExit.said && o.rcExit.live === false && o.rcExit.told && o.rcExit.backoff, JSON.stringify(o.rcExit));
    check('B: the link closes WHILE the mount is being made ⇒ the mount lets go when it lands, never a live row over a dead link (r1 #4)', o.inflight.unlinked === 0 && o.inflight.live === false && o.inflight.torn === 1, JSON.stringify(o.inflight));
    check('B: the sweep\'s belt — a live pull of a machine found offline is torn down', o.sweep.live === false && o.sweep.torn === 1, JSON.stringify(o.sweep));
    check('B: a release that HUNG fails the heal by name, is SAID on the row (list().error), and the record leaves the mounting set — the next try mounts and clears the words', o.hung && o.hung.err === 'unmount_hung' && o.hung.mounting === false && /could not release the folder/.test(o.hung.error || '') && o.hung.cleared === true, JSON.stringify(o.hung));
    const dp = fs.readFileSync(new URL('../src/server/dial-pairing.js', import.meta.url), 'utf8');
    check('B: wiring — the dial link\'s «disconnected» fact unmounts the machine\'s pulls (dial-pairing noteDialEvent)', /if \(event === 'disconnected'\) \{ try \{ machineMounts\.onMachineUnlinked\(hosts\.findByDeviceId\(deviceId\)\?\.id\); \} catch \{ \} \}/.test(dp));
    if (!oc) console.log(`  SKIP test-pull-refresh §15 B CONTROL: the release ${BASE_REF} is not in this checkout (a depth-1 clone)`);
    else check('CONTROL (the release\'s machine-mounts.js): the boot releases nothing, a heal never releases first, an unreachable ssh machine keeps its mount, there is no unlink door, the chain is not told to say its exit, a mount made while the link closed stays live and the sweep skips an offline mount (red)',
      oc.up === true && oc.bootReleased === false && oc.releaseFirst === false && oc.sshReleased === false && oc.unlinked === 'no such door' && oc.offline.live === true && oc.rcExit.said === false && oc.rcExit.live === true && oc.inflight.live === true && oc.sweep.live === true && oc.hung.error == null, JSON.stringify(oc));
  }
} finally {
  process.env.PATH = PATH0;
  for (const c of kids) { if (c.exitCode === null && c.signalCode === null) { try { c.kill('SIGKILL'); } catch { } } }   // r1 #7: by the handle, only while it runs
  fs.promises.readdir = realReaddir;
  fs.rmSync(tmp, { recursive: true, force: true });
}
if (failed) { console.error(`\ntest-pull-refresh: ${passed} passed, ${failed} failed`); process.exit(1); }
console.log(`\ntest-pull-refresh: ALL PASS (${passed})`);

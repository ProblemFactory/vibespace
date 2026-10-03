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

const { heldRefresher, pullMountArgs } = require('../src/device-mount.js');
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 2000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await sleep(5); } return cond(); };

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

  console.log('§13 wiring: rclone exiting stops the refresher; no sync fs call on the mountpoint (verify r1)');
  const src = fs.readFileSync(new URL('../src/device-mount.js', import.meta.url), 'utf8');
  check('rclone exiting stops the refresher and says so', /rc\.on\('exit'[\s\S]{0,200}refresher\.stop\(\)[\s\S]{0,40}log\(/.test(src));
  check('the mountpoint is resolved asynchronously (never realpathSync on a mountpoint)', !/realpathSync\(mountpoint\)/.test(src) && /await fs\.promises\.realpath\(mountpoint\)/.test(src));
} finally {
  fs.promises.readdir = realReaddir;
  fs.rmSync(tmp, { recursive: true, force: true });
}
if (failed) { console.error(`\ntest-pull-refresh: ${passed} passed, ${failed} failed`); process.exit(1); }
console.log(`\ntest-pull-refresh: ALL PASS (${passed})`);

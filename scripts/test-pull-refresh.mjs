#!/usr/bin/env node
// B-35e3 pull-mount freshness (2.369.202): the rclone argv of a pull mount and heldRefresher's rules over a fake /proc — idle costs nothing, a GET finds held files, a moved device stat drops their pages (plus one same-second pass), gone holders stop the ticks
// The real chain (agentd + rclone + held readers) is test-device-mount-rclone's
// B-35e3 leg; this suite pins the rules it cannot make deterministic.
// Run: node scripts/test-pull-refresh.mjs
import './scratch.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { markTimedOut } from './lib/timed-out.mjs';   // a wait that runs out says so: THE ONE MARK (test-ci-gate §2p)

const { heldRefresher, pullMountArgs, isMountDaemonOf, mountDaemonsOf, killMountDaemons } = require('../src/device-mount.js');
let failed = 0, passed = 0;
const check = (n, c, e) => { if (typeof c !== 'boolean') throw new TypeError(`check: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); check(`ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`, false); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 2000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await sleep(5); } return cond(); };
// a value that stays the same for n looks in a row (an effect that is NOT coming — never a fixed sleep)
const quiet = async (f, ms = 3000, n = 15) => { const t0 = Date.now(); let last, same = 0; while (Date.now() - t0 < ms) { const v = f(); if (v === last) { if (++same >= n) return v; } else { same = 0; last = v; } await sleep(3); } return markTimedOut(f(), ms, `quiet (a value that held still for ${n} reads)`); };   // a wait that runs out says so (r1372; test-ci-gate §2p)

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
// §17 A — the mount handle's released() and canRelease over the REAL device-mount chain (主开发's small 4; B-844b's guard): a
// teardown starts the lazy unmount and released() is its promise; a chain whose owner says another record holds the folder ends
// only its own rclone — the folder is not released ('kept', no fusermount)
const releasedChain = (async () => {
  const DM = require('../src/device-mount.js');
  const out = {};
  for (const [tag, may] of [['own', true], ['kept', false]]) {
    const mpR = path.join(FC, 'mnt-rel-' + tag), unserved = [];
    const device = { serveFolder: async () => ({ port: 4500 }), tcpForward: async () => { throw new Error('no forward in this leg'); }, unserveFolder: async (pp) => { unserved.push(pp); } };
    const h = await DM.deviceFolderMount({ device, remotePath: '/x', mountpoint: mpR, rcloneBin: RC, canRelease: () => may });
    const pidR = await pidFile(mpR);
    const before = typeof h.released === 'function' ? h.released() : 'no released()';
    const f0 = fuses(mpR);
    await h.teardown();
    const rel = typeof h.released === 'function' ? h.released() : null;
    const result = rel && typeof rel.then === 'function' ? await rel : null;
    await until(() => !alive(pidR), 3000);
    out[tag] = { before, result, fuses: fuses(mpR) - f0, rcloneGone: !alive(pidR) };
  }
  return out;
})().catch((e) => ({ err: String(e && e.stack || e) }));
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
  check('read-only, dir-cache 5s, attr-timeout 1s', gateOf(args.includes('--read-only')) && args[args.indexOf('--dir-cache-time') + 1] === '5s' && args[args.indexOf('--attr-timeout') + 1] === '1s');

  console.log('§2 an idle mount costs nothing');
  await sleep(200);
  check('no /proc scan and no device stat before any GET', scans === 0 && stats === 0 && r.held.size === 0, `scans ${scans} stats ${stats}`);

  console.log('§3 a GET finds the held files of THIS mount only');
  r.sawRead(); r.sawRead(); r.sawRead();
  await until(() => r.held.size > 0);
  check('the held file is found', verdictOf(r.held.has(db)), JSON.stringify([...r.held.keys()]));
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
  check('the first answer is said and the tick restored', verdictOf(logs.some((l) => /answers again/.test(l))), JSON.stringify(logs));
  rB.stop();

  console.log('§11 five pull mounts read at once share ONE /proc scan (verify r1)');
  const rs = [0, 1, 2, 3, 4].map((i) => {
    const m = path.join(tmp, 'mnt-c' + i); hold(400 + i, 3, path.join(m, 'f.db'));
    return heldRefresher({ mountpoint: m, procRoot: proc, tickMs: 1e6, scanGapMs: 50, scanDelayMs: 20, statRemote: async () => null, invalidate: async () => { } });
  });
  await sleep(100); const sc0 = scans;
  rs.forEach((x) => x.sawRead());
  await until(() => rs.every((x) => x.held.size === 1));
  check('every mount finds its own held file', verdictOf(rs.every((x, i) => x.held.size === 1 && x.held.has(path.join(tmp, 'mnt-c' + i, 'f.db')))), rs.map((x) => [...x.held.keys()].join()).join(' | '));
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
  check('rclone exiting stops the refresher and says so', verdictOf(/rc\.on\('exit'[\s\S]{0,200}refresher\.stop\(\)[\s\S]{0,40}log\(/.test(src)));
  check('the mountpoint is resolved asynchronously (never realpathSync on a mountpoint)', !/realpathSync\(mountpoint\)/.test(src) && verdictOf(/await fs\.promises\.realpath\(mountpoint\)/.test(src)));

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
      gateOf(isMountDaemonOf(['/usr/bin/rclone', ...pullMountArgs(mac)], mac)) && !isMountDaemonOf(['/usr/bin/rclone', ...pullMountArgs(macbook)], mac)
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
    check('a pid recycled between the scan and the signal is never signalled (and said once)', sig3.length === 0 && said.length === 1 && verdictOf(/pid-recycled/.test(said[0])), JSON.stringify({ sig3, said }));
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
    check('a process asleep in the kernel (D) is skipped — its command line is never read, it is never signalled', JSON.stringify(foundD) === JSON.stringify([{ pid: 301, starttime: 1000 }]) && dRead === 0 && verdictOf(sigD.every(([p]) => p !== 306)), JSON.stringify({ foundD, dRead, sigD }));
    // the controls of §14's cures: ONE patched copy of device-mount.js, each cut behind its own flag (one compile — the fast
    // tier's cap); every anchor found exactly once or the control is red by name
    const dsrc0 = fs.readFileSync(new URL('../src/device-mount.js', import.meta.url), 'utf8');
    const SRCX = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src');
    const dcuts = [
      ['dskip', "    if (!st) continue;\n    if (st.state === 'D') {\n      if (/rclone/.test(st.comm))", "    if (!st) continue;\n    if (!globalThis.__dmCut.dskip && st.state === 'D') {\n      if (/rclone/.test(st.comm))"],
      ['key/kind', "const k = kind + '\\0' + mountpoint + '\\0' + pid + '\\0' + start;", "const k = (globalThis.__dmCut.kind ? '' : kind + '\\0') + mountpoint + '\\0' + pid + (globalThis.__dmCut.key ? '' : '\\0' + start);"],
      ['start', "if (st.start === id.starttime) sayAsleep(", "if (globalThis.__dmCut.start || st.start === id.starttime) sayAsleep("],
    ];
    const dmiss = dcuts.filter(([, a]) => dsrc0.split(a).length !== 2).map(([k]) => k);
    let DC = null;
    if (dmiss.length) check('CONTROL: the device-mount.js anchors were found once each', false, dmiss.join());
    else {
      globalThis.__dmCut = {};
      const cpD = path.join(tmp, 'device-mount-cuts.js');
      fs.writeFileSync(cpD, dcuts.reduce((x, [, a, b]) => editAnchor(x, a, () => b, "the text a fold hands its step"), dsrc0).replace(/require\('\.\//g, `require('${SRCX}/`));
      DC = require(cpD);
    }
    const dcut = async (k, f) => { globalThis.__dmCut = { [k]: true }; try { return await f(); } finally { globalThis.__dmCut = {}; } };
    if (DC) {
      const foundC = await dcut('dskip', () => DC.mountDaemonsOf(mac, { procRoot: P }));
      check('CONTROL (no D skip): the sleeping process is read and found (red)', verdictOf(foundC.some((x) => x.pid === 306)), JSON.stringify(foundC));
    }
    { // cure 2: a process LEFT asleep is SAID once — at the walk (named by its comm, never its command line) and at the re-check
      const asleepLegs = async (K) => {
        const out = {}, said307 = (l) => /rclone process 307 is asleep in the kernel — not read, not signalled/.test(l);
        fake(307, ['/usr/bin/rclone', ...pullMountArgs(mac)], 7000, 'D');   // a fresh pid (306 was said by the leg above)
        const saidD = [];
        await K.killMountDaemons(mac, { procRoot: P, kill: () => {}, say: (l) => saidD.push(l) });
        await K.killMountDaemons(mac, { procRoot: P, kill: () => {}, say: (l) => saidD.push(l) });
        out.walkSaid = saidD.filter(said307).length;
        fake(307, ['/usr/bin/rclone', ...pullMountArgs(mac)], 7001, 'D');   // cure 3 (the cure-2 read #7): the pid RECYCLED — a new process asleep there
        const saidN = [];
        await K.killMountDaemons(mac, { procRoot: P, kill: () => {}, say: (l) => saidN.push(l) });
        out.recycledSaid = saidN.filter(said307).length;
        fs.rmSync(path.join(P, '307'), { recursive: true, force: true });
        const recheck = async (start) => {   // 301's SECOND stat read (the re-check at the signal) says D
          let st2 = 0; const sigR = [], saidR = [];
          fs.promises.readFile = async function (q, ...a) { if (q === path.join(P, '301', 'stat') && ++st2 === 2) return `301 (rclone) D 1 301 301 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 ${start} 0 0`; return rpD.call(this, q, ...a); };
          try { await K.killMountDaemons(mac, { procRoot: P, kill: (p) => sigR.push(p), say: (l) => saidR.push(l) }); } finally { fs.promises.readFile = rpD; }
          return { sig: sigR.length, said: saidR.some((l) => /its stale daemon 301 is asleep in the kernel — left/.test(l)) };
        };
        out.same = await recheck(1000);    // the daemon the walk found, asleep at the re-check: said and left
        out.other = await recheck(1001);   // cure 3 (the cure-2 read #8): the pid names ANOTHER process now, asleep
        // cure 3 (the cure-3 read #8): the walk's line and the re-check's are two keys — a daemon the walk said «may be» stale
        // (asleep then), found at a later release and asleep at ITS re-check, still gets the re-check's line
        fake(308, ['/usr/bin/rclone', ...pullMountArgs(mac)], 8000, 'D');
        await K.killMountDaemons(mac, { procRoot: P, kill: () => {}, say: () => {} });
        fake(308, ['/usr/bin/rclone', ...pullMountArgs(mac)], 8000, 'S');
        { let st3 = 0; const said8 = [], sig8 = [];
          fs.promises.readFile = async function (q, ...a) { if (q === path.join(P, '308', 'stat') && ++st3 === 2) return `308 (rclone) D 1 308 308 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 8000 0 0`; return rpD.call(this, q, ...a); };
          try { await K.killMountDaemons(mac, { procRoot: P, kill: (p) => sig8.push(p), say: (l) => said8.push(l) }); } finally { fs.promises.readFile = rpD; }
          out.woke = { said: said8.some((l) => /its stale daemon 308 is asleep in the kernel — left/.test(l)), sig: sig8.includes(308) }; }
        fs.rmSync(path.join(P, '308'), { recursive: true, force: true });
        return out;
      };
      const a = await asleepLegs({ killMountDaemons });
      check('cure 2: a process left asleep in the kernel is SAID once — at the walk by its comm (twice walked, once said), and the stale daemon found asleep at the re-check is said and left (never signalled)',
        a.walkSaid === 1 && a.same.sig === 0 && a.same.said === true, JSON.stringify(a));
      check('cure 3 (the cure-2 read #7, #8): a recycled pid asleep again is a NEW process — said again; a pid that names another sleeping process at the re-check is never called the stale daemon',
        a.recycledSaid === 1 && a.other.said === false, JSON.stringify(a));
      check('cure 3 (the cure-3 read #8): a daemon the walk said «may be» stale, found later and asleep at the re-check, still gets the re-check\'s line (never signalled)',
        a.woke.said === true && a.woke.sig === false, JSON.stringify(a.woke));
      if (DC) {
        const ak = await dcut('key', () => asleepLegs(DC)), as = await dcut('start', () => asleepLegs(DC)), an = await dcut('kind', () => asleepLegs(DC));
        check('CONTROL (the said key without the start time / the re-check without its start check / one key for both lines): the recycled sleeper is never said / the other process is named the stale daemon / the re-check\'s line is never said (red)',
          ak.recycledSaid === 0 && as.other.said === true && an.woke.said === false, JSON.stringify({ ak, as, an }));
      }
    }
    fs.rmSync(path.join(P, '306'), { recursive: true, force: true });
    check('no /proc ⇒ nothing found, nothing signalled (the fusermount pass alone)', (await mountDaemonsOf(mac, { procRoot: path.join(tmp, 'no-proc') })).length === 0);
    const dsrc = fs.readFileSync(new URL('../src/device-mount.js', import.meta.url), 'utf8');
    check('the pre-clean goes through killMountDaemons; no sync /proc walk and no substring match is left in the file',
gateOf(/if \(!preCleaned\) await releaseStale\(mountpoint, \{ log, held: heldChild \}\);[^\n]*\n  await fs\.promises\.mkdir\(mountpoint/.test(dsrc)) && gateOf(/if \(\(await lazyUnmount\(mountpoint, \{ say: log, ms, held \}\)\) === 'hung'\) throw [^\n]*\n  return killMountDaemons\(mountpoint/.test(dsrc)) && !/readdirSync\('\/proc'\)/.test(dsrc) && !/cmd\.includes\(mountpoint\)/.test(dsrc));
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
      check('CONTROL (the release\'s substring rule): healing …/mac ALSO signals …/macbook\'s daemon and the mount under it (red)', gateOf(pids.includes(302)) && gateOf(pids.includes(303)) && verdictOf(pids.includes(301)), JSON.stringify(pids));
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
    check('A: the mount came up (the pre-clean\'s lazy unmount ran once)', verdictOf(ra.up), ra.upWhy);
    check('A: rclone exiting = the mount point lazy-unmounted at once, the owner told, the device\'s folder server released', verdictOf(ra.released), ra.releasedWhy);
    check('A: the bridge is closed', verdictOf(ra.bridgeShut));
    check('A: a later teardown releases nothing twice (no second unmount, no second unserve)', verdictOf(ra.once), ra.onceWhy);
    check('A: releaseStale — a stale daemon of the mount point (argv0 rclone, left by a dead hub) is ended after the lazy unmount', verdictOf(ra.stale), ra.staleWhy);
    const dy = await dyingChain;
    check('A: an rclone that dies while the mount is awaited ⇒ a FAILED mount, its mount point released all the same, its folder server let go, nobody told «gone»', gateOf(/rclone webdav mount exited/.test(dy.err || '')) && dy.fuses === 2 && dy.gone === 0 && JSON.stringify(dy.unserved) === JSON.stringify([4300]), JSON.stringify(dy));   // stale-pins: kept — the RUNTIME words (src/mount-error-words.js fills them, unchanged)
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
      check('A: the unmount ladder — fusermount3 when it is here, fusermount when it is not, neither ⇒ said ONCE (never a silent no-op)', a1 === 'ok' && fuses(path.join(FC, 'mnt-l3')) === 1 && a2 === 'ok' && fuses(path.join(FC, 'mnt-l2')) === 1 && a3 === 'missing' && said.length === 1 && verdictOf(/neither fusermount3 nor fusermount is on PATH/.test(said[0])), JSON.stringify({ a1, a2, a3, said }));
    }
    { // the cure (the readers' 1): THE UNMOUNT CHILD HAS A BOUND — a hung one is ended at its bound, said once, never waited on.
      // B-323e (lane bl-machines-b): the pair rides THE STARTER — over a STAND-IN starter here, whose killed child LINGERS (asleep in the
      // kernel) until this leg tells its late end: through the real one its exit line may arrive with its timeout line (one chunk)
      const DM = require('../src/device-mount.js'), CS = require('../src/server/child-starter.js');
      const asks = [], late = [];
      const lingering = { stats: () => ({}), run: (cmd, args, o) => { asks.push({ cmd, mp: args[args.length - 1], ms: o && o.timeoutMs }); if (o && o.onTimeout) o.onTimeout(0); if (o && o.onLateExit) late.push(o.onLateExit); return Promise.resolve({ started: true, timedOut: true, code: null, pid: 0 }); } };
      const mpH = path.join(FC, 'mnt-hang'), said = [];
      let a1, a2, n2, rel = null, stuckAfter = null;
      const S0 = CS.childStarter(); CS.setChildStarter(lingering);
      try {
        a1 = await DM.lazyUnmount(mpH, { ms: 40, say: (l) => said.push(l) });
        a2 = await DM.lazyUnmount(mpH, { ms: 40, say: (l) => said.push(l) });   // its first child has not ended: no second one
        n2 = asks.filter((x) => x.mp === mpH).length;
        late.splice(0).forEach((f) => { try { f(); } catch { } });   // the killed child ends at last — the mount point may be tried again
        stuckAfter = DM.unmountStuckOf(mpH);
        try { await DM.releaseStale(path.join(FC, 'mnt-hang2'), { ms: 40, log: () => {} }); } catch (e) { rel = e && e.code; }
        check('A: a hung unmount answers «hung» at its bound, its child ended by the starter, SAID once; while that child lives the mount point gets no second child; a release over it fails BY NAME (unmount_hung)',
          a1 === 'hung' && a2 === 'hung' && n2 === 1 && gateOf(asks.every((x) => x.ms === 40)) && said.length === 1 && gateOf(/could not release the folder — its unmount did not answer/.test(said[0])) && stuckAfter === false && rel === 'unmount_hung', JSON.stringify({ a1, a2, n2, said, stuckAfter, rel }));
      } finally { CS.setChildStarter(S0); }
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
    let failNext = false;   // the next mount refuses (the device's folder server) — cure 2's words leg
    DMX.deviceFolderMount = async ({ mountpoint, onGone, preCleaned }) => { const c = { mp: mountpoint, onGone, torn: 0, preCleaned: !!preCleaned }; events.push(['mount', mountpoint]); if (gate) await gate.p; if (failNext) { failNext = false; throw new Error('serve-folder refused'); } chains.push(c); return { mountpoint, devicePort: 1, bridgePort: 1, teardown: async () => { c.torn++; } }; };
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
          hungFor = null; failNext = true; let err2 = null;   // cure 2: the release succeeds now, the mount fails for ANOTHER reason
          try { await mm._up(mm._state.mounts.find((r) => r.id === 'mm-b')); } catch (e) { err2 = e && e.message; }
          const afterRelease = { err2, error: rowB().error || null };
          await mm._up(mm._state.mounts.find((r) => r.id === 'mm-b'));
          out.hung = { ...after, afterRelease, cleared: rowB().error == null && rowB().live };
          if (mm._pullErrors) mm._pullErrors.set('mm-b', 'could not release the folder (planted)');
          await mm.unmount('mm-b'); out.hung.entryGone = !(mm._pullErrors && mm._pullErrors.has('mm-b')); hungFor = null; }
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
      const boot = async (MM, { removeE = false, readd = false, hangE = false } = {}) => {
        const dataDir = path.join(tmp, 'fcc7-boot-' + Math.random().toString(36).slice(2)); fs.mkdirSync(dataDir, { recursive: true });
        const mpC = path.join(tmp, 'fcc7', 'boot-c'), mpE = path.join(tmp, 'fcc7', 'boot-e');
        fs.writeFileSync(path.join(dataDir, 'machine-mounts.json'), JSON.stringify({ mounts: [
          { id: 'mm-c', dir: 'pull', hostId: 'h2', remotePath: '/y', mountpoint: mpC, createdAt: 1 },
          { id: 'mm-e', dir: 'pull', hostId: 'h2', remotePath: '/w', mountpoint: mpE, createdAt: 1 },
        ] }));
        const online = { d2: false }, ev = [], pend = [];
        let auto = false;   // until set, a release HOLDS (a gate the leg opens); after, it answers at once
        const hosts = { get: (id) => { if (id !== 'h2') throw new Error('unknown machine'); return { id: 'h2', transport: 'dial', deviceId: 'd2' }; }, dialOnline: (d) => !!online[d], deviceBounded: async () => ({}), findByDeviceId: () => ({ id: 'h2' }) };
        DMX.releaseStale = async (mp) => { const n = path.basename(mp); ev.push('release-start ' + n); if (!auto) await new Promise((r) => pend.push({ mp, open: r })); ev.push('release-end ' + n); if (hangE && n === 'boot-e') { hangE = false; ev.push('release-hung boot-e'); throw Object.assign(new Error(`could not release the folder ${mp} — its unmount did not answer in 10 s`), { code: 'unmount_hung' }); } return []; };
        DMX.deviceFolderMount = async ({ mountpoint, remotePath }) => { ev.push('mount ' + path.basename(mountpoint) + (remotePath === '/w2' ? ' again' : '')); return { mountpoint, devicePort: 1, bridgePort: 1, teardown: async () => { } }; };
        const mm = new MM({ dataDir, hosts, rcloneBin: () => 'rclone', broadcast: () => { }, log: () => { } });
        clearInterval(mm._sweep);
        const restored = mm.restore();
        await until(() => pend.length === 1);
        const firstOnly = ev.join() === 'release-start boot-c';
        online.d2 = true; mm.onMachineLinked('h2');   // the machine dials in WHILE the boot still releases
        await quiet(() => ev.length);
        if (removeE) await mm.unmount('mm-e');   // cure 2: the person removes a pull WHILE its heal waits for the boot release
        let readdP = null, racedF = false;
        if (readd) {   // cure 3 (the cure-2 read #3): … and adds the SAME folder again (a new record, a new id) while the boot still holds it
          const from = ev.length;   // only what the NEW record does counts (cure-3 read #1)
          readdP = mm.mountPull('h2', { remotePath: '/w2', mountpoint: mpE }).catch((e) => ({ err: e && e.message }));
          await quiet(() => ev.length);
          racedF = ev.slice(from).some((e) => e === 'release-start boot-e' || e === 'mount boot-e again');
        }
        const raced = ev.filter((e) => e === 'release-start boot-c').length > 1 || ev.some((e) => e.startsWith('mount'));
        auto = true; for (const g of pend.splice(0)) g.open();
        await restored;
        await until(() => ev.filter((e) => e.startsWith('mount')).length >= (removeE && !readd ? 1 : 2));
        if (removeE) await quiet(() => ev.length);
        const f = readdP ? await readdP : null;
        const at = (e) => ev.indexOf(e);
        return { firstOnly, raced, oneByOne: at('release-end boot-c') >= 0 && at('release-start boot-e') > at('release-end boot-c'),
          waited: at('mount boot-c') > at('release-end boot-c') && (removeE || at('mount boot-e') > at('release-end boot-e')), mountedE: ev.includes('mount boot-e'), liveE: mm._live.has('mm-e'),
          racedF, liveF: !!(f && f.live), fAfter: ev.indexOf('release-hung boot-e') >= 0 && ev.indexOf('mount boot-e again') > ev.indexOf('release-hung boot-e'), wordsE: !!(mm._pullErrors && mm._pullErrors.has('mm-e')), ev };
      };
      const bo = await boot(require('../src/machine-mounts.js').MachineMounts);
      check('B: at boot the offline machine\'s releases run ONE AFTER ANOTHER; a dial-in meanwhile starts nothing on a record until ITS release has ended (never racing it)', gateOf(bo.firstOnly) && !bo.raced && gateOf(bo.oneByOne) && verdictOf(bo.waited), JSON.stringify(bo));
      // cure 3: ONE record, the chain's doors held open by the leg (the cure-2 read #4, #6)
      const mini = (MM, { online, mount, release }) => {
        const dataDir = path.join(tmp, 'fcc7-mini-' + Math.random().toString(36).slice(2)); fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(path.join(dataDir, 'machine-mounts.json'), JSON.stringify({ mounts: [{ id: 'mm-g', dir: 'pull', hostId: 'h2', remotePath: '/g', mountpoint: path.join(tmp, 'fcc7', 'mini-g'), createdAt: 1 }] }));
        DMX.releaseStale = release; DMX.deviceFolderMount = mount;
        const hosts = { get: () => ({ id: 'h2', transport: 'dial', deviceId: 'd2' }), dialOnline: () => online, deviceBounded: async () => ({}), findByDeviceId: () => ({ id: 'h2' }) };
        const mm = new MM({ dataDir, hosts, rcloneBin: () => 'rclone', broadcast: () => { }, log: () => { } });
        clearInterval(mm._sweep);
        return mm;
      };
      const held = () => { let open; const p = new Promise((r) => { open = r; }); return { p, open: () => open(), at: 0 }; };
      // #4: the person removes the pull WHILE its mount is being made — the mount lets go when it lands (the second check)
      const landGone = async (MM) => {
        const g = held(); let torn = 0;
        const mm = mini(MM, { online: true, release: async () => [], mount: async ({ mountpoint }) => { g.at++; await g.p; return { mountpoint, devicePort: 1, bridgePort: 1, teardown: async () => { torn++; } }; } });
        try { const up = mm._up(mm._state.mounts[0]); await until(() => g.at === 1); await mm.unmount('mm-g'); g.open(); await up; return { torn, live: mm._live.has('mm-g') }; } finally { clearInterval(mm._sweep); }
      };
      // #6: the person removes the pull WHILE its release runs, and the release hangs — no words come back for a gone record
      const wordsGone = async (MM, road) => {
        const g = held();
        const mm = mini(MM, { online: road === 'heal', release: async (mp) => { g.at++; await g.p; throw Object.assign(new Error(`could not release the folder ${mp} — its unmount did not answer in 10 s`), { code: 'unmount_hung' }); }, mount: async () => { throw new Error('not reached'); } });
        try {
          const ran = road === 'heal' ? mm._up(mm._state.mounts[0]).catch(() => { }) : mm.restore();
          await until(() => g.at === 1); await mm.unmount('mm-g'); g.open(); await ran;
          return !!(mm._pullErrors && mm._pullErrors.has('mm-g'));
        } finally { clearInterval(mm._sweep); }
      };
      // cure-3 read #2: a LINKED machine's pull on the folder an OFFLINE machine's record holds (a replacement under the same
      // name lands on the same default mount point) — at boot its heal waits for the offline record's step on that folder.
      // B-d033 (lane artifacts-by-intent, 主开发 r3551): the scene waits on FACTS — the offline step entered its gate, the linked heal
      // read the marks (only _up reads them: counted), then nothing else moves while the gate holds. It counted four loop turns
      // («every stub answers in microtasks»); since 427fc58ea restore() first awaits a real read of the kept copies (off the loop),
      // so the count lost whenever that read landed later (8 red of 71 rows, at any load). `copiesHeld` PLACES that read on a hold
      // opened after the old count's four turns: the old count must read a race there, the facts must not
      const twin = async (MM, { copiesHeld = false } = {}) => {
        const dataDir = path.join(tmp, 'fcc7-twin-' + Math.random().toString(36).slice(2)); fs.mkdirSync(dataDir, { recursive: true });
        const mpT = path.join(tmp, 'fcc7', 'twin'), g = held(), evs = [];
        fs.writeFileSync(path.join(dataDir, 'machine-mounts.json'), JSON.stringify({ mounts: [
          { id: 'mm-x', dir: 'pull', hostId: 'h2', remotePath: '/t', mountpoint: mpT, createdAt: 1 },
          { id: 'mm-y', dir: 'pull', hostId: 'h1', remotePath: '/t', mountpoint: mpT, createdAt: 2 },
        ] }));
        DMX.releaseStale = async () => { evs.push('release'); if (g.at++ === 0) await g.p; return []; };
        DMX.deviceFolderMount = async ({ mountpoint }) => { evs.push('mount'); return { mountpoint, devicePort: 1, bridgePort: 1, teardown: async () => { } }; };
        const hosts = { get: (id) => { const h = ({ h1: { id: 'h1', transport: 'dial', deviceId: 'd1' }, h2: { id: 'h2', transport: 'dial', deviceId: 'd2' } })[id]; if (!h) throw new Error('unknown machine'); return h; },
          dialOnline: (d) => d === 'd1', deviceBounded: async () => ({}), findByDeviceId: () => null };
        const mm = new MM({ dataDir, hosts, rcloneBin: () => 'rclone', broadcast: () => { }, log: () => { } });
        clearInterval(mm._sweep);
        mm._pairGraceMs = 0;   // B-844b: the two records are a PAIR on one folder — the grace over, the linked one (it can mount now) holds; this leg is about the ORDER of the steps
        mm._realMp.set('mm-x', path.resolve(mpT)); mm._realMp.set('mm-y', path.resolve(mpT));   // known up front: no realpath child skews the order
        let markReads = 0;
        mm._releasing = new (class extends Map { [Symbol.iterator]() { markReads++; return super[Symbol.iterator](); } })();   // restore keeps it (`|| new Map()`)
        const cp = held();
        if (copiesHeld) { const rc = mm._copies(); mm._copies = () => ({ ...rc, refresh: () => cp.p.then(() => rc.refresh()) }); }
        try {
          const restored = mm.restore();
          let before4 = null;
          if (copiesHeld) { for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r)); before4 = evs.slice(); cp.open(); }   // the OLD clock, judged only here
          const entered = await until(() => g.at >= 1, 10000), read = await until(() => markReads >= 1, 10000);
          await quiet(() => evs.length);   // an effect that is NOT coming: nothing else moves while the offline step holds the folder
          const before = evs.slice();
          g.open(); await restored; await until(() => mm._live.has('mm-y'));
          return { raced: before.length !== 1 || before.includes('mount'), entered, read, before, ...(copiesHeld ? { oldRaced: before4.length !== 1 || before4.includes('mount'), before4 } : {}), live: mm._live.has('mm-y'), evs };
        } finally { clearInterval(mm._sweep); }
      };
      // cure 4 (the readers' should): the person removes the pull while the mount it ASKED for waits — mountPull / remount
      // refuse by name (mount_removed), never a 200 with live:false for a record that is gone
      // `hold`: 'release' (held inside the heal, the mount lands after the removal), 'hung' (the held release then HANGS: the
      // road throws first — cure-4 read #3), 'mark' (the boot's mark on the folder holds it — read #6)
      const removedAsk = async (MM, road, hold = 'release') => {
        const g = held(), mp = path.join(tmp, 'fcc7', 'mini-g'), events = [];
        const mm = mini(MM, { online: true, release: async (m) => { if (hold === 'mark') return []; g.at++; await g.p; if (hold === 'hung') throw Object.assign(new Error(`could not release the folder ${m} — its unmount did not answer in 10 s`), { code: 'unmount_hung' }); return []; }, mount: async ({ mountpoint }) => ({ mountpoint, devicePort: 1, bridgePort: 1, teardown: async () => { } }) });
        if (hold === 'mark') { mm._releasing = new Map([[path.resolve(mp), g.p]]); g.at = 1; }
        const ev0 = global.__vsEvent; global.__vsEvent = (n) => events.push(n);
        try {
          const asked = (road === 'remount' ? mm.remount('mm-g') : mm.mountPull('h2', { remotePath: '/g', mountpoint: mp })).then((v) => ({ live: v && v.live }), (e) => ({ code: e && e.code, err: e && e.message }));
          await until(() => g.at === 1); await mm.unmount('mm-g'); g.open();
          const out = await asked; out.failedEvent = events.includes('machine-mount-pull-failed'); out.live2 = mm._live.has('mm-g');
          return out;
        } finally { global.__vsEvent = ev0; clearInterval(mm._sweep); }
      };
      // the controls: ONE patched copy of machine-mounts.js, each cut behind its own flag (one compile — the fast tier's cap);
      // every anchor found exactly once or the control is red by name (no older object is read — §2j)
      const MSRC = fs.readFileSync(path.join(SRC, 'machine-mounts.js'), 'utf8');
      const mcuts = [
        ['wait', "    for (const rel of rels) { try { await rel; } catch { } }\n", "    for (const rel of rels) { if (globalThis.__mmCut.wait) break; try { await rel; } catch { } }\n"],   // (B-844b: the marks of every nested folder)
        ['byId get', "    const mine = this._markKey(rec);", "    const mine = globalThis.__mmCut.byId ? rec.id : this._markKey(rec);"],   // (B-844b: the mark's key is the folder's real path)
        ['byId set', "      const key = this._markKey(rec);", "      const key = globalThis.__mmCut.byId ? rec.id : this._markKey(rec);"],
        ['gone1', "    if (!this._state.mounts.some((m) => m.id === rec.id)) return;\n    if (this._live.has(rec.id)", "    if (!globalThis.__mmCut.gone1 && !this._state.mounts.some((m) => m.id === rec.id)) return;\n    if (this._live.has(rec.id)"],
        ['gone2', "      if (!this._state.mounts.some((m) => m.id === rec.id)) { try { await h.teardown(); } catch { } return; }", "      if (!globalThis.__mmCut.gone2 && !this._state.mounts.some((m) => m.id === rec.id)) { try { await h.teardown(); } catch { } return; }"],
        ['words1', "      if (e && e.code === 'unmount_hung' && this._state.mounts.some((m) => m.id === rec.id)) { const said", "      if (e && e.code === 'unmount_hung' && (globalThis.__mmCut.words1 || this._state.mounts.some((m) => m.id === rec.id))) { const said"],
        ['words2', "        if (e && e.code === 'unmount_hung' && !this._held.has(rec.id) && this._state.mounts.some((m) => m.id === rec.id)) { this._sayCode(rec.id, e); (this._pullErrors", "        if (e && e.code === 'unmount_hung' && !this._held.has(rec.id) && (globalThis.__mmCut.words2 || this._state.mounts.some((m) => m.id === rec.id))) { this._sayCode(rec.id, e); (this._pullErrors"],   // B-af94: the hung release keeps its code
        ['asked', "    if (gone()) throw removedWhileMounting();\n  }", "    if (!globalThis.__mmCut.asked && gone()) throw removedWhileMounting();\n  }"],
        ['asked throw', "catch (e) { if (gone()) throw removedWhileMounting(); throw e; }", "catch (e) { if (!globalThis.__mmCut.askedThrow && gone()) throw removedWhileMounting(); throw e; }"],
        ['asked quiet', "      if (e && (e.code === 'mount_removed' || e.code === 'mount_point_in_use' || e.code === 'mount_point_nested' || e.code === 'mount_point_releasing' || e.code === 'mount_point_unchecked' || e.code === 'mount_point_add_unchecked')) {", "      if (!globalThis.__mmCut.quiet && e && (e.code === 'mount_removed' || e.code === 'mount_point_in_use' || e.code === 'mount_point_nested' || e.code === 'mount_point_releasing' || e.code === 'mount_point_unchecked' || e.code === 'mount_point_add_unchecked')) {"],   // B-844b r5–r8: the no-event codes grew
      ];
      const mmiss = mcuts.filter(([, a]) => MSRC.split(a).length !== 2).map(([k]) => k);
      let MG = null;
      if (mmiss.length) check('CONTROL: the machine-mounts.js anchors were found once each', false, mmiss.join());
      else {
        globalThis.__mmCut = {};
        const cpG = path.join(tmp, 'machine-mounts-cuts.js');
        fs.writeFileSync(cpG, mcuts.reduce((x, [, a, b]) => editAnchor(x, a, () => b, "the text a fold hands its step"), MSRC).replace(/require\('\.\//g, `require('${SRC}/`));
        MG = require(cpG).MachineMounts;
      }
      const mcut = async (k, f) => { globalThis.__mmCut = { [k]: true }; try { return await f(); } finally { globalThis.__mmCut = {}; } };
      if (MG) {
        const bw = await mcut('wait', () => boot(MG));
        check('CONTROL (the dial-in does not wait): the heal releases / mounts a record while its boot release still runs (red)', verdictOf(bw.raced), JSON.stringify(bw));
      }
      const MM3 = require('../src/machine-mounts.js').MachineMounts;
      const br = await boot(MM3, { removeE: true, readd: true, hangE: true });
      check('B: cure 2 (as if a must) — a pull the person REMOVED while its heal waited for the boot release is never mounted (no rclone, no live entry for a gone record)', !br.mountedE && !br.liveE && verdictOf(br.waited), JSON.stringify(br));
      check('B: cure 3 (the cure-2 read #3, #6) — the same folder added again meanwhile (a NEW record) waits for the boot\'s step on that folder, then mounts; the removed record\'s hung step leaves no words', !br.racedF && gateOf(br.liveF) && gateOf(br.fAfter) && !br.wordsE, JSON.stringify(br));
      const lg = await landGone(MM3), wh = await wordsGone(MM3, 'heal'), wb = await wordsGone(MM3, 'boot'), tw = await twin(MM3), twh = await twin(MM3, { copiesHeld: true });
      const ap = await removedAsk(MM3, 'pull'), ar = await removedAsk(MM3, 'remount'), ah = await removedAsk(MM3, 'pull', 'hung'), am = await removedAsk(MM3, 'remount', 'mark');
      check('B: cure 4 (the readers\' should) — the person removes the pull while the mount it asked for waits: mountPull and remount refuse with the removal\'s words (mount_removed), never a 200 with live:false — and nothing of it stays mounted', ap.code === 'mount_removed' && ar.code === 'mount_removed' && !ap.live2 && !ar.live2, JSON.stringify({ ap, ar }));
      check('B: cure 4 (its read #3, #4, #6) — the same when the road THREW first (a hung release: never the stale «could not release» words) and when the boot\'s mark held the folder; the person\'s own removal is no failure event', ah.code === 'mount_removed' && am.code === 'mount_removed' && !ap.failedEvent && !ah.failedEvent, JSON.stringify({ ah, am }));
      check('B: cure 3 (the cure-3 read #2) — every offline mark is set BEFORE a linked machine heals: its pull on the same folder waits for the offline record\'s step, then mounts', tw.raced === false && tw.live === true, JSON.stringify(tw));
      check('B: cure 3 (the cure-3 read #2) under a PLACED hold of the kept copies\' read restore() awaits first (B-d033) — four loop turns read a race although the order is right (the old clock lost); the scene\'s facts (its gate entered, the marks read, nothing else moving) do not',
        twh.oldRaced === true && twh.raced === false && twh.live === true && twh.entered === true && twh.read === true, JSON.stringify(twh));
      check('B: cure 3 (the cure-2 read #4) — a pull removed WHILE its mount is being made: the mount lets go when it lands, no live entry for a gone record', lg.torn === 1 && lg.live === false, JSON.stringify(lg));
      check('B: cure 3 (the cure-2 read #6) — a pull removed WHILE its release hangs gets no «could not release» words back, on the heal\'s road and on the boot\'s', wh === false && wb === false, JSON.stringify({ wh, wb }));
      if (MG) {
        const bc = await mcut('gone1', () => boot(MG, { removeE: true })), bi = await mcut('byId', () => boot(MG, { removeE: true, readd: true }));
        const lc = await mcut('gone2', () => landGone(MG)), w1 = await mcut('words1', () => wordsGone(MG, 'heal')), w2 = await mcut('words2', () => wordsGone(MG, 'boot'));
        // (the «heal before the marks» cut's control is gone with B-844b r4: _up AWAITS the pair check before it reads the marks, so a heal
        // reads them only after restore set them — the order is structural now; the twin leg above holds the outcome. B-d033: the twin's
        // own red is the «heal does not wait» cut below)
        const tc = await mcut('wait', () => twin(MG));
        check('CONTROL (B-d033, the heal does not wait for the boot release): the twin scene reads the race — the linked pull releases and mounts while the offline record\'s step still holds the folder (red)', tc.raced === true && tc.read === true, JSON.stringify(tc));
        const cp = await mcut('asked', () => removedAsk(MG, 'pull')), cr = await mcut('asked', () => removedAsk(MG, 'remount'));
        const ct = await mcut('askedThrow', () => removedAsk(MG, 'pull', 'hung')), cq = await mcut('quiet', () => removedAsk(MG, 'pull'));
        check('CONTROL (no check after the asked mount / the road\'s own throw passed on / the removal logged as a failure): live:false for the removed pull / the stale «could not release» refusal / a failure event (red)',
          !cp.code && cp.live === false && !cr.code && cr.live === false && ct.code === 'unmount_hung' && cq.code === 'mount_removed' && cq.failedEvent === true, JSON.stringify({ cp, cr, ct, cq }));
        check('CONTROL (no record check after the wait): the removed pull is mounted anyway (red)', bc.mountedE === true, JSON.stringify(bc));
        check('CONTROL (the boot\'s mark keyed by the record id, at the mark and at the wait): the pull added again on the same folder releases it while the boot still holds it — the removed record\'s own heal still waits (red)', bi.racedF === true && !bi.raced, JSON.stringify(bi));
        check('CONTROL (no record check when the mount lands): a live entry for the removed pull (red)', lc.live === true && lc.torn === 0, JSON.stringify(lc));
        check('CONTROL (the words set whatever the record): the removed pull gets its words back on both roads (red)', w1 === true && w2 === true, JSON.stringify({ w1, w2 }));
      }
    } finally { Object.assign(DMX, real); }
    check('B: the recorded pull mounts at boot while its machine is linked', o.up === true, JSON.stringify(o));
    check('B: at boot, an OFFLINE machine\'s recorded pull is released now (releaseStale)', o.bootReleased === true, JSON.stringify(o));
    check('B: a heal RELEASES FIRST — before the machine is asked anything — and tells the chain it is pre-cleaned (r1 #2)', o.releaseFirst === true, JSON.stringify(events.slice(0, 8)));
    check('B: an ssh machine that cannot be reached (online by definition) still has its mount point released by the failed heal (r1 #2)', o.sshReleased === true, JSON.stringify(o));
    check('B: the machine\'s link closes ⇒ its live pull is torn down at once (the lazy unmount), the row says offline, the clients told',
      o.unlinked === 1 && o.offline.live === false && o.offline.online === false && o.offline.torn === 1 && verdictOf(o.offline.told), JSON.stringify(o.offline));
    check('B: the re-dial mounts it again (a new chain)', o.relinked === true);
    check('B: an OLD chain\'s late exit never drops the newer live chain', o.staleGone.live === true && !o.staleGone.told, JSON.stringify(o.staleGone));
    check('B: its rclone exiting ⇒ the row is not live at once, the clients told; a chain that died YOUNG keeps the 5-min backoff (r1 #5)', gateOf(o.rcExit.said) && o.rcExit.live === false && gateOf(o.rcExit.told) && verdictOf(o.rcExit.backoff), JSON.stringify(o.rcExit));
    check('B: the link closes WHILE the mount is being made ⇒ the mount lets go when it lands, never a live row over a dead link (r1 #4)', o.inflight.unlinked === 0 && o.inflight.live === false && o.inflight.torn === 1, JSON.stringify(o.inflight));
    check('B: the sweep\'s belt — a live pull of a machine found offline is torn down', o.sweep.live === false && o.sweep.torn === 1, JSON.stringify(o.sweep));
    check('B: a release that HUNG fails the heal by name, is SAID on the row (list().error), and the record leaves the mounting set — the next try mounts and clears the words', gateOf(o.hung) && o.hung.err === 'unmount_hung' && o.hung.mounting === false && gateOf(/could not release the folder/.test(o.hung.error || '')) && o.hung.cleared === true, JSON.stringify(o.hung));
    check('B: cure 2 — the «could not release» words go once a release SUCCEEDED, even when the mount then fails for another reason; and they go with their record', gateOf(o.hung) && gateOf(o.hung.afterRelease) && gateOf(/serve-folder refused/.test(o.hung.afterRelease.err2 || '')) && o.hung.afterRelease.error === null && o.hung.entryGone === true, JSON.stringify(o.hung));
    const dp = fs.readFileSync(new URL('../src/server/dial-pairing.js', import.meta.url), 'utf8');
    check('B: wiring — the dial link\'s «disconnected» fact unmounts the machine\'s pulls (dial-pairing noteDialEvent)', verdictOf(/if \(event === 'disconnected'\) \{ try \{ machineMounts\.onMachineUnlinked\(hosts\.findByDeviceId\(deviceId\)\?\.id\); \} catch \{ \} \}/.test(dp)));
    if (!oc) console.log(`  SKIP test-pull-refresh §15 B CONTROL: the release ${BASE_REF} is not in this checkout (a depth-1 clone)`);
    else check('CONTROL (the release\'s machine-mounts.js): the boot releases nothing, a heal never releases first, an unreachable ssh machine keeps its mount, there is no unlink door, the chain is not told to say its exit, a mount made while the link closed stays live and the sweep skips an offline mount (red)',
      oc.up === true && oc.bootReleased === false && oc.releaseFirst === false && oc.sshReleased === false && oc.unlinked === 'no such door' && oc.offline.live === true && oc.rcExit.said === false && oc.rcExit.live === true && oc.inflight.live === true && oc.sweep.live === true && oc.hung.error == null, JSON.stringify(oc));
  }
  console.log('§16 B-fcc7 (the remainder): the file window meets the row\'s state, never the empty folder of a pull that is not mounted');
  {
    const MMx = require('../src/machine-mounts.js'), DMX = require('../src/device-mount.js');
    const dataDir = path.join(tmp, 'fcc7-shadow'); fs.mkdirSync(dataDir, { recursive: true });
    const base = path.join(tmp, 'fcc7-shadow-mp'), mpMac = path.join(base, 'mac'), mpMacbook = path.join(base, 'macbook'), mpIn = path.join(base, 'macbook', 'inner'), mpGone = path.join(base, 'removed'), mpOwn = path.join(base, 'own'), mpTwo = path.join(base, 'two'), mpNew = path.join(base, 'new'), mpNE = path.join(base, 'ne');
    for (const d of [mpMac, mpMacbook, mpIn, mpGone, mpOwn, mpTwo, mpNew, mpNE]) fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(mpOwn, 'my-notes.txt'), 'mine');   // a person's own folder picked as a mount point
    fs.writeFileSync(path.join(dataDir, 'machine-mounts.json'), JSON.stringify({ mounts: [
      { id: 'mm-mac', dir: 'pull', hostId: 'h-mac', remotePath: '/Users/a', mountpoint: mpMac, createdAt: 1 },
      { id: 'mm-mb', dir: 'pull', hostId: 'h-mb', remotePath: '/Users/b', mountpoint: mpMacbook, createdAt: 1 },
      { id: 'mm-in', dir: 'pull', hostId: 'h-ssh', remotePath: '/srv', mountpoint: mpIn, createdAt: 1 },
      { id: 'mm-gone', dir: 'pull', hostId: 'h-removed', remotePath: '/r', mountpoint: mpGone, createdAt: 1 },
      { id: 'mm-own', dir: 'pull', hostId: 'h-mac', remotePath: '/o', mountpoint: mpOwn, createdAt: 1 },
      { id: 'mm-two-old', dir: 'pull', hostId: 'h-removed', remotePath: '/t', mountpoint: mpTwo, createdAt: 1 },   // a removed machine's record kept…
      { id: 'mm-two', dir: 'pull', hostId: 'h-mb', remotePath: '/t', mountpoint: mpTwo, createdAt: 3 },   // …and the machine added again: the same folder
      { id: 'mm-new', dir: 'pull', hostId: 'h-mb', remotePath: '/n', mountpoint: mpNew, createdAt: 5 },
      { id: 'mm-ne', dir: 'pull', hostId: 'h-mb', remotePath: '/e', mountpoint: mpNE, createdAt: 5 },
      { id: 'mm-push', dir: 'push', hostId: 'h-mac', folder: '/x', mountpoint: path.join(base, 'pushed'), mode: 'ro', createdAt: 1 },   // its mount point is on the OTHER machine
    ] }));
    const online = { 'd-mac': false, 'd-mb': true };
    const HOSTS = { 'h-mac': { id: 'h-mac', name: 'Studio Mac', transport: 'dial', deviceId: 'd-mac' }, 'h-mb': { id: 'h-mb', name: 'Laptop', transport: 'dial', deviceId: 'd-mb' }, 'h-ssh': { id: 'h-ssh', name: 'build box', transport: 'ssh' } };
    const hosts = { get: (id) => { if (!HOSTS[id]) throw new Error('host not found'); return HOSTS[id]; }, dialOnline: (d) => !!online[d], deviceBounded: async () => ({}), findByDeviceId: () => null };
    const mm = new MMx.MachineMounts({ dataDir, hosts, rcloneBin: () => 'rclone', broadcast: () => { }, log: () => { } });
    clearInterval(mm._sweep);
    // §16 is the DOOR, not the pair rule (§17): its fixture (a pull nested in another's, two records on one folder) predates B-6c4f —
    // the real paths known up front and no pair check, so no record of it is held here
    for (const r of mm._state.mounts) if (r.dir === 'pull') mm._realMp.set(r.id, fs.realpathSync(r.mountpoint));
    mm._pairsOnce = Promise.resolve();
    const sh = (q) => mm.shadowedBy(q);
    const live = (id, mpX) => mm._live.set(id, { teardown: async () => { }, mountpoint: mpX, at: Date.now() });
    const recOf = (id) => mm._state.mounts.find((m) => m.id === id);
    // THE PROBE (a child `ls -A` over the real folders): empty / not empty / unreadable / skipped while live
    const pMac = await mm._probeBare(recOf('mm-mac')), pOwn = await mm._probeBare(recOf('mm-own'));
    const ghost = { id: 'mm-ghost', dir: 'pull', hostId: 'h-mb', mountpoint: path.join(base, 'no-such-folder') }; mm._state.mounts.push(ghost);
    const pGhost = await mm._probeBare(ghost); mm._state.mounts.pop();
    live('mm-new', mpNew); const pLive = await mm._probeBare(recOf('mm-new')); mm._live.delete('mm-new');
    check('§16 THE PROBE: an empty bare folder → empty; a person\'s own folder with files → not empty; a folder that cannot be read → no verdict (shown as before); a live pull is never probed', pMac === 'empty' && pOwn === 'not-empty' && pGhost === null && !mm._bare.has('mm-ghost') && pLive === null && !mm._bare.has('mm-new'), JSON.stringify({ pMac, pOwn, pGhost, pLive }));
    for (const id of ['mm-mb', 'mm-in', 'mm-gone', 'mm-two-old', 'mm-two']) mm._bare.set(id, 'empty');   // (the predicate's legs: probed empty)
    const a = sh(path.join(mpMac, 'Documents', 'a.txt'));
    check('§16 a path under an OFFLINE machine\'s pull folder, probed empty, not mounted → that record: offline, the machine by name, its mount point', !!a && a.id === 'mm-mac' && a.offline === true && a.machine === 'Studio Mac' && a.name === 'Studio Mac' && a.mountpoint === mpMac, JSON.stringify(a));
    check('§16 the mount point itself is shadowed too', sh(mpMac)?.id === 'mm-mac');
    const b = sh(path.join(mpMacbook, 'f'));
    check('§16 a whole path segment: …/macbook is not under …/mac — its own record answers (online, not mounted)', !!b && b.id === 'mm-mb' && b.offline === false && b.machine === 'Laptop', JSON.stringify(b));
    const c = sh(path.join(mpIn, 'x'));
    check('§16 the INNERMOST pull answers (one nested under another\'s folder); an ssh machine is never «offline» by itself', !!c && c.id === 'mm-in' && c.offline === false && c.machine === 'build box', JSON.stringify(c));
    check('§16 never shadowed: a removed machine\'s record (no words would be true); a folder holding files of its own (a person\'s, picked as a mount point); a folder not probed yet', sh(path.join(mpGone, 'z')) === null && sh(path.join(mpOwn, 'my-notes.txt')) === null && sh(mpNew) === null);
    const wNew = mm.shadowedBy(mpNew, { writer: true }), wOwn = mm.shadowedBy(path.join(mpOwn, 'x.txt'), { writer: true }), wGone = mm.shadowedBy(path.join(mpGone, 'z'), { writer: true });
    check('§16 the WRITER\'s question (what a request adds, the TASK.md writer): ANY folder not live of an existing machine — one not probed yet, one holding files of its own — never a removed machine\'s', wNew?.id === 'mm-new' && wOwn?.id === 'mm-own' && wGone === null && sh(mpNew) === null && sh(mpOwn) === null, JSON.stringify({ wNew: wNew?.id, wOwn: wOwn?.id, wGone }));
    const t = sh(path.join(mpTwo, 'f'));
    check('§16 two records on one folder (a removed machine\'s kept, the machine added again): the existing machine\'s answers', !!t && t.id === 'mm-two' && t.machine === 'Laptop', JSON.stringify(t));
    check('§16 a push record (its folder is on the other machine), an unrelated path, a relative or an empty one: nothing', sh(path.join(base, 'pushed', 'q')) === null && sh(path.join(tmp, 'elsewhere')) === null && sh('mac/a') === null && sh('') === null && sh(null) === null);
    live('mm-mac', mpMac); live('mm-mb', mpMacbook); live('mm-two-old', mpTwo);
    check('§16 under ANY live pull\'s folder nothing is shadowed: a mounted one, a nested record under a live one (what shows is the machine\'s own), a second record on a live folder', sh(path.join(mpMac, 'Documents', 'a.txt')) === null && sh(path.join(mpIn, 'x')) === null && sh(path.join(mpTwo, 'f')) === null);
    mm._live.clear();
    // B-2ca0 follow-up (主开发 19:42Z): a record whose mount point was written THROUGH A LINK is matched by its REAL path too — WebDAV's
    // target comes from the real-pathed root: a write at the real path is refused by the door's words
    {
      const realD = path.join(base, 'lk-real'), linkD = path.join(base, 'lk-link');
      fs.mkdirSync(path.join(realD, 'mac'), { recursive: true }); fs.symlinkSync(realD, linkD);
      const realMac = fs.realpathSync(path.join(linkD, 'mac'));
      const lk = { id: 'mm-lk', dir: 'pull', hostId: 'h-mac', remotePath: '/lk', mountpoint: path.join(linkD, 'mac'), createdAt: 9 };
      const run = (M) => {
        M._state.mounts.push(lk); M._realMp.set('mm-lk', realMac);
        try { const w = M.shadowedBy(path.join(realMac, 'f.txt'), { writer: true }); return { w, words: w ? MMx.pullShadowBody(w).error : null, asWritten: M.shadowedBy(path.join(linkD, 'mac', 'f.txt'), { writer: true }) }; } finally { M._state.mounts.pop(); M._realMp.delete('mm-lk'); }
      };
      const got = run(mm);
      check('§16b B-2ca0 follow-up: a record whose mount point was written THROUGH A LINK — a write at its REAL path (WebDAV\'s real-pathed target) is refused by the door\'s words, as one at the path as written', got.w?.id === 'mm-lk' && got.asWritten?.id === 'mm-lk' && verdictOf(/“Studio Mac” is offline/.test(got.words || '')), JSON.stringify({ w: got.w && got.w.id, words: got.words }));
      const SRC0 = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src');
      const src0 = fs.readFileSync(path.join(SRC0, 'machine-mounts.js'), 'utf8');
      const anchor = "      const mp = this._pullFolders(m0).find((x) => x !== '/' && (rp === x || rp.startsWith(x + '/')));   // a whole path segment (…/mac is not …/macbook)";
      if (src0.split(anchor).length !== 2) check('§16b CONTROL: the shadowedBy anchor moved — update this suite', false);
      else {
        const Mod = require('module'), file = path.join(SRC0, 'machine-mounts.js'), mo = new Mod(file, null); mo.filename = file; mo.paths = Mod._nodeModulePaths(path.dirname(file));
        mo._compile(src0.replace(anchor, "      const mpW = path.resolve(m0.mountpoint), mp = mpW !== '/' && (rp === mpW || rp.startsWith(mpW + '/')) ? mpW : null;"), file);
        const mmC = new mo.exports.MachineMounts({ dataDir, hosts, rcloneBin: () => 'rclone', broadcast: () => { }, log: () => { } }); clearInterval(mmC._sweep);
        const c = run(mmC);
        check('§16b CONTROL (RED): the release\'s match (the mount point as written only) — a write at the real path is NOT refused (the PUT would land in the bare folder)', c.w === null && c.asWritten?.id === 'mm-lk', JSON.stringify({ w: c.w }));
      }
    }
    // a mount clears the verdict; the link closing releases it and PROBES it again (the stub chain: the module's own DM seams)
    const realRel = DMX.releaseStale, realMount = DMX.deviceFolderMount;
    DMX.releaseStale = async () => [];
    DMX.deviceFolderMount = async ({ mountpoint }) => ({ mountpoint, devicePort: 1, bridgePort: 1, teardown: async () => { } });
    const road = {};
    try {
      let relOpen; const relP = new Promise((r) => { relOpen = r; });
      DMX.deviceFolderMount = async ({ mountpoint }) => ({ mountpoint, devicePort: 1, bridgePort: 1, teardown: () => new Promise(() => { }), released: () => relP });   // its lazy unmount HELD; its teardown NEVER settles (its unserveFolder rides a dead link)
      mm._bare.set('mm-new', 'empty');
      const heard = []; const offLive = MMx.onPullLive((mpX) => heard.push(mpX));
      await mm._up(recOf('mm-new'));
      offLive(); road.heard = heard.length === 1 && heard[0] === mpNew;   // who skipped the folder meanwhile is told (the TASK.md writer)
      road.mounted = mm._live.has('mm-new') && !mm._bare.has('mm-new') && sh(mpNew) === null;
      mm.onMachineUnlinked('h-mb');
      road.heldNoProbe = (await quiet(() => mm._bare.get('mm-new') || 'none', 4000, 200)) === 'none' && !mm._live.has('mm-new');   // no probe while its unmount runs
      relOpen('ok');
      road.reprobed = await until(() => mm._bare.get('mm-new') === 'empty', 3000);
      DMX.deviceFolderMount = async ({ mountpoint }) => ({ mountpoint, devicePort: 1, bridgePort: 1, teardown: async () => { } });
      road.shadowed = sh(mpNew)?.id === 'mm-new';
      // a mount refused «not empty» (a file a writer left in the bare folder): its words; the probe shows its files
      await mm._probeBare(recOf('mm-ne'));
      road.planted = sh(mpNE)?.id === 'mm-ne';   // the plant: an empty, released folder IS shadowed
      fs.writeFileSync(path.join(mpNE, 'stray.txt'), 'left while the machine was away');
      DMX.deviceFolderMount = async ({ mountpoint }) => { throw new Error(`rclone webdav mount exited: Fatal error: directory is not empty: "${mountpoint}"`); };
      let threw = ''; try { await mm._up(recOf('mm-ne')); } catch (e) { threw = e.message; }
      road.notEmpty = /not empty/.test(threw) && await until(() => mm._bare.get('mm-ne') === 'not-empty', 3000) && sh(path.join(mpNE, 'stray.txt')) === null;
      road.words = (mm.list().find((r) => r.id === 'mm-ne') || {}).error || '';
      fs.rmSync(path.join(mpNE, 'stray.txt'));
      DMX.deviceFolderMount = async ({ mountpoint }) => ({ mountpoint, devicePort: 1, bridgePort: 1, teardown: async () => { } });
      await mm._up(recOf('mm-ne'));
      road.cleared = mm._live.has('mm-ne') && !mm._bare.has('mm-ne') && !(mm.list().find((r) => r.id === 'mm-ne') || {}).error;
      mm._live.delete('mm-ne'); await mm._probeBare(recOf('mm-ne'));
      road.again = sh(mpNE)?.id === 'mm-ne';
    } finally { DMX.releaseStale = realRel; DMX.deviceFolderMount = realMount; mm._live.clear(); }
    check('§16 a mount clears the bare verdict; the link closing releases the folder and probes it again ONLY once its lazy unmount ended (held: no probe) — never waiting on the teardown (here it never settles): shadowed once more', !!(road.mounted && road.heard && road.heldNoProbe && road.reprobed && road.shadowed), JSON.stringify(road));
    check('§16 a mount refused «not empty» — the plant first (an empty released folder IS shadowed), then the stray file: the failed mount PROBES it (once its mounting mark is gone) and the folder SHOWS (its files can be moved out); the row says why', !!(road.planted && road.notEmpty && /not empty.*move its files out, then press Remount now/.test(road.words)), JSON.stringify(road));
    check('§16 …the stray moved out, a mount clears the words; released again it is shadowed', !!(road.cleared && road.again), JSON.stringify(road));
    check('§16 the door: nothing is shadowed before a manager registers (a worker, a process with none), and a throwing getter answers nothing', (MMx.registerPullDoor(null), MMx.pullShadowOf(mpMac) === null) && (MMx.registerPullDoor(() => { throw new Error('x'); }), MMx.pullShadowOf(mpMac) === null) && (MMx.registerPullDoor(() => mm), MMx.pullShadowOf(mpMac)?.id === 'mm-mac'));
    // the REAL files route in-process (as test-dir-complete serves it), no cloud storage registered
    const express = require('express');
    const app = express(); app.use(express.json());
    // B-3b03 (lane hub-loop-stalls): the files router never runs an op in-main — a REAL one-worker pool, as server.js wires one
    app.locals.safeFs = new (require('../src/safe-fs.js').SafeFs)({ poolSize: 1, name: 'test-pull-refresh' });
    app.locals.mounts = { pathBlocked: () => false, shadowedBy: () => null };
    app.use(require('../src/routes/files.js'));
    const server = require('http').createServer(app); await new Promise((res) => server.listen(0, '127.0.0.1', res));
    const at = `http://127.0.0.1:${server.address().port}`;
    const ls = async (q) => { const res = await fetch(`${at}/api/files?path=${encodeURIComponent(q)}`); return { status: res.status, body: await res.json() }; };
    const write = async (q) => { const res = await fetch(`${at}/api/file/write`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: q, content: 'x' }) }); return { status: res.status, body: await res.json().catch(() => null) }; };
    try {
      MMx.registerPullDoor(() => mm);
      const off = await ls(mpMac);
      check('§16 the file window over an offline machine\'s pull folder: 503 machine_offline, the machine by name — never an empty listing', off.status === 503 && off.body.code === 'machine_offline' && off.body.params?.machine === 'Studio Mac' && gateOf(/“Studio Mac” is offline/.test(off.body.error)) && !('items' in off.body), JSON.stringify(off));
      const dn = await ls(path.join(mpMacbook, 'sub'));
      check('§16 …an online machine whose pull is not mounted: 503 machine_folder_down', dn.status === 503 && dn.body.code === 'machine_folder_down' && dn.body.params?.machine === 'Laptop', JSON.stringify(dn));
      const own = await ls(mpOwn);
      check('§16 …a folder holding files of its own (a person\'s) lists them (200)', own.status === 200 && verdictOf((own.body.items || []).some((i) => i.name === 'my-notes.txt')), JSON.stringify(own).slice(0, 200));
      const wOwnR = await write(path.join(mpOwn, 'added.txt'));
      fs.writeFileSync(path.join(mpOwn, 'stray.txt'), 'left there');
      const del = await fetch(`${at}/api/file?path=${encodeURIComponent(path.join(mpOwn, 'stray.txt'))}`, { method: 'DELETE' });
      check('§16 …but nothing is ADDED there while it is not mounted (a write refused, machine_offline), and a file in it can be DELETED (a stray moved out)', wOwnR.status === 503 && wOwnR.body?.code === 'machine_offline' && !fs.existsSync(path.join(mpOwn, 'added.txt')) && del.status === 200 && !fs.existsSync(path.join(mpOwn, 'stray.txt')), JSON.stringify({ w: wOwnR.status, del: del.status }));
      const wr = await write(path.join(mpMac, 'new.txt'));
      check('§16 a write into the bare folder is refused the same way (machine_offline) — nothing written', wr.status === 503 && wr.body?.code === 'machine_offline' && !fs.existsSync(path.join(mpMac, 'new.txt')), JSON.stringify(wr));
      const post = async (u, body) => { const res = await fetch(`${at}${u}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: res.status, body: await res.json().catch(() => null) }; };
      const cp = await post('/api/file/copy', { src: mpMac, dest: path.join(tmp, 'fcc7-backup', 'mac') });
      const zip = await post('/api/archive', { paths: [mpMac], dest: path.join(tmp, 'fcc7-backup', 'mac.zip') });
      const rn = await post('/api/rename', { oldPath: path.join(tmp, 'fcc7-elsewhere.txt'), newPath: path.join(mpMac, 'moved-in.txt') });
      check('§16 EVERY path a request names: a copy FROM the bare folder, a compress of it, a rename INTO it — refused (never an empty copy that says it worked); nothing written', cp.status === 503 && cp.body?.code === 'machine_offline' && zip.status === 503 && zip.body?.code === 'machine_offline' && rn.status === 503 && rn.body?.code === 'machine_offline' && !fs.existsSync(path.join(tmp, 'fcc7-backup')) && !fs.existsSync(path.join(mpMac, 'moved-in.txt')), JSON.stringify({ cp, zip: zip.status, rn: rn.status }).slice(0, 300));
      // an UPLOAD: multer's own folder is fixed in the route (read from its source) — where this machine cannot write it (the test
      // machine's second box), the live drive cannot reach the route at all, so the route's ORDER is pinned from its source instead
      const fjU = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src/routes/files.js'), 'utf8');
      const upDir = (fjU.match(/multer\(\{ dest: '([^']+)' \}\)/) || [])[1] || '';
      const upOk = !!upDir && (() => { try { fs.accessSync(upDir, fs.constants.W_OK); return true; } catch (e) { if (e.code !== 'ENOENT') return false; try { fs.accessSync(path.dirname(upDir.replace(/\/+$/, '')), fs.constants.W_OK); return true; } catch { return false; } } })();
      if (upOk) {
        const fd = new FormData(); fd.append('destDir', mpMac); fd.append('fileNames', JSON.stringify(['up.txt'])); fd.append('files', new Blob(['uploaded']), 'up.txt');
        const upR = await fetch(`${at}/api/upload`, { method: 'POST', body: fd }); const up1 = { status: upR.status, body: await upR.json().catch(() => null) };
        check('§16 an UPLOAD into the bare folder is refused too (its multipart destDir, read after multer) — machine_offline, nothing written', up1.status === 503 && up1.body?.code === 'machine_offline' && !fs.existsSync(path.join(mpMac, 'up.txt')), JSON.stringify(up1).slice(0, 200));
      } else {
        console.log(`  · the upload's live drive needs multer's folder ${upDir || '(not found)'} writable — it is not on this machine; the route's order is pinned from its source`);
        const iRef = fjU.indexOf("const pullUp = await require('../machine-mounts.js').pullShadowOfReal(destRoot, { writer: true });"), iMk = fjU.indexOf("await sfs(req).call('mkdir', { path: destRoot });");
        check('§16 an UPLOAD (source order, where multer\'s folder cannot be written here): the pull refusal comes BEFORE the route makes or writes anything, and its catch answers the refusal\'s own body (B-422c: with the files that landed before it beside it)', iRef > 0 && iMk > iRef && verdictOf(/res\.status\(err\.status \|\| 400\)\.json\(\{ \.\.\.\(err\.pullBody \|\| \{ error: err\.message \}\), \.\.\.landedBody\(landedL, landedDir\) \}\)/.test(fjU)), JSON.stringify({ iRef, iMk }));
      }
      const viaDir = await fetch(`${at}/api/no-such-route?dir=${encodeURIComponent(mpMac)}`), viaOld = await post('/api/rename', { oldPath: path.join(mpMac, 'x'), newPath: path.join(tmp, 'fcc7-out-x') }), viaDest = await post('/api/no-such-route', { destDir: path.join(mpMac, 'sub') });
      check('§16 …reached by ?dir=, a rename\'s oldPath and a body destDir alike', viaDir.status === 503 && viaOld.status === 503 && viaDest.status === 503, JSON.stringify([viaDir.status, viaOld.status, viaDest.status]));
      const readPost = await post('/api/archive/extract-entry', { path: path.join(mpOwn, 'a.zip'), entry: 'x' });
      check('§16 a POST that only READS its path (an archive\'s entry) under a folder holding files is not refused as a write', readPost.status !== 503, JSON.stringify(readPost).slice(0, 160));
      const remoteSrc = await post('/api/file/copy', { src: mpMac, srcHost: 'h-remote', dest: path.join(mpMacbook, 'x') });
      check('§16 …a remote side is not this machine\'s (srcHost): only the local destination is asked', remoteSrc.status === 503 && remoteSrc.body?.code === 'machine_folder_down', JSON.stringify(remoteSrc).slice(0, 200));
      fs.writeFileSync(path.join(mpNE, 'stray2.txt'), 'left there'); await mm._probeBare(recOf('mm-ne'));
      const neBefore = mm._bare.get('mm-ne');
      const delNE = await fetch(`${at}/api/file?path=${encodeURIComponent(path.join(mpNE, 'stray2.txt'))}`, { method: 'DELETE' });
      const reprobed = await until(() => mm._bare.get('mm-ne') === 'empty', 3000);
      check('§16 a stray DELETED through the route has its folder probed again at once (not the sweep\'s 90 s): empty, so shadowed again', neBefore === 'not-empty' && delNE.status === 200 && gateOf(reprobed) && sh(mpNE)?.id === 'mm-ne', JSON.stringify({ neBefore, del: delNE.status, reprobed }));
      for (const n of ['s3.txt', 's4.txt', 's5.txt']) fs.writeFileSync(path.join(mpNE, n), n);
      await mm._probeBare(recOf('mm-ne'));
      const ne2 = mm._bare.get('mm-ne');
      const dels = await Promise.all(['s3.txt', 's4.txt', 's5.txt'].map((n) => fetch(`${at}/api/file?path=${encodeURIComponent(path.join(mpNE, n))}`, { method: 'DELETE' })));
      const emptyAfterDels = await until(() => mm._bare.get('mm-ne') === 'empty' && !mm._probing?.has('mm-ne'), 4000);
      check('§16 three strays DELETED at once (a multi-select delete): a probe asked while one runs is run again once it ended — the folder reads EMPTY at last, shadowed again', ne2 === 'not-empty' && gateOf(dels.every((d) => d.status === 200)) && gateOf(emptyAfterDels) && sh(mpNE)?.id === 'mm-ne', JSON.stringify({ ne2, d: dels.map((d) => d.status), emptyAfterDels }));
      fs.writeFileSync(path.join(mpNE, 's6.txt'), 's6'); await mm._probeBare(recOf('mm-ne'));
      const ne3 = mm._bare.get('mm-ne');
      const mv = await post('/api/file/move', { src: path.join(mpNE, 's6.txt'), dest: path.join(tmp, 'fcc7-moved-s6.txt'), progress: 1 });
      const moved = await until(() => !fs.existsSync(path.join(mpNE, 's6.txt')), 3000);
      const emptyAfterMove = await until(() => mm._bare.get('mm-ne') === 'empty', 3000);
      check('§16 a stray MOVED OUT with progress (cut / paste: the reply comes BEFORE the move) is probed again once the move ENDED: empty', ne3 === 'not-empty' && mv.status === 200 && !!mv.body?.opId && gateOf(moved) && verdictOf(emptyAfterMove), JSON.stringify({ ne3, mv: mv.status, moved, emptyAfterMove }));
      const mk = await post('/api/MKDIR/', { path: path.join(mpOwn, 'made') });
      check('§16 a write route as express matches it (any case, a trailing slash) is a writer: /api/MKDIR/ refused, nothing made', mk.status === 503 && !fs.existsSync(path.join(mpOwn, 'made')), JSON.stringify(mk).slice(0, 160));
      const keep = app.locals.mounts; delete app.locals.mounts;
      const bare = await ls(mpMac);
      app.locals.mounts = keep;
      check('§16 its own pass: refused with no storage manager registered too', bare.status === 503 && bare.body.code === 'machine_offline', JSON.stringify(bare));
      live('mm-mac', mpMac);
      const up = await ls(mpMac);
      check('§16 a mounted pull lists as before (200, its items)', up.status === 200 && verdictOf(Array.isArray(up.body.items)), JSON.stringify(up).slice(0, 200));
      mm._live.delete('mm-mac');
      MMx.registerPullDoor(null);
      const ctl = await ls(mpMac), ctlW = await write(path.join(mpMac, 'stranded.txt'));
      const landed = fs.existsSync(path.join(mpMac, 'stranded.txt')); try { fs.rmSync(path.join(mpMac, 'stranded.txt'), { force: true }); } catch { }
      check('CONTROL §16 (no pull door: the release) — the plant first (the record offline, not mounted), then the folder lists EMPTY, a 200, and a write LANDS in the bare folder (red)', sh(mpMac)?.offline === true && ctl.status === 200 && gateOf(Array.isArray(ctl.body.items)) && ctl.body.items.length === 0 && ctlW.status === 200 && verdictOf(landed), JSON.stringify({ ctl, ctlW: ctlW.status, landed }).slice(0, 240));
    } finally { MMx.registerPullDoor(null); await new Promise((res) => server.close(res)); }
    // the words: the client words both codes (en = the server's sentence), zh / ja rows exist; the hub registers the door
    const R = (rel) => fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', rel), 'utf8');
    const ops = R('src/lib/file-explorer-ops.js'), zh = R('src/lib/i18n-zh.js'), ja = R('src/lib/i18n-ja.js'), fj = R('src/routes/files.js'), dp = R('src/server/dial-pairing.js'), tgw = R('src/server/task-groups-wiring.js');
    const mmSrc = R('src/machine-mounts.js');   // the words live with the door (the files route and WebDAV say them)
    const enOf = (code) => (mmSrc.match(new RegExp(`error: \`([^\`]*)\`, code: '${code}'`)) || [])[1];
    const keyOf = (code) => (ops.match(new RegExp(`d\\.code === '${code}'\\) return t\\('([^']*)'`)) || [])[1];
    const same = (code) => { const e = enOf(code), k = keyOf(code); return !!e && !!k && e.replace(/\$\{s\.machine\}/g, '{machine}') === k && zh.includes(JSON.stringify(k) + ':') && ja.includes(JSON.stringify(k) + ':'); };
    check('§16 the client words machine_offline and machine_folder_down in the reader\'s language: its key = the server\'s English, a zh and a ja row each', gateOf(same('machine_offline')) && verdictOf(same('machine_folder_down')));
    const iCloud = fj.indexOf('const shadow = mounts.shadowedBy?.(p);'), iPull = fj.search(/const pull = await require\('\.\.\/machine-mounts\.js'\)\.pullShadowOfReal\(p, \{ writer \}\);\n\s+if \(pull\) return res\.status\(503\)\.json\(pullShadowBody\(pull\)\);/);
    check('§16 wiring: the hub\'s dial wiring registers the ONE pull manager (server.js takes no line); the files router asks it in its own pass, after the cloud storages\' refusal', gateOf(/require\('\.\.\/machine-mounts\.js'\)\.registerPullDoor\(getMachineMounts\);/.test(dp)) && iCloud > 0 && iPull > iCloud && fj.split('pullShadowOfReal(').length === 3 && gateOf(/pullShadowOfReal\(destRoot, \{ writer: true \}\)/.test(fj)) && verdictOf(/onPullLive\(\(\) => \{ try \{ tasks\.syncAllContextMd\(\); \} catch \{ \} \}\)/.test(tgw)));
  }
  console.log('§17 B-844b / B-6c4f: one folder holds one machine\'s folder — the same folder or a nested one refused by name; existing pairs held');
  {
    const MMx = require('../src/machine-mounts.js'), DMX = require('../src/device-mount.js');
    const base = path.join(tmp, 'pairs-mp'), mpA = path.join(base, 'a'), mpLink = path.join(base, 'a-link'), mpInner = path.join(base, 'a', 'inner'), mpOuter = path.join(base, 'outer'), mpB = path.join(base, 'outer', 'b'), mpFree = path.join(base, 'free');
    const mpG = path.join(base, 'g'), mpH = path.join(base, 'h'), mpK = path.join(base, 'k'), mpL = path.join(base, 'l');   // r4/r5: the boot gate's, the re-ranks' and the ssh takeover's folders
    for (const d of [mpA, mpB, mpFree, mpG, mpH, mpK, mpL]) fs.mkdirSync(d, { recursive: true });
    fs.symlinkSync(mpA, mpLink);   // the same folder by another name
    const HOSTS = { h1: { id: 'h1', name: 'Studio Mac', transport: 'dial', deviceId: 'd1' }, h2: { id: 'h2', name: 'Laptop', transport: 'dial', deviceId: 'd2' } };
    const online = { d1: true, d2: true };
    const hosts = { get: (id) => { if (!HOSTS[id]) throw new Error('host not found'); return HOSTS[id]; }, dialOnline: (d) => !!online[d], deviceBounded: async () => ({}), findByDeviceId: () => null };
    const said17 = [];
    const mkMM = (name, mounts) => { const dd = path.join(tmp, name); fs.mkdirSync(dd, { recursive: true }); fs.writeFileSync(path.join(dd, 'machine-mounts.json'), JSON.stringify({ mounts })); const m = new MMx.MachineMounts({ dataDir: dd, hosts, rcloneBin: () => 'rclone', broadcast: () => { }, log: (l) => said17.push(String(l)) }); clearInterval(m._sweep); return m; };
    const realRel = DMX.releaseStale, realMount = DMX.deviceFolderMount;
    const released = [], mountsAsked = [];
    DMX.releaseStale = async (mpX) => { released.push(mpX); return []; };
    DMX.deviceFolderMount = async (o) => { mountsAsked.push(o); return { mountpoint: o.mountpoint, devicePort: 1, bridgePort: 1, teardown: async () => { }, released: () => null }; };
    const PATH1 = process.env.PATH;
    try {
      // ── refused at mountPull, by name ──
      const mm = mkMM('pairs-a', [
        { id: 'mm-a', dir: 'pull', hostId: 'h1', remotePath: '/Users/a', mountpoint: mpA, createdAt: 1 },
        { id: 'mm-b', dir: 'pull', hostId: 'h1', remotePath: '/Users/b', mountpoint: mpB, createdAt: 2 },
      ]);
      const ask = async (host, rp, mpX) => { try { const r = await mm.mountPull(host, { remotePath: rp, mountpoint: mpX }); return { ok: r.id }; } catch (e) { return { code: e.code, params: e.params || {}, msg: e.message }; } };
      const n0 = mm._state.mounts.length;
      const same = await ask('h2', '/x', mpA), alias = await ask('h2', '/x', mpLink), inside = await ask('h2', '/y', mpInner), over = await ask('h2', '/z', mpOuter);
      check('§17 a SECOND record on a folder another pull holds is refused by name — «… already the mount point of “Studio Mac”’s /Users/a»', same.code === 'mount_point_in_use' && same.params.machine === 'Studio Mac' && same.params.remotePath === '/Users/a' && same.params.held === false && verdictOf(/already the mount point of “Studio Mac”’s \/Users\/a — pick another folder/.test(same.msg || '')), JSON.stringify(same));
      check('§17 …the same folder by ANOTHER NAME (a symlink) is the same folder: its REAL path is compared', alias.code === 'mount_point_in_use' && alias.params.remotePath === '/Users/a', JSON.stringify(alias));
      check('§17 a folder NESTED in either direction is refused by name — inside another pull\'s mount point, or holding one', inside.code === 'mount_point_nested' && inside.params.kind === 'inside' && inside.params.mountpoint === mpA && over.code === 'mount_point_nested' && over.params.kind === 'over' && over.params.mountpoint === mpB && verdictOf(/unmounting one would take the other with it/.test(over.msg || '')), JSON.stringify({ inside, over }));
      check('§17 …nothing was recorded, mounted or released for a refused ask', mm._state.mounts.length === n0 && released.length === 0 && mountsAsked.length === 0, JSON.stringify({ n: mm._state.mounts.length, released, asked: mountsAsked.length }));
      const again = await ask('h1', '/Users/a', mpA), slash = await ask('h1', '/Users/a', mpA + '/'), fresh = await ask('h2', '/f', mpFree);
      check('§17 the SAME pull asked again is that record (no refusal) — r4 (read 3 #5): by another spelling of its folder too; a folder of its own is mounted', again.ok === 'mm-a' && slash.ok === 'mm-a' && !!fresh.ok && verdictOf(mountsAsked.some((o) => o.mountpoint === mpFree)), JSON.stringify({ again, slash, fresh }));
      // ── EXISTING pairs (records from before): the younger HELD, by the elder's name; boot and removal ──
      const mm2 = mkMM('pairs-b', [
        { id: 'mm-old', dir: 'pull', hostId: 'h1', remotePath: '/Users/a', mountpoint: mpA, createdAt: 1 },
        { id: 'mm-young', dir: 'pull', hostId: 'h2', remotePath: '/x', mountpoint: mpLink, createdAt: 5 },
        { id: 'mm-nest', dir: 'pull', hostId: 'h2', remotePath: '/y', mountpoint: mpInner, createdAt: 6 },
        { id: 'mm-free2', dir: 'pull', hostId: 'h2', remotePath: '/f', mountpoint: mpFree, createdAt: 7 },
      ]);
      const held = await mm2._recheckPairs();
      const rowOf = (id) => mm2.list().find((r) => r.id === id) || {};
      const ry = rowOf('mm-young'), rn = rowOf('mm-nest');
      check('§17 EXISTING records on one folder (a symlink too) or nested: the YOUNGER held — its row says why by the elder\'s name, as a code the page words; the elder and a free one are not', gateOf(held.has('mm-young')) && gateOf(held.has('mm-nest')) && !held.has('mm-old') && !held.has('mm-free2') && ry.errorCode === 'mount_point_in_use' && ry.errorParams?.machine === 'Studio Mac' && rn.errorCode === 'mount_point_nested' && rn.errorParams?.kind === 'inside' && verdictOf(/held — /.test(said17.join('\n'))), JSON.stringify({ held: [...held.keys()], ry, rn }));
      // ── B-02f6: a WRITE under a HELD outer folder (its inner pair holds the place, live inside it) is refused with the hold ──
      {
        const outerLink = path.join(base, 'outer-link'); fs.symlinkSync(mpOuter, outerLink);   // the held folder written through a link
        const SCENES = {
          over: [{ id: 'mm-hin', dir: 'pull', hostId: 'h1', remotePath: '/Users/in', mountpoint: mpB, createdAt: 1 }, { id: 'mm-hout', dir: 'pull', hostId: 'h2', remotePath: '/out', mountpoint: mpOuter, createdAt: 5 }],
          overLink: [{ id: 'mm-hin', dir: 'pull', hostId: 'h1', remotePath: '/Users/in', mountpoint: mpB, createdAt: 1 }, { id: 'mm-hout', dir: 'pull', hostId: 'h2', remotePath: '/out', mountpoint: outerLink, createdAt: 5 }],
          sameLink: [{ id: 'mm-hin', dir: 'pull', hostId: 'h1', remotePath: '/Users/a', mountpoint: mpA, createdAt: 1 }, { id: 'mm-hout', dir: 'pull', hostId: 'h2', remotePath: '/x', mountpoint: mpLink, createdAt: 5 }],
        };
        // the REAL pair check (`_recheckPairs`: real paths by a child) with the elder live — the younger is held
        const scene = async (MM, name, recs) => {
          const dd = path.join(tmp, name); fs.mkdirSync(dd, { recursive: true }); fs.writeFileSync(path.join(dd, 'machine-mounts.json'), JSON.stringify({ mounts: recs }));
          const m = new MM({ dataDir: dd, hosts, rcloneBin: () => 'rclone', broadcast: () => { }, log: (l) => said17.push(String(l)) }); clearInterval(m._sweep);
          m._live.set('mm-hin', { teardown: async () => { }, mountpoint: recs[0].mountpoint, at: Date.now() });
          const held = await m._recheckPairs();
          const w = (q) => m.shadowedBy(q, { writer: true });
          return { m, held, w, r: (q) => m.shadowedBy(q) };
        };
        const g = await scene(MMx.MachineMounts, 'pairs-02f6', SCENES.over), hw = g.held.get('mm-hout');
        const wOut = g.w(path.join(mpOuter, 'new.txt')), wSelf = g.w(mpOuter), rOut = g.r(path.join(mpOuter, 'new.txt')), wIn = g.w(path.join(mpB, 'x.txt'));
        const body3 = wOut ? MMx.pullShadowBody(wOut) : null;
        MMx.registerPullDoor(() => g.m); let viaDoor = null; try { viaDoor = MMx.pullShadowOf(path.join(mpOuter, 'sub', 'f.txt'), { writer: true }); } finally { MMx.registerPullDoor(null); }
        console.log('    B-02f6 over, the facts judged: ' + JSON.stringify({ held: hw, wOut, wSelf: wSelf && wSelf.id, rOut, wIn, body: body3, viaDoor: viaDoor && viaDoor.id }));
        check('§17 B-02f6: a WRITE under a HELD outer folder (its inner pair live inside it) — and at that folder itself — is refused with the HOLD: code machine_folder_held over the held row\'s own code and words, the machine and the row\'s folder named; the files route and WebDAV ask the same door',
          !!hw && hw.kind === 'over' && wOut?.id === 'mm-hout' && wOut.pairHeld === true && wSelf?.id === 'mm-hout' && viaDoor?.id === 'mm-hout'
            && body3?.code === 'machine_folder_held' && body3.params.machine === 'Laptop' && body3.params.mountpoint === mpOuter && body3.params.heldCode === hw.code && body3.params.heldCode === 'mount_point_nested'
            && body3.error === `“Laptop”’s folder ${mpOuter} is not mounted — ${hw.words}`);
        check('§17 B-02f6: a READER under the held folder lists the bare folder (nothing refused); under the inner pair\'s LIVE mount point the machine answers (nothing refused)', rOut === null && wIn === null);
        // the held folder written THROUGH A LINK (its read's MUST): a path by the link that reaches the LIVE pull is the machine's
        const gl = await scene(MMx.MachineMounts, 'pairs-02f6-link', SCENES.overLink), gs = await scene(MMx.MachineMounts, 'pairs-02f6-same', SCENES.sameLink);
        const lIn = gl.w(path.join(outerLink, 'b', 'x.txt')), lOut = gl.w(path.join(outerLink, 'new.txt')), sIn = gs.w(path.join(mpLink, 'x.txt')), sRead = gs.r(path.join(mpLink, 'x.txt'));
        console.log('    B-02f6 links, the facts judged: ' + JSON.stringify({ overHeld: gl.held.get('mm-hout') && gl.held.get('mm-hout').kind, lIn, lOut: lOut && [lOut.id, lOut.mountpoint], sameHeld: gs.held.get('mm-hout') && gs.held.get('mm-hout').kind, sIn, sRead }));
        check('§17 B-02f6 (its read): the held folder written THROUGH A LINK — a write by the link INTO the live inner pull is the machine\'s (nothing refused), one beside it is refused under the row\'s folder as written; on ONE folder by a link (the holder live) nothing is refused, read or write',
          gl.held.get('mm-hout')?.kind === 'over' && lIn === null && lOut?.id === 'mm-hout' && lOut.mountpoint === outerLink && gs.held.get('mm-hout')?.kind === 'same' && sIn === null && sRead === null);
        // the page words it: its key = the server's English (the machine, the folder, the hold's own words by code), a zh and a ja row
        const R3 = (rel) => fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', rel), 'utf8');
        const ops3 = R3('src/lib/file-explorer-ops.js'), en3 = (R3('src/machine-mounts.js').match(/error: `([^`]*)`, code: 'machine_folder_held'/) || [])[1], key3 = (ops3.match(/d\.code === 'machine_folder_held'\) return t\('([^']*)'/) || [])[1];
        const zh3 = R3('src/lib/i18n-zh.js'), ja3 = R3('src/lib/i18n-ja.js'), fb3 = 'another pull row holds this folder — remove one of the two rows';
        check('§17 B-02f6: the client words machine_folder_held — its key = the server\'s English, the hold by its own code (mountWords), a zh and a ja row for the key and its fallback',
          !!en3 && !!key3 && en3.replace('${s.machine}', '{machine}').replace('${s.mountpoint}', '{mountpoint}').replace('${why}', '{why}') === key3 && gateOf(/why: mountWords\(p\.heldCode, p\.heldParams \|\| \{\}, \{ t, lang: resolveLang\(\) \}\)/.test(ops3))
            && verdictOf([key3, fb3].every((k) => zh3.includes(JSON.stringify(k) + ':') && ja3.includes(JSON.stringify(k) + ':'))), { en3, key3 });
        // RED CONTROLS, each cut alone in a copy: (1) the release's skip planted back (a pair-held record answers nothing) — the write
        // under the held folder is NOT refused; (2) the live-pull check after the pick cut (with it the link mapping) — a write by the link into the live pull is refused
        const src3 = R3('src/machine-mounts.js'), A3 = "      if (!h || (pair && !writer) || (!pair && !writer && this._bare?.get(m.id) !== 'empty')) continue;";
        const L3 = "      if (this._state.mounts.some((o) => o.dir === 'pull' && this._live.has(o.id) && this._pullFolders(o).some((x) => x !== '/' && (asReal === x || asReal.startsWith(x + '/'))))) return null;";
        const copy3 = (edited) => { const Mod = require('module'), file3 = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src', 'machine-mounts.js'), mo3 = new Mod(file3, null); mo3.filename = file3; mo3.paths = Mod._nodeModulePaths(path.dirname(file3)); mo3._compile(edited, file3); return mo3.exports.MachineMounts; };
        if (src3.split(A3).length !== 2 || src3.split(L3).length !== 2) check('§17 B-02f6 CONTROL: an anchor of shadowedBy moved — update this suite', false);
        else {
          const c3 = await scene(copy3(src3.replace(A3, "      if (!h || pair || (!writer && this._bare?.get(m.id) !== 'empty')) continue;")), 'pairs-02f6-ctl', SCENES.over);
          const c3w = c3.w(path.join(mpOuter, 'new.txt'));
          // (the remainder's tie answers a held record on ONE folder as its holder before the mapping — the mapping's own control is the
          // NESTED pair written through a link)
          const c4 = await scene(copy3(src3.replace(L3, '')), 'pairs-02f6-ctl2', SCENES.overLink);
          const c4w = c4.w(path.join(outerLink, 'b', 'x.txt'));
          console.log('    B-02f6 controls, the facts judged: ' + JSON.stringify({ skipBack: { held: c3.held.get('mm-hout') && c3.held.get('mm-hout').kind, w: c3w }, mapCut: { held: c4.held.get('mm-hout') && c4.held.get('mm-hout').kind, w: c4w && c4w.id } }));
          check('CONTROL §17 B-02f6 (the release\'s skip): the outer record is held the same, and the write under its folder is answered by nothing — it would land in the bare folder (red)', c3.held.get('mm-hout')?.kind === 'over' && c3w === null);
          check('CONTROL §17 B-02f6 (the live-pull check after the pick cut, the link mapping with it): a write by the held OUTER record\'s link into the LIVE inner pull is refused as held (red)', c4.held.get('mm-hout')?.kind === 'over' && c4w?.id === 'mm-hout');
        }
        // ── B-02f6 REMAINDER (主开发 r1160 / r1178) ──
        // (1) THE OUTER WHOSE REAL FOLDER NEVER RESOLVED: the outer written through a LINK, the pair check's child never answering for
        // it (a stand-in), the inner LIVE — the outer is not held (compared as written). A write by the link INTO the live inner waits
        // for the proof (the record's real folder — a stand-in, counted) and goes through; one beside it is refused as before; a
        // reader never asks. RED: the release's door (the sync pullShadowOf) refuses that write machine_folder_down
        const outerLink2 = path.join(base, 'outer-link-2'); if (!fs.existsSync(outerLink2)) fs.symlinkSync(mpOuter, outerLink2);   // the outer's folder written by ANOTHER link (an edit)
        const realM = (q) => { let probe = path.resolve(q), rest = ''; for (;;) { try { return fs.realpathSync(probe) + rest; } catch { const up = path.dirname(probe); if (up === probe) return path.resolve(q); rest = '/' + path.basename(probe) + rest; probe = up; } } };
        const sceneU = async (MM, name, recs, { proof = (q) => Promise.resolve(realM(q)) } = {}) => {
          const dd = path.join(tmp, name); fs.mkdirSync(dd, { recursive: true }); fs.writeFileSync(path.join(dd, 'machine-mounts.json'), JSON.stringify({ mounts: recs }));
          const m = new MM({ dataDir: dd, hosts, rcloneBin: () => 'rclone', broadcast: () => { }, log: (l) => said17.push(String(l)) }); clearInterval(m._sweep);
          m._live.set('mm-hin', { teardown: async () => { }, mountpoint: recs[0].mountpoint, at: Date.now() });
          m._realpath = (q, o = {}) => { try { o.onExit && o.onExit(); } catch { } return Promise.resolve(path.resolve(q) === outerLink || path.resolve(q) === outerLink2 ? null : realM(q)); };   // the pair check's child: no answer for the outer (either link)
          const asked = []; m._proofRealpath = (q, o) => { asked.push(q); return proof(q, o); };
          const held = await m._recheckPairs();
          return { m, held, asked };
        };
        const u = await sceneU(MMx.MachineMounts, 'pairs-02f6r-unres', SCENES.overLink);
        const inLink = path.join(outerLink, 'b', 'x.txt'), beside = path.join(outerLink, 'new.txt');
        const syncIn = u.m.shadowedBy(inLink, { writer: true });
        const pIn = await u.m.shadowedByReal(inLink, { writer: true }), pIn2 = await u.m.shadowedByReal(path.join(outerLink, 'b', 'y.txt'), { writer: true }), pBeside = await u.m.shadowedByReal(beside, { writer: true });
        const pRead = await u.m.shadowedByReal(inLink), pLiveOwn = await u.m.shadowedByReal(path.join(mpB, 'z.txt'), { writer: true });
        MMx.registerPullDoor(() => u.m); let doorIn = 'unset', doorSync = null; try { doorIn = await MMx.pullShadowOfReal(path.join(outerLink, 'b', 'sub', 'f.txt'), { writer: true }); doorSync = MMx.pullShadowOf(path.join(outerLink, 'b', 'sub', 'f.txt'), { writer: true }); } finally { MMx.registerPullDoor(null); }
        console.log('    B-02f6 remainder (1), the facts judged: ' + JSON.stringify({ held: [...u.held.keys()], outerReal: u.m._realMp.get('mm-hout') || null, syncIn: syncIn && [syncIn.id, MMx.pullShadowBody(syncIn).code], pIn, pIn2, pBeside: pBeside && pBeside.id, pRead, pLiveOwn, doorIn, doorSync: doorSync && [doorSync.id, MMx.pullShadowBody(doorSync).code], proofAsked: u.asked.length }));
        check('§17 B-02f6 remainder (1): the outer written through a LINK whose real folder never resolved is not held — a write by the link INTO the live inner pull goes through by the proof (the record\'s real folder, asked ONCE: the next writes keep its answer), one beside it is refused as before; a reader and a write under the live pull by its own spelling never ask; the files route and WebDAV ask the same door',
          !u.held.has('mm-hout') && !u.m._realMp.has('mm-hout') && syncIn?.id === 'mm-hout' && pIn === null && pIn2 === null && pBeside?.id === 'mm-hout' && MMx.pullShadowBody(pBeside).code === 'machine_folder_down' && pRead === null && pLiveOwn === null && doorIn === null && u.asked.length === 1);
        check('RED CONTROL §17 B-02f6 remainder (1): the release\'s door (the sync pullShadowOf) refuses that same write machine_folder_down', doorSync?.id === 'mm-hout' && MMx.pullShadowBody(doorSync).code === 'machine_folder_down', doorSync);
        // r2684 (B-02f6, its first gap — 主开发's ruling): a LINK INSIDE a BARE outer folder (the record's real folder is itself: no link of
        // its own) that points into a LIVE pull: a write through it is that machine's, nothing refused. One more look: the folder the write
        // lands in, by its real path (the pair check's road, realpathChild — a stand-in here, counted), asked only below the record's folder,
        // kept per folder; a write in a real subfolder or at the record's own folder is refused as before; a reader never asks. RED: the
        // mapping as it was (no folder look, in a copy) refuses that write machine_folder_down. MEASURE (printed): the verdict by the real road
        const mpBare = path.join(base, 'bare-out'), mpLiveIn = path.join(base, 'live-in'), lnkG1 = path.join(mpBare, 'lnk'), plainG1 = path.join(mpBare, 'plain');
        const mpStop = path.join(base, 'stopped-in'), mpBare2 = path.join(base, 'bare-two'), lnkStop = path.join(mpBare, 'lnk-stopped'), lnkBare2 = path.join(mpBare, 'lnk-bare2');
        for (const d of [plainG1, mpLiveIn, mpStop, mpBare2]) fs.mkdirSync(d, { recursive: true });
        for (const [l, to] of [[lnkG1, mpLiveIn], [lnkStop, mpStop], [lnkBare2, mpBare2]]) if (!fs.existsSync(l)) fs.symlinkSync(to, l);
        const RECS_G1 = [{ id: 'mm-hin', dir: 'pull', hostId: 'h1', remotePath: '/Users/in', mountpoint: mpLiveIn, createdAt: 1 }, { id: 'mm-hout', dir: 'pull', hostId: 'h2', remotePath: '/out', mountpoint: mpBare, createdAt: 5 }, { id: 'mm-hstop', dir: 'pull', hostId: 'h1', remotePath: '/Users/stop', mountpoint: mpStop, createdAt: 7 }];
        const dirStub = (m, asked, answer = (q) => Promise.resolve(realM(q))) => { m._proofDirRealpath = (q, o) => { asked.push(q); return answer(q, o); }; };
        const g1 = await sceneU(MMx.MachineMounts, 'pairs-02f6-gap1', RECS_G1); const gAsked = []; dirStub(g1.m, gAsked);
        const wLnk = path.join(lnkG1, 'f.txt'), wLnk2 = path.join(lnkG1, 'g.txt'), wPlain = path.join(plainG1, 'x.txt'), wTop = path.join(mpBare, 'top.txt');
        const gSync = g1.m.shadowedBy(wLnk, { writer: true });
        const gIn = await g1.m.shadowedByReal(wLnk, { writer: true }), gIn2 = await g1.m.shadowedByReal(wLnk2, { writer: true }), gPlain = await g1.m.shadowedByReal(wPlain, { writer: true });
        const gTop = await g1.m.shadowedByReal(wTop, { writer: true }), gRead = await g1.m.shadowedByReal(wLnk);
        // r2856 (3): a link into a STOPPED pull, and into a SECOND bare folder: each refused (the real path judged live or not at every write)
        const gStop = await g1.m.shadowedByReal(path.join(lnkStop, 's.txt'), { writer: true }), gBare2 = await g1.m.shadowedByReal(path.join(lnkBare2, 'b.txt'), { writer: true });
        const nLnk = gAsked.filter((q) => q === lnkG1).length, nPlain = gAsked.filter((q) => q === plainG1).length;
        const LOOK_G1 = "    if (inner.real && liveAt(inner.real + '/' + path.basename(rp))) return null;\n";
        let gRed = 'no copy: the look moved';
        if (src3.split(LOOK_G1).length === 2) { const gr = await sceneU(copy3(src3.replace(LOOK_G1, '')), 'pairs-02f6-gap1-ctl', RECS_G1); dirStub(gr.m, []); gRed = await gr.m.shadowedByReal(wLnk, { writer: true }); }
        const gm = await sceneU(MMx.MachineMounts, 'pairs-02f6-gap1-real', RECS_G1), t0g = performance.now(), gViaReal = await gm.m.shadowedByReal(wLnk, { writer: true }), gMs = Math.round(performance.now() - t0g);
        console.log(`    [measure] B-02f6's first gap, the one more look: the verdict by the real road (THE STARTER's realpath of the folder written in) ${gMs} ms here (one look for both writes in that folder; asked only for a write refused under a pull that is not live, in a folder below its record's) · ` + JSON.stringify({ learned: g1.m._realMp.get('mm-hout') || null, asked: gAsked, sync: gSync && gSync.id, gIn, gIn2, gPlain: gPlain && MMx.pullShadowBody(gPlain).code, gTop: gTop && gTop.id, gRead, gStop: gStop && MMx.pullShadowBody(gStop).code, gBare2: gBare2 && MMx.pullShadowBody(gBare2).code, viaReal: gViaReal }));
        check('§17 r2684 (B-02f6, its first gap): a LINK INSIDE a bare outer folder into a LIVE pull — a write into a folder under the link goes through (the folder written in, by its real path: one more look, asked ONCE for both writes there; the real road too); a write in a real subfolder or at the outer folder itself is refused as before (machine_folder_down); a reader never asks',
          gSync?.id === 'mm-hout' && gIn === null && gIn2 === null && gPlain?.id === 'mm-hout' && MMx.pullShadowBody(gPlain).code === 'machine_folder_down' && gTop?.id === 'mm-hout' && gRead === null && gViaReal === null
          && nLnk === 1 && nPlain === 1, { gAsked, gViaReal });
        check('§17 r2856 (3): a link inside the bare outer folder into a STOPPED pull, and one into a SECOND bare folder: each write refused machine_folder_down (its real path is judged live or not at every write)',
          gStop?.id === 'mm-hout' && MMx.pullShadowBody(gStop).code === 'machine_folder_down' && gBare2?.id === 'mm-hout' && MMx.pullShadowBody(gBare2).code === 'machine_folder_down', { gStop, gBare2 });
        check('RED CONTROL §17 r2684 (B-02f6, its first gap): the mapping as it was (no folder look, in a copy) refuses that write machine_folder_down', !!gRed && typeof gRed === 'object' && gRed.id === 'mm-hout' && MMx.pullShadowBody(gRed).code === 'machine_folder_down', gRed);
        // r2856 (1) + (2): a folder look that does NOT answer in time — its child HELD (it may sleep on a pull that hangs): the write refused
        // with the «could not be checked» words (machine_folder_unchecked, heals by itself), kept its time, then ASKED AGAIN; the held
        // children counted with the looks in flight, so across folders at most PROOF_KIDS_MAX are out: a third folder is refused at once
        // (not asked) until a held child's end is seen
        const g2 = await sceneU(MMx.MachineMounts, 'pairs-02f6-gap1-slow', RECS_G1), sAsked = [], helds = [];
        dirStub(g2.m, sAsked, (q, o) => { const h = { pid: 4242 + helds.length, ended: false, gone() { return this.ended; } }; helds.push(h); o.onHeld(h); return Promise.resolve(null); });
        const fa = path.join(lnkG1, 'a', 'x.txt'), fb = path.join(lnkG1, 'b', 'x.txt'), fc = path.join(lnkG1, 'c', 'x.txt');
        const u1 = await g2.m.shadowedByReal(fa, { writer: true }), u1b = await g2.m.shadowedByReal(fa, { writer: true }), askedKept = sAsked.length;
        const u2 = await g2.m.shadowedByReal(fb, { writer: true }), heldN = g2.m._proofDirHeld.size;
        const u3 = await g2.m.shadowedByReal(fc, { writer: true }), askedBound = sAsked.length;
        helds[0].ended = true; const u3b = await g2.m.shadowedByReal(fc, { writer: true }), askedFreed = sAsked.length;
        g2.m._proofKeepMs = 0; helds.forEach((h) => { h.ended = true; }); const u1c = await g2.m.shadowedByReal(fa, { writer: true }), askedAgain = sAsked.filter((q) => q === path.dirname(fa)).length;
        console.log('    r2856 (1) + (2), the facts judged: ' + JSON.stringify({ u1: u1 && MMx.pullShadowBody(u1).code, askedKept, heldN, u3: u3 && MMx.pullShadowBody(u3).code, askedBound, askedFreed, askedAgain, max: MMx.PROOF_KIDS_MAX }));
        check('§17 r2856 (1): a folder look that did not answer in time refuses the write with the «could not be checked» words (machine_folder_unchecked — it heals by itself), kept its time (no second child for the same folder), then asked AGAIN once its time has passed',
          u1?.unchecked === true && MMx.pullShadowBody(u1).code === 'machine_folder_unchecked' && u1b?.unchecked === true && askedKept === 1 && u1c?.unchecked === true && askedAgain === 2, { u1, askedKept, askedAgain });
        check('§17 r2856 (2): a child that did not answer is HELD and counted with the looks out — ' + MMx.PROOF_KIDS_MAX + ' held, a third folder is refused at once and not asked; a held child seen ended frees its place (the third folder asked then)',
          heldN === 2 && MMx.PROOF_KIDS_MAX === 2 && u2?.unchecked === true && askedBound === 2 && u3?.id === 'mm-hout' && !u3.unchecked && askedFreed === 3 && u3b?.unchecked === true, { heldN, askedBound, askedFreed, u3, u3b });
        // (1)'s BOUNDS (r1178 (a)): a child that did not answer is kept as REFUSED for the stated time (no second child); the time past,
        // it is asked again; at most PROOF_KIDS_MAX children in flight (a third record's ask meanwhile is refused at once, nothing kept;
        // a second ask for a record in flight shares its child). (b): the proof's child is THE STARTER's (src/server/child-starter.js) —
        // one real run through it here
        const un = await sceneU(MMx.MachineMounts, 'pairs-02f6r-noans', SCENES.overLink, { proof: () => Promise.resolve(null) });
        const n1 = await un.m.shadowedByReal(inLink, { writer: true }), n2 = await un.m.shadowedByReal(inLink, { writer: true }), nAsked = un.asked.length;
        un.m._proofKeepMs = 0; const n3 = await un.m.shadowedByReal(inLink, { writer: true }), nAgain = un.asked.length;
        const hangs = [], hg = await sceneU(MMx.MachineMounts, 'pairs-02f6r-fly', SCENES.overLink, { proof: () => new Promise((r) => hangs.push(r)) });
        const f1 = hg.m._proofReal({ id: 'p1', mountpoint: '/x1' }), f1b = hg.m._proofReal({ id: 'p1', mountpoint: '/x1' }), f2 = hg.m._proofReal({ id: 'p2', mountpoint: '/x2' });
        const f3 = await hg.m._proofReal({ id: 'p3', mountpoint: '/x3' }), inFly = hg.m._proofFly.size, flyAsked = hg.asked.length;
        hangs.forEach((r) => r(null)); await Promise.all([f1, f1b, f2]);
        const viaStarter = await MMx.starterRealpath(outerLink);
        // 主开发 r1214 — THE SHAPE: a proof whose child did NOT answer inside its bound (timed out, or the starter's «unknown») is NEVER
        // asked again for that record as it stands (refused as the release refused); a slow answer holds no slot. «Never again» ENDS
        // where the truth can change: the record EDITED, ADDED AGAIN, REMOVED — and the pair check's own child learning the real folder
        const slw = await sceneU(MMx.MachineMounts, 'pairs-02f6r-slow', SCENES.overLink, { proof: () => Promise.resolve({ real: null, slow: true }) });
        const sw1 = await slw.m.shadowedByReal(inLink, { writer: true }), sa1 = slw.asked.length, sNever = slw.m._proofNever.has('mm-hout');
        slw.m._proofKeepMs = 0; const sw2 = await slw.m.shadowedByReal(inLink, { writer: true }), sa2 = slw.asked.length, sFly = slw.m._proofFly.size;
        const recH = slw.m._state.mounts.find((x) => x.id === 'mm-hout'); recH.mountpoint = outerLink2; const inLink2 = path.join(outerLink2, 'b', 'x.txt');
        const sw3 = await slw.m.shadowedByReal(inLink2, { writer: true }), sa3 = slw.asked.length;   // END: its FOLDER edited — asked once more
        await slw.m.mountPull('h2', { remotePath: '/out', mountpoint: outerLink2 }).catch(() => null);   // an Add that finds the SAME unchanged record (its mount refused «could not be checked»)
        const sAddKept = slw.m._proofNever.has('mm-hout'), sw4 = await slw.m.shadowedByReal(inLink2, { writer: true }), sa4 = slw.asked.length;   // NOT an end: nothing changed (each press would double a wedged child)
        await slw.m.unmount('mm-hout').catch(() => null); const sRmCleared = !slw.m._proofNever.has('mm-hout') && !slw.m._proofKept.has('mm-hout');   // END: removed
        // END: the pair check's OWN child learns the real folder — the release's mapping answers, no proof child
        const lrn = await sceneU(MMx.MachineMounts, 'pairs-02f6r-learn', SCENES.overLink, { proof: () => Promise.resolve({ real: null, slow: true }) });
        const lw1 = await lrn.m.shadowedByReal(inLink, { writer: true });
        lrn.m._realpath = (q, o = {}) => { try { o.onExit && o.onExit(); } catch { } return Promise.resolve(realM(q)); };   // the pair check's child answers now
        const lHeld = await lrn.m._recheckPairs(), lSync = lrn.m.shadowedBy(inLink, { writer: true }), lw2 = await lrn.m.shadowedByReal(inLink, { writer: true }), lAsked = lrn.asked.length;
        const kn = await sceneU(MMx.MachineMounts, 'pairs-02f6r-known', SCENES.overLink, { proof: () => Promise.resolve({ real: null, slow: true }) });
        kn.m._realMp.set('mm-hout', realM(outerLink));   // learned, the pairs not checked again yet
        const kw = await kn.m.shadowedByReal(inLink, { writer: true }), kwBeside = await kn.m.shadowedByReal(beside, { writer: true }), kAsked = kn.asked.length;
        // r1214 (2): THE STARTER's answers sorted with NO late exit and no end of the child waited for — the shape holds whether or not the
        // starter's own gap (a fault dropping a timed-out request) is cured (a stand-in starter answers each shape once)
        const CSx = require('../src/server/child-starter.js'), prevS = CSx.childStarter(), shapes = [];
        for (const r of [{ unknown: true }, { started: true, timedOut: true, code: null, stdout: '' }, { started: true, code: 0, stdout: '/the/real\n' }, { started: false, code: null, error: 'EAGAIN' }, 'throw']) {
          CSx.setChildStarter({ run: async () => { if (r === 'throw') throw new Error('the starter threw'); return r; }, stats: () => ({}) }); try { shapes.push(await MMx.starterRealpath('/asked')); } finally { CSx.setChildStarter(prevS); }
        }
        console.log('    B-02f6 remainder (1), the shape (r1214): ' + JSON.stringify({ slow: { w1: sw1 && sw1.id, asked1: sa1, never: sNever, w2: sw2 && sw2.id, asked2: sa2, fly: sFly }, edited: { w3: sw3 && sw3.id, asked3: sa3 }, sameAdd: { kept: sAddKept, w4: sw4 && sw4.id, asked4: sa4 }, removed: sRmCleared, learned: { w1: lw1 && lw1.id, held: lHeld.get('mm-hout') && lHeld.get('mm-hout').kind, sync: lSync, door: lw2, asked: lAsked }, known: { w: kw, beside: kwBeside && kwBeside.id, asked: kAsked }, starterShapes: shapes }));
        check('§17 B-02f6 remainder (1), r1214: a proof with NO answer inside its bound is never asked again for that record (the write refused, its words — r1274 — saying it heals by itself and what a person can do: machine_folder_unchecked; even past the kept time; it holds no slot) — «never again» ENDS where the truth can change: the record\'s FOLDER edited is asked once more, REMOVED clears it; an Add that finds the same unchanged record ends nothing (no second child on a wedged folder)',
          sw1?.id === 'mm-hout' && sw1.unchecked === true && MMx.pullShadowBody(sw1).code === 'machine_folder_unchecked' && sa1 === 1 && gateOf(sNever) && sw2?.id === 'mm-hout' && sa2 === 1 && sFly === 0 && sw3?.id === 'mm-hout' && sa3 === 2 && gateOf(sAddKept) && sw4?.id === 'mm-hout' && sa4 === 2 && verdictOf(sRmCleared));
        check('§17 B-02f6 remainder (1), r1214: once the pair check\'s OWN child learns the real folder, the release\'s mapping answers — the write by the link into the live inner goes through (the outer now held, the sync door too), no proof child; learned before the pairs are checked again, the door maps with it (one beside still refused)',
          lw1?.id === 'mm-hout' && lHeld.get('mm-hout')?.kind === 'over' && lSync === null && lw2 === null && lAsked === 1 && kw === null && kwBeside?.id === 'mm-hout' && kAsked === 0);
        check('§17 B-02f6 remainder (1), r1214 (2): the starter\'s answers sorted by the answer alone — ONLY a timeout is SLOW (never asked again); a starter fault\'s «unknown» (r1274: no folder was slow), a start that failed and a throw are answers kept their time; a real line is the real folder (kept their time: no child ran, no bound passed) — no late exit, no child\'s end waited for',
          shapes.length === 5 && !shapes[0].slow && shapes[0].real === null && gateOf(shapes[1].slow) && !shapes[1].real && !shapes[2].slow && shapes[2].real === '/the/real' && !shapes[3].slow && shapes[3].real === null && !shapes[4].slow && shapes[4].real === null);
        // r1274 (2): the refusal after «never again» SAYS it heals by itself and what a person can do — its key = the server's English, a zh
        // and a ja row; RED: the follow's line cut (in a copy) says the not-mounted words (press Remount — which cannot help here)
        const ops4 = R3('src/lib/file-explorer-ops.js'), zh4 = R3('src/lib/i18n-zh.js'), ja4 = R3('src/lib/i18n-ja.js'), mm4 = R3('src/machine-mounts.js');
        const en4 = (mm4.match(/error: `([^`]*)`, code: 'machine_folder_unchecked'/) || [])[1], key4 = (ops4.match(/d\.code === 'machine_folder_unchecked'\) return t\('([^']*)'/) || [])[1];
        const body4 = sw1 ? MMx.pullShadowBody(sw1) : null;
        const UNCH = "    if (!real && !s.offline && !s.hostsHeld && this._proofNever && this._proofNever.get(rec.id) === proofSig(rec)) return { ...s, unchecked: true };\n";
        let unchCut = null;
        if (src3.split(UNCH).length === 2) { const cu = await sceneU(copy3(src3.replace(UNCH, '')), 'pairs-02f6r-words-ctl', SCENES.overLink, { proof: () => Promise.resolve({ real: null, slow: true }) }); unchCut = await cu.m.shadowedByReal(inLink, { writer: true }); }
        console.log('    B-02f6 remainder\'s follow, the words: ' + JSON.stringify({ body: body4, key: key4, cut: unchCut && MMx.pullShadowBody(unchCut).code }));
        check('§17 B-02f6 remainder\'s follow (r1274): refused after «never again», the words say it heals by itself and what a person can do (remove the row and add it again) — the key = the server\'s English, a zh and a ja row; the machine and the folder named',
          !!en4 && !!key4 && en4.replace('${s.machine}', '{machine}').replace('${s.mountpoint}', '{mountpoint}') === key4 && gateOf(zh4.includes(JSON.stringify(key4) + ':')) && gateOf(ja4.includes(JSON.stringify(key4) + ':'))
            && body4?.code === 'machine_folder_unchecked' && body4.params.machine === 'Laptop' && body4.params.mountpoint === outerLink && gateOf(/checks it again by itself/.test(body4.error)) && verdictOf(/remove the row and add it again/.test(body4.error)));
        check('RED CONTROL §17 B-02f6 remainder\'s follow: the line cut (in a copy) — the refusal says the not-mounted words (Remount), which cannot help here', gateOf(unchCut) && MMx.pullShadowBody(unchCut).code === 'machine_folder_down', unchCut);
        // the third read's catches: (i) an answer that lands after its record was REMOVED is no one's (nothing kept, no «never»); (ii) the asks
        // in flight keyed by the record AS IT STANDS — an edit while asked gets its own child, the old answer dropped (latent today: no
        // edit road — a false pass the day one exists); (iii) no proof while the pair check's OWN child for the record is alive; (iv) the
        // kept time on the MONOTONIC clock (the wall clock stepped back an hour); (v) a THROW is an answer kept its time, not «never»
        const hold = [], hd = await sceneU(MMx.MachineMounts, 'pairs-02f6r-drop', SCENES.overLink, { proof: () => new Promise((r) => hold.push(r)) });
        const dAsk = hd.m.shadowedByReal(inLink, { writer: true }); await Promise.resolve(); await Promise.resolve();
        await hd.m.unmount('mm-hout').catch(() => null); hold.forEach((r) => r({ real: null, slow: true })); const dRes = await dAsk;
        const dropped = !hd.m._proofNever.has('mm-hout') && !hd.m._proofKept.has('mm-hout');
        const hold2 = [], hed = await sceneU(MMx.MachineMounts, 'pairs-02f6r-edit', SCENES.overLink, { proof: () => new Promise((r) => hold2.push(r)) });
        const eAsk1 = hed.m.shadowedByReal(inLink, { writer: true }); await Promise.resolve(); await Promise.resolve();
        hed.m._state.mounts.find((x) => x.id === 'mm-hout').mountpoint = outerLink2;
        const eAsk2 = hed.m.shadowedByReal(path.join(outerLink2, 'b', 'x.txt'), { writer: true }); await Promise.resolve(); await Promise.resolve();
        const eAsked = hed.asked.length; hold2[0] && hold2[0]({ real: realM(outerLink), slow: false }); hold2[1] && hold2[1]({ real: null, slow: true });
        const [e1, e2] = await Promise.all([eAsk1, eAsk2]);
        const rk = await sceneU(MMx.MachineMounts, 'pairs-02f6r-kids', SCENES.overLink); rk.m._realKids = new Set(['mm-hout']);
        const rkw = await rk.m.shadowedByReal(inLink, { writer: true }), rkAsked = rk.asked.length;
        const mo = await sceneU(MMx.MachineMounts, 'pairs-02f6r-mono', SCENES.overLink); const mo1 = await mo.m.shadowedByReal(inLink, { writer: true });
        const wall = Date.now; let mo2 = 'unset', moAsked = -1; try { Date.now = () => wall() - 3600e3; mo.m._proofKeepMs = 0; mo2 = await mo.m.shadowedByReal(inLink, { writer: true }); moAsked = mo.asked.length; } finally { Date.now = wall; }
        const th = await sceneU(MMx.MachineMounts, 'pairs-02f6r-throw', SCENES.overLink, { proof: () => Promise.reject(new Error('no child ran')) });
        const th1 = await th.m.shadowedByReal(inLink, { writer: true }), thNever = th.m._proofNever.has('mm-hout'); th.m._proofKeepMs = 0; const th2 = await th.m.shadowedByReal(inLink, { writer: true }), thAsked = th.asked.length;
        console.log('    B-02f6 remainder (1), the third read: ' + JSON.stringify({ dropAfterRemove: { res: dRes && dRes.id, dropped }, editInFlight: { asked: eAsked, e1: e1 && e1.id, e2: e2 && e2.id, keptOld: hed.m._proofKept.has('mm-hout'), never: hed.m._proofNever.get('mm-hout') }, pairKidAlive: { w: rkw && rkw.id, asked: rkAsked }, monotonic: { mo1, mo2, asked: moAsked }, thrown: { th1: th1 && th1.id, never: thNever, th2: th2 && th2.id, asked: thAsked } }));
        check('§17 B-02f6 remainder (1), the third read: an answer landing after its record was REMOVED is no one\'s (nothing kept); an EDIT while asked gets its own child and the old answer is dropped (the write by the new link refused, never passed by the old folder); no proof while the pair check\'s own child for the record is alive; the kept time on the monotonic clock (the wall clock an hour back: asked again); a THROW is kept its time, never «never again»',
          dRes?.id === 'mm-hout' && gateOf(dropped) && eAsked === 2 && e1?.id === 'mm-hout' && e2?.id === 'mm-hout' && !hed.m._proofKept.has('mm-hout') && rkw?.id === 'mm-hout' && rkAsked === 0 && mo1 === null && mo2 === null && moAsked === 2 && th1?.id === 'mm-hout' && !thNever && th2?.id === 'mm-hout' && thAsked === 2);
        const mmSrc = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src', 'machine-mounts.js'), 'utf8');
        const srBody = (mmSrc.match(/async function starterRealpath\([^)]*\) \{\n([\s\S]*?)\n\}\n/) || [])[1] || '';
        console.log('    B-02f6 remainder (1), its bounds: ' + JSON.stringify({ noAnswer: { n1: n1 && n1.id, n2: n2 && n2.id, asked: nAsked, afterTime: { n3: n3 && n3.id, asked: nAgain } }, inFlight: { max: MMx.PROOF_KIDS_MAX, third: f3, size: inFly, asked: flyAsked, shared: f1 === f1b }, keepMs: MMx.PROOF_KEEP_MS, proofMs: MMx.PROOF_MS, viaStarter, real: realM(outerLink) }));
        check('§17 B-02f6 remainder (1), r1178 (a): a proof that ANSWERED no folder is kept as REFUSED its time (one child for two writes), asked again once its time has passed; at most ' + MMx.PROOF_KIDS_MAX + ' asks IN FLIGHT — a third record is refused at once, a second ask for one in flight shares its child',
          n1?.id === 'mm-hout' && n2?.id === 'mm-hout' && nAsked === 1 && n3?.id === 'mm-hout' && nAgain === 2 && MMx.PROOF_KIDS_MAX === 2 && f3 === null && inFly === 2 && flyAsked === 2 && f1 === f1b && MMx.PROOF_KEEP_MS > 0 && MMx.PROOF_MS > 0);
        check('§17 B-02f6 remainder (1), r1178 (b): the proof\'s child is THE STARTER\'s — `realpath -m` through childStarter().run, no spawn of its own; a real run answers the link\'s real folder',
          gateOf(/childStarter\(\)\.run\('realpath', \['-m', '--', lex\]/.test(srBody)) && !/onLateExit|onTimeout/.test(srBody) && !/\bspawn\(/.test(srBody) && gateOf(/\(this\._proofRealpath \|\| starterRealpath\)\(rec\.mountpoint\)\)/.test(mmSrc)) && !/_proofStuck/.test(mmSrc) && viaStarter?.real === realM(outerLink) && viaStarter.slow === false, { viaStarter });
        // the doors AWAIT it (r1178: a guard nobody awaits passes everything): every call of the writers' door in src/ is awaited —
        // CONTROL: a planted call with no await is named
        const ROOTX = path.join(path.dirname(new URL(import.meta.url).pathname), '..'), srcFiles = [];
        const walkX = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const q = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules') walkX(q); } else if (e.name.endsWith('.js')) srcFiles.push(q); } };
        walkX(path.join(ROOTX, 'src'));
        const callsOf = (text) => { const out = []; const re = /(?<!function |async )\b(pullShadowOfReal|shadowedByReal|pullRefusal)\(/g; let x; while ((x = re.exec(text))) out.push({ name: x[1], awaited: /await\s+(?:require\([^)]*\)\.|[\w$]+\.)?$/.test(text.slice(Math.max(0, x.index - 80), x.index)) }); return out; };
        const calls = srcFiles.flatMap((f) => callsOf(fs.readFileSync(f, 'utf8')).map((c) => ({ ...c, file: path.relative(ROOTX, f) })));
        // …and a WRITER on the sync door is a named one: the TASK.md writer (its isPathShadowed is a sync API — it skips there, and writes
        // the file when a pull comes up or the group changes)
        const SYNC_WRITERS = ['src/server/task-groups-wiring.js'];
        const syncWriters = srcFiles.filter((f) => !f.endsWith(path.join('src', 'machine-mounts.js'))).flatMap((f) => (fs.readFileSync(f, 'utf8').match(/\bpullShadowOf\([^;]*?writer(?:: true)?\b/g) || []).map(() => path.relative(ROOTX, f)));
        const unawaited = calls.filter((c) => !c.awaited), planted = callsOf("const pull = require('../machine-mounts.js').pullShadowOfReal(p, { writer: true });").filter((c) => !c.awaited);
        console.log('    B-02f6 remainder, the writers\' door\'s callers: ' + JSON.stringify({ calls: calls.map((c) => `${c.file} ${c.name}${c.awaited ? '' : ' NOT AWAITED'}`), syncWriters }));
        check('§17 B-02f6 remainder: every caller of the writers\' door awaits it — the files route\'s guard, its upload, WebDAV\'s PUT / MKCOL and the COPY-MOVE destination (' + calls.length + ' calls)',
          unawaited.length === 0 && calls.filter((c) => c.file === 'src/routes/files.js' && c.name === 'pullShadowOfReal').length === 2 && calls.filter((c) => c.file === 'src/webdav.js' && c.name === 'pullRefusal').length === 2
            && syncWriters.join() === SYNC_WRITERS.join(), { unawaited, syncWriters });
        check('CONTROL §17 B-02f6 remainder: a planted call of the writers\' door with no await is named', planted.length === 1 && planted[0].name === 'pullShadowOfReal');
        // (2) THE TIE: two records on ONE folder by a link (mm-hout held «same», mm-hin holds), the HOLDER DOWN: a write by the HELD
        // row's spelling is the HOLDER's refusal (its machine, its code) — the same as by the holder's own spelling; a reader too (the
        // holder's bare folder probed empty); the holder live: nothing refused. RED: the release names the held row
        const t2 = await scene(MMx.MachineMounts, 'pairs-02f6r-tie', SCENES.sameLink);
        t2.m._live.delete('mm-hin');   // the holder went down after the pair check
        t2.m._bare = t2.m._bare || new Map();
        const tw = t2.w(path.join(mpLink, 'x.txt')), twOwn = t2.w(path.join(mpA, 'x.txt')), tr0 = t2.r(path.join(mpLink, 'x.txt'));
        t2.m._bare.set('mm-hin', 'empty'); const tr = t2.r(path.join(mpLink, 'x.txt')), trOwn = t2.r(path.join(mpA, 'x.txt'));
        t2.m._live.set('mm-hin', { teardown: async () => { }, mountpoint: mpA, at: Date.now() }); const twLive = t2.w(path.join(mpLink, 'x.txt')), trLive = t2.r(path.join(mpLink, 'x.txt'));
        const tb = tw ? MMx.pullShadowBody(tw) : null;
        const TIE = "      if (tie && tie.kind === 'same') { const o = this._state.mounts.find((x) => x.id === tie.otherId && x.dir === 'pull'); if (o) { if (this._live.has(o.id)) return null; let known = false; try { this.hosts.get(o.hostId); known = true; } catch (e) { known = !!(e && e.code === 'hosts-unread'); } if (known) m = o; } }   // the read's catch: a holder whose machine is gone (its records kept, the pair not checked again yet) never answers — the held row's own hold does\n";
        const TIE_UNGUARDED = "      if (tie && tie.kind === 'same') { const o = this._state.mounts.find((x) => x.id === tie.otherId && x.dir === 'pull'); if (o) { if (this._live.has(o.id)) return null; m = o; } }\n";   // stale-pins: kept — the control plants the unit's unguarded tie on purpose
        let tc = null;
        if (src3.split(TIE).length !== 2) check('§17 B-02f6 remainder CONTROL: the tie\'s line of shadowedBy moved — update this suite', false);
        else { const c5 = await scene(copy3(src3.replace(TIE, '')), 'pairs-02f6r-tie-ctl', SCENES.sameLink); c5.m._live.delete('mm-hin'); tc = c5.w(path.join(mpLink, 'x.txt')); }
        // the read's catch: the HOLDER's machine GONE (removed — its records kept as orphans until the pair is checked again): the held
        // row's own hold answers, never nothing. RED: the tie unguarded (in a copy) lets the write land in the bare folder
        const gone = await scene(MMx.MachineMounts, 'pairs-02f6r-gone', SCENES.sameLink); gone.m._live.delete('mm-hin');
        const c6 = src3.split(TIE).length === 2 ? await scene(copy3(src3.replace(TIE, TIE_UNGUARDED)), 'pairs-02f6r-gone-ctl', SCENES.sameLink) : null;   // both pair checks with the machine still known
        if (c6) c6.m._live.delete('mm-hin');
        const keepH1 = HOSTS.h1; let gw = 'unset', gwc = 'unset';
        try { delete HOSTS.h1; gw = gone.w(path.join(mpLink, 'x.txt')); if (c6) gwc = c6.w(path.join(mpLink, 'x.txt')); } finally { HOSTS.h1 = keepH1; }

        const tcb = tc ? MMx.pullShadowBody(tc) : null;
        console.log('    B-02f6 remainder (2), the facts judged: ' + JSON.stringify({ held: t2.held.get('mm-hout') && t2.held.get('mm-hout').kind, tw: tw && [tw.id, tb.code, tb.params.machine], twOwn: twOwn && twOwn.id, tr0, tr: tr && tr.id, trOwn: trOwn && trOwn.id, twLive, trLive, release: tc && [tc.id, tcb.code, tcb.params.machine] }));
        check('§17 B-02f6 remainder (2): on ONE folder (a link), the holder DOWN — a write by the HELD row\'s spelling names the row that HOLDS (its machine, its own state: machine_folder_down), as by the holder\'s own spelling; a reader the same (the holder\'s bare folder probed empty); the holder live: nothing refused, read or write',
          t2.held.get('mm-hout')?.kind === 'same' && tw?.id === 'mm-hin' && !tw.pairHeld && tb?.code === 'machine_folder_down' && tb.params.machine === 'Studio Mac' && twOwn?.id === 'mm-hin' && tr0 === null && tr?.id === 'mm-hin' && trOwn?.id === 'mm-hin' && twLive === null && trLive === null);
        console.log('    B-02f6 remainder (2), the holder\'s machine gone: ' + JSON.stringify({ gw: gw && gw !== 'unset' ? [gw.id, MMx.pullShadowBody(gw).code] : gw, unguarded: gwc && gwc !== 'unset' ? gwc.id : gwc }));
        check('§17 B-02f6 remainder (2), the read\'s catch: the HOLDER\'s machine gone (its records kept until the pair is checked again) — the held row\'s own hold answers the write (machine_folder_held), never nothing', gw?.id === 'mm-hout' && gw.pairHeld === true && MMx.pullShadowBody(gw).code === 'machine_folder_held');
        check('RED CONTROL §17 B-02f6 remainder (2): the tie unguarded (in a copy) answers nothing — the write would land in the bare folder', gwc === null, gwc);
        check('RED CONTROL §17 B-02f6 remainder (2): the release\'s rule (the tie\'s line cut, in a copy) names the HELD row — machine_folder_held, «Laptop»', tc?.id === 'mm-hout' && tc.pairHeld === true && tcb?.code === 'machine_folder_held' && tcb.params.machine === 'Laptop', tc);
      }
      released.length = 0; mountsAsked.length = 0;
      let threw = ''; try { await mm2._up(mm2._state.mounts.find((m) => m.id === 'mm-young')); } catch (e) { threw = String(e.code || '') + ' ' + e.message; }
      check('§17 a HELD record is never mounted and never releases its folder (the elder\'s): its heal refuses with its words', gateOf(/^mount_point_in_use /.test(threw)) && released.length === 0 && mountsAsked.length === 0, JSON.stringify({ threw, released, asked: mountsAsked.length }));
      const keepHeld = new Map(mm2._held); mm2._held.clear();   // RED CONTROL: the hold cut
      await mm2._up(mm2._state.mounts.find((m) => m.id === 'mm-young')).catch(() => { });
      check('CONTROL §17 (the hold cut): the younger\'s heal RELEASES the folder the elder holds — its release would end the elder\'s mount (red)', verdictOf(released.includes(mpLink)), JSON.stringify(released));
      mm2._live.delete('mm-young'); mm2._held = keepHeld; released.length = 0; mountsAsked.length = 0;
      online.d2 = false;   // the younger's machine offline: the boot would release its folder — but it is held, and its holder LIVE
      mm2._live.set('mm-old', { teardown: async () => { }, mountpoint: mpA, at: Date.now() });
      await mm2.restore();
      online.d2 = true;
      check('§17 the BOOT never releases a held record\'s folder while its holder is LIVE (the elder\'s mount), and marks a folder by its REAL path', !released.includes(mpLink) && !released.includes(mpInner) && mm2._markKey(mm2._state.mounts.find((m) => m.id === 'mm-young')) === fs.realpathSync(mpA), JSON.stringify({ released, key: mm2._markKey(mm2._state.mounts.find((m) => m.id === 'mm-young')) }));
      await mm2.unmount('mm-old');
      const freed = await until(() => !mm2._held.has('mm-young') && !rowOf('mm-young').error, 3000);
      check('§17 the elder REMOVED: the younger is free (its words go; the sweep may try it at once — no 5-min wait left)', gateOf(freed) && !(mm2._pullRetryAt && mm2._pullRetryAt.has('mm-young')), JSON.stringify({ held: [...mm2._held.keys()], ry: rowOf('mm-young') }));
      // THE HOLDER BY RANK (its read): a removed machine's record never holds; a record whose machine is online holds an offline elder's
      const HOSTS3 = { ...HOSTS, h3: { id: 'h3', name: 'Old box', transport: 'dial', deviceId: 'd3' } };
      const hosts3 = { ...hosts, get: (id) => { if (!HOSTS3[id]) throw new Error('host not found'); return HOSTS3[id]; } };
      const dd3 = path.join(tmp, 'pairs-c'); fs.mkdirSync(dd3, { recursive: true });
      fs.writeFileSync(path.join(dd3, 'machine-mounts.json'), JSON.stringify({ mounts: [
        { id: 'mm-orphan', dir: 'pull', hostId: 'h-removed', remotePath: '/Users/a', mountpoint: mpA, createdAt: 1 },   // a removed machine's row (an ssh machine edited: removed + added)
        { id: 'mm-new', dir: 'pull', hostId: 'h2', remotePath: '/Users/a', mountpoint: mpA, createdAt: 9 },              // the machine added again: the same default folder
        { id: 'mm-off-elder', dir: 'pull', hostId: 'h3', remotePath: '/o', mountpoint: mpB, createdAt: 2 },              // an offline machine's elder…
        { id: 'mm-on-young', dir: 'pull', hostId: 'h1', remotePath: '/p', mountpoint: mpB, createdAt: 8, lastLiveAt: 50 }, // …and a younger on the same folder that was live LAST (the mount that worked before a restart)
      ] }));
      const mm3 = new MMx.MachineMounts({ dataDir: dd3, hosts: hosts3, rcloneBin: () => 'rclone', broadcast: () => { }, log: (l) => said17.push(String(l)) }); clearInterval(mm3._sweep);
      online.d3 = false; online.d1 = false;   // after a restart: neither machine connected yet
      const held3 = await mm3._recheckPairs();
      online.d1 = true;
      const ro3 = mm3.list().find((r) => r.id === 'mm-orphan') || {};
      check('§17 THE HOLDER BY RANK: a removed machine\'s row never holds (the edited machine\'s new row is free; the orphan held, named so) and the record live LAST holds after a restart (nothing live yet) — not the elder', !held3.has('mm-new') && gateOf(held3.has('mm-orphan')) && gateOf(held3.has('mm-off-elder')) && !held3.has('mm-on-young') && gateOf(/also the mount point of “Laptop”’s \/Users\/a — remove one of the two rows/.test(ro3.error || '')) && ro3.errorParams?.held === true, JSON.stringify({ held: [...held3.keys()], ro3 }));
      online.d1 = false; online.d3 = true;   // the elder's DIAL machine redialled first, the last-live one's not yet
      const held3g = await mm3._recheckPairs();   // r4 (read 3 #1a): inside the grace after a start — the mount that worked keeps its folder
      mm3._pairGraceMs = 0;   // the grace over: the one that can mount now holds (a dead holder never empties the folder for good)
      const held3c = await mm3._recheckPairs();
      online.d1 = true; online.d3 = false;
      check('§17 …r4: INSIDE the grace after a start the record live LAST keeps its folder whichever machine redials first; AFTER it, a DIAL machine whose link is UP holds over one whose link is down (it can mount now; an ssh machine: unless its last try failed — the ssh leg below)', gateOf(held3g.has('mm-off-elder')) && !held3g.has('mm-on-young') && gateOf(held3c.has('mm-on-young')) && !held3c.has('mm-off-elder'), JSON.stringify({ grace: [...held3g.keys()], after: [...held3c.keys()] }));
      mm3._live.set('mm-off-elder', { teardown: async () => { }, mountpoint: mpB, at: Date.now() });
      const held3b = await mm3._recheckPairs();
      check('§17 …a LIVE record holds its folder whatever its age or machine (the live elder holds the younger)', gateOf(held3b.has('mm-on-young')) && !held3b.has('mm-off-elder'), JSON.stringify([...held3b.keys()]));
      // _up refuses at once while another record is live or being mounted on the folder (two dial-ins before the boot's pair check)
      const mm4 = mkMM('pairs-d', [
        { id: 'mm-x', dir: 'pull', hostId: 'h1', remotePath: '/x', mountpoint: mpFree, createdAt: 1 },
        { id: 'mm-y', dir: 'pull', hostId: 'h2', remotePath: '/y', mountpoint: mpFree, createdAt: 2 },
      ]);
      released.length = 0; mountsAsked.length = 0;
      mm4._mounting.add('mm-x'); mm4._pairsOnce = Promise.resolve();   // r5 (read 4 #4): no pair check — the refusal is _liveConflict's own
      mm4._pullRetryAt = new Map([['mm-y', Date.now() + 300000]]);
      let lcErr = ''; try { await mm4._up(mm4._state.mounts.find((m) => m.id === 'mm-y')); } catch (e) { lcErr = String(e.code || ''); }
      const retry4 = mm4._pullRetryAt.has('mm-y');
      mm4._mounting.delete('mm-x');
      check('§17 a heal of a folder another record is MOUNTING (no pair check ran) refuses at once — nothing released, nothing mounted; r5: the refusal is _liveConflict\'s (no pair check ran) and clears the retry mark', lcErr === 'mount_point_in_use' && !retry4 && released.length === 0 && mountsAsked.length === 0, JSON.stringify({ lcErr, retry4, released, asked: mountsAsked.length }));
      // the boot releases a HELD record's folder when its holder is neither live nor being mounted (the last hub's leftover)
      online.d1 = false; online.d2 = false; released.length = 0;
      await mm4.restore();
      online.d1 = true; online.d2 = true;
      const ry4 = mm4.list().find((r) => r.id === 'mm-y') || {};
      check('§17 the BOOT releases a held record\'s folder when its holder is neither live nor mounting (a dead FUSE entry of either is let go): both rows\' steps ran — and the held row KEEPS its words', gateOf(mm4._held.has('mm-y')) && released.filter((x) => x === mpFree).length === 2 && ry4.errorCode === 'mount_point_in_use' && ry4.errorParams?.held === true, JSON.stringify({ held: [...mm4._held.keys()], released, ry4 }));
      // a held record is never probed (its folder may be its holder's live mount)
      mm4._bare = mm4._bare || new Map(); mm4._bare.set('mm-y', 'sentinel');
      const pv = await mm4._probeBare(mm4._state.mounts.find((m) => m.id === 'mm-y'));
      check('§17 a HELD record is never probed (no child over its holder\'s mount)', pv === 'sentinel' && !(mm4._probing && mm4._probing.has('mm-y')));
      // a boot mark on a folder NESTED with this one is waited for (a parent's lazy unmount detaches everything beneath it)
      const mm5 = mkMM('pairs-e', [{ id: 'mm-child', dir: 'pull', hostId: 'h1', remotePath: '/c', mountpoint: mpB, createdAt: 1 }]);
      let openP; const parentRel = new Promise((r) => { openP = r; });
      mm5._realMp.set('mm-child', fs.realpathSync(mpB)); mm5._releasing = new Map([[fs.realpathSync(mpOuter), parentRel]]);
      released.length = 0; mountsAsked.length = 0;
      const upC = mm5._up(mm5._state.mounts[0]);
      const waited = (await quiet(() => mm5._mounting.has('mm-child') || released.length > 0 ? 'moved' : 'held', 2000, 60)) === 'held';
      openP(); await upC.catch(() => { });
      check('§17 a heal WAITS for a boot release of a folder NESTED with its own (the parent\'s), then mounts', gateOf(waited) && verdictOf(mountsAsked.some((o) => o.mountpoint === mpB)), JSON.stringify({ waited, asked: mountsAsked.length }));
      // a removed record still mounting holds its folder (nested too): a new record's heal refuses; its chain sees the new record
      const mm6 = mkMM('pairs-f', [{ id: 'mm-new6', dir: 'pull', hostId: 'h1', remotePath: '/n', mountpoint: mpB, createdAt: 2 }]);
      mm6._realMp.set('mm-new6', fs.realpathSync(mpB)); mm6._realMp.set('mm-gone6', fs.realpathSync(mpOuter)); mm6._mounting.add('mm-gone6');   // removed, its chain still mounting the PARENT folder
      mm6._letGoMs = 300; mm6._pullRetryAt = new Map([['mm-new6', Date.now() + 300000]]);   // r4 (read 3 #2): bounded wait; (#6) a conflict refusal clears the retry mark
      let e6 = '', w6 = ''; try { await mm6._up(mm6._state.mounts[0]); } catch (e) { e6 = String(e.code || ''); w6 = e.message; }
      const retry6 = mm6._pullRetryAt.has('mm-new6');
      released.length = 0; mountsAsked.length = 0;
      setTimeout(() => mm6._mounting.delete('mm-gone6'), 120);   // the removed chain lets go meanwhile
      let e6b = ''; try { await mm6._up(mm6._state.mounts[0]); } catch (e) { e6b = String(e.code || ''); }
      const mounted6 = mountsAsked.some((o) => o.mountpoint === mpB); mm6._live.delete('mm-new6'); mm6._mounting.delete('mm-new6');
      mm6._mounting.add('mm-gone6');
      mm6._mounting.add('mm-new6'); const sees = mm6._otherHolds({ id: 'mm-gone6', dir: 'pull', mountpoint: mpOuter }); mm6._mounting.delete('mm-new6');
      mm6._mounting.delete('mm-gone6');
      check('§17 r4 (read 3 #2): a REMOVED record still mounting a folder nested with a new one\'s is WAITED for (bounded), never named as a row: its chain let go ⇒ the new record mounts; still holding past the bound ⇒ refused by its own words (mount_point_releasing), the retry mark cleared; its chain sees the new record nested beneath (canRelease: no)', e6 === 'mount_point_releasing' && gateOf(/still being let go — it is tried again by itself/.test(w6)) && !retry6 && !e6b && gateOf(mounted6) && sees === true, JSON.stringify({ e6, w6, retry6, e6b, mounted6, sees }));   // stale-pins: kept — the RUNTIME words (src/mount-error-words.js fills them)
      // r4 (read 3 #1a): THE BOOT GATE — two records from before (no lastLiveAt), the YOUNGER's machine redials first, before restore
      const pairOf = (name, mpX) => mkMM(name, [
        { id: 'mm-el', dir: 'pull', hostId: 'h1', remotePath: '/e', mountpoint: mpX, createdAt: 1 },
        { id: 'mm-yo', dir: 'pull', hostId: 'h2', remotePath: '/y', mountpoint: mpX, createdAt: 2 },
      ]);
      const upCode = async (m, id) => { try { await m._up(m._state.mounts.find((r) => r.id === id)); return 'up'; } catch (e) { return String(e.code || e.message); } };
      released.length = 0; mountsAsked.length = 0;
      const mm8 = pairOf('pairs-h', mpG);
      online.d1 = false;   // r5 (read 4 #1): the YOUNGER's machine redialled, the elder's NOT YET — inside the grace the link decides nothing
      const y8 = await upCode(mm8, 'mm-yo');
      online.d1 = true;
      const e8 = await upCode(mm8, 'mm-el');
      const sh8 = (mm8.list().find((r) => r.id === 'mm-el') || {}).shares, shY = (mm8.list().find((r) => r.id === 'mm-yo') || {}).shares;
      const gate8 = mountsAsked.filter((o) => o.mountpoint === mpG).length;
      check('§17 r4/r5 (reads 3 #1a, 4 #1): the FIRST heal of a hub — the younger\'s machine redialled before restore, the elder\'s not yet back — runs the pair check first, and inside the grace the link decides nothing: the elder holds (two records from before have no lastLiveAt), the younger is refused, held; ONE mount of the folder', y8 === 'mount_point_in_use' && e8 === 'up' && gate8 === 1 && verdictOf(mm8._held.has('mm-yo')), JSON.stringify({ y8, e8, gate8 }));
      check('§17 r5/r6 (reads 4 #8, 5 #2): the HOLDER\'s row says it shares its folder — each waiting row by its machine, folder and which way it nests; the held row does not', gateOf(Array.isArray(sh8)) && sh8.length === 1 && sh8[0].machine === 'Laptop' && sh8[0].remotePath === '/y' && sh8[0].removed === false && sh8[0].kind === 'same' && !shY, JSON.stringify({ sh8, shY }));
      mountsAsked.length = 0;
      const mm8c = pairOf('pairs-h2', mpG); mm8c._pairsOnce = Promise.resolve();   // CONTROL: no gate (the release's order) —
      mm8c._realMp.set('mm-el', fs.realpathSync(mpG)); mm8c._realMp.set('mm-yo', fs.realpathSync(mpG));   // — and no path learned on the road (r7's re-check is a gate too)
      const y8c = await upCode(mm8c, 'mm-yo');
      check('CONTROL §17 r4 (no gate): the younger that redialled first mounts the folder before any pair check (red)', y8c === 'up' && verdictOf(mountsAsked.some((o) => o.mountpoint === mpG)), y8c);
      for (const m of [mm8, mm8c]) { m._live.clear(); m._mounting.clear(); }
      // r4 (read 3 #1b): A LINK IS A RE-RANK — the grace over, both machines down: the elder holds by age; the younger's machine links
      const relink = async (name, cut) => {
        const m = pairOf(name, mpH); m._pairGraceMs = 0;
        online.d1 = false; online.d2 = false;
        await m._recheckPairs();
        const heldBefore = m._held.has('mm-yo');
        if (cut) m._recheckPairs = async () => m._held;   // CONTROL: the link re-ranks nothing
        online.d2 = true; mountsAsked.length = 0;
        m.onMachineLinked('h2');
        const landed = () => mountsAsked.some((o) => o.mountpoint === mpH);
        if (cut) await until(landed, 300); else await until(landed);
        const out = { heldBefore, mounted: mountsAsked.some((o) => o.mountpoint === mpH), yoHeld: m._held.has('mm-yo'), elHeld: m._held.has('mm-el') };
        online.d1 = true; online.d2 = true; m._live.clear(); m._mounting.clear();
        return out;
      };
      const rl = await relink('pairs-i', false), rlc = await relink('pairs-i2', true);
      check('§17 r4 (read 3 #1b): the holder DOWN and the held record\'s machine LINKING (the grace over): the link re-ranks — the held record takes the folder and is healed (mounted), the holder held', gateOf(rl.heldBefore) && gateOf(rl.mounted) && !rl.yoHeld && verdictOf(rl.elHeld), JSON.stringify(rl));
      check('CONTROL §17 r4 (the link re-ranks nothing): the held record stays held and the folder stays empty while its holder is down (red)', gateOf(rlc.heldBefore) && !rlc.mounted && verdictOf(rlc.yoHeld), JSON.stringify(rlc));
      // r5 (read 4 #3): THE SWEEP re-ranks and heals in the same pass — the grace over, the holder's machine down, the held one's up
      {
        const m = pairOf('pairs-j', mpK); m._pairGraceMs = 0;
        online.d1 = false; online.d2 = false;
        await m._recheckPairs();
        const before = m._held.has('mm-yo');
        online.d2 = true; mountsAsked.length = 0;
        await m._healthSweep();
        await until(() => mountsAsked.some((o) => o.mountpoint === mpK));
        const out = { before, mounted: mountsAsked.some((o) => o.mountpoint === mpK), yoHeld: m._held.has('mm-yo'), elHeld: m._held.has('mm-el') };
        online.d1 = true; online.d2 = true; m._live.clear(); m._mounting.clear();
        check('§17 r5 (read 4 #3): the SWEEP re-ranks while a record is held — the holder\'s machine down, the held one\'s up — and heals the freed record in the same pass (mounted)', gateOf(out.before) && gateOf(out.mounted) && !out.yoHeld && verdictOf(out.elHeld), JSON.stringify(out));
      }
      // r5 (read 4 #2): an SSH record can mount unless its last try failed — a held ssh record takes over from a dial holder that is down
      {
        const HOSTS5 = { ...HOSTS, h4: { id: 'h4', name: 'Build box', transport: 'ssh', host: 'build.example', user: 'u' } };
        const hosts5 = { ...hosts, get: (id) => { if (!HOSTS5[id]) throw new Error('host not found'); return HOSTS5[id]; } };
        const dd5 = path.join(tmp, 'pairs-k'); fs.mkdirSync(dd5, { recursive: true });
        fs.writeFileSync(path.join(dd5, 'machine-mounts.json'), JSON.stringify({ mounts: [
          { id: 'mm-dialY', dir: 'pull', hostId: 'h1', remotePath: '/y', mountpoint: mpL, createdAt: 1, lastLiveAt: 99 },   // the holder: live last, its machine now asleep
          { id: 'mm-sshX', dir: 'pull', hostId: 'h4', remotePath: '/x', mountpoint: mpL, createdAt: 5 },                    // held: an ssh machine (no link to read)
        ] }));
        const m = new MMx.MachineMounts({ dataDir: dd5, hosts: hosts5, rcloneBin: () => 'rclone', broadcast: () => { }, log: (l) => said17.push(String(l)) }); clearInterval(m._sweep);
        online.d1 = false;
        const inGrace = await m._recheckPairs();   // inside the grace: the one live last keeps it
        m._pairGraceMs = 0;
        const after = await m._recheckPairs();     // after: the ssh record can mount (no failed try), the dial holder cannot
        m._pullFailedAt = new Map([['mm-sshX', Date.now() + 300000]]);   // r7: the rank's own failed-try mark
        const failed = await m._recheckPairs();    // its try failed: neither can mount now — r6 (read 5 #3): the CURRENT holder stays
        online.d1 = true;
        const linkBack = await m._recheckPairs();   // r8 (read 7 #2): the dial holder's link back, the ssh holder's try failed — the rank READS the mark: the dial one can mount, the ssh one cannot
        check('§17 r8 (read 7 #2): the rank reads the failed-try mark — the ssh holder whose try failed yields to the dial record whose link came back (without the mark the current holder would stay)', gateOf(linkBack.has('mm-sshX')) && !linkBack.has('mm-dialY'), JSON.stringify([...linkBack.keys()]));
        check('§17 r5/r6 (reads 4 #2, 5 #3): an SSH record counts as able to mount unless its last try FAILED — inside the grace the one live last holds; after it a held ssh record takes the folder from a dial holder that is down; once its own try failed too, neither can mount and the CURRENT holder stays (no folder passed back and forth)', gateOf(inGrace.has('mm-sshX')) && gateOf(after.has('mm-dialY')) && !after.has('mm-sshX') && gateOf(failed.has('mm-dialY')) && !failed.has('mm-sshX'), JSON.stringify({ inGrace: [...inGrace.keys()], after: [...after.keys()], failed: [...failed.keys()] }));
      }
      // r6 (read 5 #1): a record whose OWN real path is unknown (its child did not answer) is never mounted; the next check asks again
      {
        const m = mkMM('pairs-l', [{ id: 'mm-unk', dir: 'pull', hostId: 'h1', remotePath: '/u', mountpoint: mpFree, createdAt: 1 }]);
        m._pairsOnce = Promise.resolve(); m._resolveReals = async () => { };   // the child never answers
        mountsAsked.length = 0;
        const u1 = await upCode(m, 'mm-unk');
        const row1 = (m.list().find((r) => r.id === 'mm-unk') || {});
        delete m._resolveReals;   // it answers now — read the row when the path is LEARNED, before any mount step (a release would clear words too)
        await m._resolveReals();
        const row2 = (m.list().find((r) => r.id === 'mm-unk') || {});
        const u3 = await upCode(m, 'mm-unk');
        check('§17 r6/r7/r8 (reads 5 #1, 6 #6, 7 #4, 8 #3): a record whose own real path is UNKNOWN is refused by its own words (mount_point_unchecked), said ON ITS ROW, nothing mounted; once it answers, its words go WHEN LEARNED (read before any mount step), and the next try mounts', u1 === 'mount_point_unchecked' && row1.errorCode === 'mount_point_unchecked' && !row2.error && u3 === 'up' && mountsAsked.filter((o) => o.mountpoint === mpFree).length === 1, JSON.stringify({ u1, u3, row1: row1.errorCode, row2: row2.error }));
        m._live.clear(); m._mounting.clear();
      }
      // r7 (read 6 #2): an ADD whose folder did not answer is refused — nothing recorded (its pair could never be checked later)
      {
        const m = mkMM('pairs-o', [{ id: 'mm-a0', dir: 'pull', hostId: 'h1', remotePath: '/a0', mountpoint: mpA, createdAt: 1 }]);
        m._realpath = async (pX, o) => { if (o && o.onExit) o.onExit(); return null; };
        const n0 = m._state.mounts.length;
        let ac = '', aw = ''; try { await m.mountPull('h2', { remotePath: '/z0', mountpoint: mpLink }); } catch (e) { ac = String(e.code || ''); aw = e.message; }
        check('§17 r7/r8 (reads 6 #2, 7 #1): an add whose folder did not ANSWER (a wedged target) is refused by ITS OWN words — «nothing was added» (nothing is tried again) — and nothing is recorded', ac === 'mount_point_add_unchecked' && gateOf(/nothing was added/.test(aw)) && m._state.mounts.length === n0, JSON.stringify({ ac, aw, n: m._state.mounts.length }));   // stale-pins: kept — the RUNTIME words (src/mount-error-words.js fills them)
        // r7 (read 6 #5): ONE child per record — a record whose child still runs is not asked again
        let calls = 0; m._realpath = async (pX, o) => { calls++; if (o && o.onExit) o.onExit(); return pX; };
        m._realMp.delete('mm-a0'); m._realKids = new Set(['mm-a0']);
        await m._resolveReals();
        const busy = calls; m._realKids.clear(); await m._resolveReals();
        check('§17 r7 (read 6 #5): a record whose realpath child has not ended is never asked a second time (one child per record); once it has, the next check asks', busy === 0 && calls === 1 && verdictOf(m._realMp.has('mm-a0')), JSON.stringify({ busy, calls }));
      }
      // r7 (read 6 #1): a record whose real path is UNKNOWN cannot mount now — a held record that can takes the folder (the grace over)
      {
        const m = pairOf('pairs-p', mpK); m._pairGraceMs = 0;
        m._realMp.set('mm-yo', fs.realpathSync(mpK)); m._realpath = async (pX, o) => { if (o && o.onExit) o.onExit(); return null; };   // the elder's never answers
        const hp = await m._recheckPairs();
        check('§17 r7 (read 6 #1): the elder whose real path never answers cannot mount now — the younger that can holds (no «current holder» keeps a folder nobody can mount)', gateOf(hp.has('mm-el')) && !hp.has('mm-yo'), JSON.stringify([...hp.keys()]));
      }
      // r5 (read 4 #5): a re-rank during the let-go wait is read again — a record held meanwhile is never mounted
      {
        const m = mkMM('pairs-m', [{ id: 'mm-w', dir: 'pull', hostId: 'h1', remotePath: '/w', mountpoint: mpB, createdAt: 2 }]);
        m._realMp.set('mm-w', fs.realpathSync(mpB)); m._realMp.set('mm-gone-w', fs.realpathSync(mpB)); m._mounting.add('mm-gone-w'); m._letGoMs = 500;
        m._pairsOnce = Promise.resolve(); mountsAsked.length = 0;
        setTimeout(() => { m._held.set('mm-w', { kind: 'same', otherId: 'mm-x', code: 'mount_point_in_use', params: { held: true }, words: 'held meanwhile' }); m._mounting.delete('mm-gone-w'); }, 80);
        let wc = '', ww = ''; try { await m._up(m._state.mounts[0]); } catch (e) { wc = String(e.code || ''); ww = e.message; }
        check('§17 r5 (read 4 #5): the let-go wait ends with the record HELD meanwhile (a re-rank) — refused by its held words, nothing mounted', wc === 'mount_point_in_use' && ww === 'held meanwhile' && !mountsAsked.some((o) => o.mountpoint === mpB), JSON.stringify({ wc, ww }));
      }
      // r6: «releasing» is no failure event; a failed try on ANY road marks it (the rank reads it), a landed mount clears it
      {
        const ev0 = global.__vsEvent, evs = []; global.__vsEvent = (n) => evs.push(n);
        try {
          const m = mkMM('pairs-n', []); m._letGoMs = 120;
          m._realMp.set('mm-gone-n', fs.realpathSync(mpH)); m._mounting.add('mm-gone-n');
          let rc = ''; try { await m.mountPull('h1', { remotePath: '/n', mountpoint: mpH }); } catch (e) { rc = String(e.code || ''); }
          m._mounting.delete('mm-gone-n');
          const recN = m._state.mounts.find((x) => x.mountpoint === mpH);
          const realMount = DMX.deviceFolderMount;
          DMX.deviceFolderMount = async () => { throw new Error('serve-folder refused (a stand-in)'); };
          m._pullFailedAt = new Map(); m._pullRetryAt = new Map();
          let fc = ''; try { await m._up(recN); } catch (e) { fc = String(e.message || ''); }
          const marked = (m._pullFailedAt.get(recN.id) || 0) > Date.now() && !m._pullRetryAt.has(recN.id);   // r7 (read 6 #4): its own mark — the sweep's backoff untouched
          DMX.deviceFolderMount = realMount;
          await m._up(recN).catch(() => { });
          const cleared = !m._pullFailedAt.has(recN.id);
          check('§17 r6: an add refused «releasing» fires NO failure event (the person\'s folder choice); a failed try on another road (here a direct heal) MARKS it — the rank reads it — and a landed mount clears the mark', rc === 'mount_point_releasing' && !evs.includes('machine-mount-pull-failed') && gateOf(/stand-in/.test(fc)) && gateOf(marked) && verdictOf(cleared), JSON.stringify({ rc, evs, fc, marked, cleared }));
          m._live.clear(); m._mounting.clear();
        } finally { global.__vsEvent = ev0; }
      }
      const MMSRC = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src/machine-mounts.js'), 'utf8');
      {   // r7/r8 (reads 6 #7, 7 #7): a host with NO realpath binary takes the path as written (final) — driven, not read
        const emptyBin = path.join(tmp, 'empty-bin'); fs.mkdirSync(emptyBin, { recursive: true });
        const m = mkMM('pairs-q', [{ id: 'mm-nobin', dir: 'pull', hostId: 'h1', remotePath: '/q', mountpoint: mpG, createdAt: 1 }]);
        const PATH0 = process.env.PATH; process.env.PATH = emptyBin;
        let learnedQ; try { learnedQ = await m._resolveReals(); } finally { process.env.PATH = PATH0; }
        check('§17 r7/r8 (reads 6 #7, 7 #7): a host with NO realpath binary (the child cannot start: ENOENT) takes the path as written, kept — never «no answer» for ever', m._realMp.get('mm-nobin') === path.resolve(mpG) && gateOf(Array.isArray(learnedQ)) && verdictOf(learnedQ.includes('mm-nobin')), JSON.stringify({ got: m._realMp.get('mm-nobin'), learnedQ }));
      }
      {   // r5/r8c (reads 4 #6, 8 #1): a realpath child that did not ANSWER is no answer — never kept as the path as written; the next check asks again (driven)
        const m = mkMM('pairs-r', [{ id: 'mm-na', dir: 'pull', hostId: 'h1', remotePath: '/na', mountpoint: mpH, createdAt: 1 }]);
        m._realpath = async (pX, o) => { if (o && o.onExit) o.onExit(); return null; };
        const l1 = await m._resolveReals(); const kept1 = m._realMp.has('mm-na');
        m._realpath = async (pX, o) => { if (o && o.onExit) o.onExit(); return '/the/real/' + path.basename(pX); };
        const l2 = await m._resolveReals();
        check('§17 r5/r8c (reads 4 #6, 8 #1): a realpath child that did not ANSWER is no answer — nothing kept (never the path as written); the next check asks again and keeps the real answer', !kept1 && l1.length === 0 && m._realMp.get('mm-na') === '/the/real/h' && gateOf(l2.includes('mm-na')) && gateOf(MMSRC.includes("return S.run('realpath', ['-m', '--', lex], { timeoutMs: ms,")) && verdictOf(MMSRC.includes("if (r.timedOut) return null;   // its end comes through onLateExit")), JSON.stringify({ kept1, l1, l2, got: m._realMp.get('mm-na') }));
      }
      // an add refused for a removed machine's row names the right action
      const mm7 = mkMM('pairs-g', [{ id: 'mm-orph7', dir: 'pull', hostId: 'h-removed', remotePath: '/Users/a', mountpoint: mpFree, createdAt: 1 }]);
      let w7 = ''; try { await mm7.mountPull('h2', { remotePath: '/z', mountpoint: mpFree }); } catch (e) { w7 = e.message; }
      check('§17 an add refused for a REMOVED machine\'s row says to remove that row (or pick another folder)', verdictOf(/already the mount point of a removed machine’s \/Users\/a — remove that row in Mounts, or pick another folder/.test(w7)), w7);
      // ── B-844b's race guard: a pull removed while mounted and added again on the same folder — the old chain keeps the folder ──
      const oldRec = { id: 'mm-gone-old', dir: 'pull', hostId: 'h1', remotePath: '/Users/a', mountpoint: mpA };
      mm2._realMp.set(oldRec.id, fs.realpathSync(mpA));   // known from when it lived (unmount keeps a removed record's real path)
      mm2._mounting.add('mm-young');
      const holds = mm2._otherHolds(oldRec);
      mm2._mounting.delete('mm-young');
      check('§17 a removed record\'s chain sees ANOTHER record holding its folder (being mounted) — canRelease says no; with none, yes', holds === true && mm2._otherHolds(oldRec) === false);
      mountsAsked.length = 0; await mm2._up(mm2._state.mounts.find((m) => m.id === 'mm-free2')).catch(() => { });
      const capt = mountsAsked.find((o) => typeof o.canRelease === 'function');
      const freeRec = mm2._state.mounts.find((m) => m.id === 'mm-free2');
      const intruder = { id: 'mm-intruder', dir: 'pull', hostId: 'h1', remotePath: '/i', mountpoint: mpFree, createdAt: 99 }; mm2._state.mounts.push(intruder); mm2._realMp.set(intruder.id, fs.realpathSync(mpFree));
      const free0 = capt ? capt.canRelease() : null; mm2._mounting.add('mm-intruder'); const held1 = capt ? capt.canRelease() : null; mm2._mounting.delete('mm-intruder');
      mm2._state.mounts.pop(); mm2._live.delete('mm-free2');
      check('§17 the chain is handed its OWNER\'s canRelease: yes while no other record holds its folder, NO once another is being mounted there', !!capt && free0 === true && held1 === false && !!freeRec, JSON.stringify({ free0, held1 }));
      // ── the smalls (主开发's 01:11Z, for this line of these files) ──
      const recF = mm2._state.mounts.find((m) => m.id === 'mm-free2'); mm2._live.delete('mm-free2');
      // (6) a mount starting clears the bare verdict
      let openM; const heldM = new Promise((r) => { openM = r; });
      DMX.deviceFolderMount = async (o) => { await heldM; return { mountpoint: o.mountpoint, devicePort: 1, bridgePort: 1, teardown: async () => { }, released: () => null }; };
      mm2._bare = mm2._bare || new Map(); mm2._bare.set('mm-free2', 'empty');
      const upP = mm2._up(recF);
      const cleared = await until(() => mm2._mounting.has('mm-free2') && !mm2._bare.has('mm-free2'), 2000);
      openM(); await upP.catch(() => { }); mm2._live.delete('mm-free2');
      check('§17 (small 6) a folder being MOUNTED keeps no old «empty» verdict (cleared when its mount starts)', verdictOf(cleared));
      // (3) an `ls` that could not start: no verdict, and the sweep tears nothing down
      const noLs = path.join(tmp, 'path-no-ls'); fs.mkdirSync(noLs, { recursive: true });
      mm2._bare.set('mm-free2', 'empty');
      process.env.PATH = noLs;
      const v0 = await mm2._probeBare(recF);
      let torn = 0; mm2._live.set('mm-free2', { teardown: async () => { torn++; }, mountpoint: mpFree, at: Date.now() });
      await mm2._healthSweep();
      process.env.PATH = PATH1;
      check('§17 (small 3) an `ls` that could not START gives no verdict (the old one stands), and the sweep tears no live mount down for it', v0 === 'empty' && mm2._bare.get('mm-free2') === 'empty' && torn === 0 && verdictOf(mm2._live.has('mm-free2')), JSON.stringify({ v0, torn, live: mm2._live.has('mm-free2') }));
      mm2._live.delete('mm-free2');
      // (3) a probe that HANGS: bounded, its child ended by its handle, the verdict dropped
      const hangLs = path.join(tmp, 'path-hang-ls'); fs.mkdirSync(hangLs, { recursive: true });
      fs.writeFileSync(path.join(hangLs, 'ls'), '#!/bin/sh\nexec sleep 30\n', { mode: 0o755 });
      process.env.PATH = hangLs + ':' + PATH1; mm2._probeMs = 300;
      const t0 = Date.now(); const vh = await mm2._probeBare(recF); const tookMs = Date.now() - t0;
      process.env.PATH = PATH1; mm2._probeMs = 0;
      const endedH = await until(() => !mm2._probing.has('mm-free2'), 3000);
      check('§17 (small 3) a probe that HANGS is bounded: its verdict dropped (shown as before), its child ended by its handle (its stand-in sleeps 30 s)', vh === null && !mm2._bare.has('mm-free2') && verdictOf(endedH), JSON.stringify({ vh, tookMs, endedH }));
      // (2) a probe child that never ends (an `ls` asleep in the kernel outlives its handle's kill): said ONCE in the journal
      const sayN = () => said17.filter((l) => /has not ended in 60 s/.test(l)).length;
      mm2._probing.add('mm-free2'); (mm2._probingAt = mm2._probingAt || new Map()).set('mm-free2', Date.now() - 10000);
      const c0 = sayN(); await mm2._probeBare(recF); const c1 = sayN();   // CONTROL: 10 s alive — no line yet
      mm2._probingAt.set('mm-free2', Date.now() - 61000);
      await mm2._probeBare(recF); await mm2._probeBare(recF); const c2 = sayN();
      mm2._probing.delete('mm-free2'); mm2._probingAt.delete('mm-free2'); mm2._probeSaid?.delete('mm-free2'); mm2._reprobe?.delete('mm-free2');   // the child ended (as its exit does)
      mm2._probing.add('mm-free2'); mm2._probingAt.set('mm-free2', Date.now() - 61000); await mm2._probeBare(recF); const c3 = sayN();
      mm2._probing.delete('mm-free2'); mm2._probingAt.delete('mm-free2'); mm2._probeSaid?.delete('mm-free2'); mm2._reprobe?.delete('mm-free2');
      check('§17 (small 2) a probe child still alive past 60 s is said ONCE in the journal (CONTROL: at 10 s nothing); a later wedged child is said again', c1 === c0 && c2 - c1 === 1 && c3 - c2 === 1, JSON.stringify({ c0, c1, c2, c3 }));
      // (5) the row's «not empty» words as a code the page words
      DMX.deviceFolderMount = async ({ mountpoint }) => { throw new Error(`rclone webdav mount exited: Fatal error: directory is not empty: "${mountpoint}"`); };
      await mm2._up(recF).catch(() => { });
      const rf = rowOf('mm-free2');
      check('§17 (small 5) the row\'s «not empty» words come with their code (the page words them: zh, ja)', rf.errorCode === 'mount_not_empty' && verdictOf(/not empty/.test(rf.error || '')), JSON.stringify(rf));
      // (1) WebDAV: what a request ADDS into a pull folder that is not mounted is refused with the row's state
      const { registerWebdav } = require('../src/webdav.js');
      const express = require('express');
      const appD = express(); registerWebdav(appD, { tokens: { resolve: () => ({ root: base, mode: 'rw' }) } });
      const srvD = require('http').createServer(appD); await new Promise((res) => srvD.listen(0, '127.0.0.1', res));
      const atD = `http://127.0.0.1:${srvD.address().port}`;
      MMx.registerPullDoor(() => mm2);
      fs.writeFileSync(path.join(base, 'here.txt'), 'x');
      try {
        const put = await fetch(`${atD}/dav/free/up.txt`, { method: 'PUT', headers: { authorization: 'Bearer vsmt_x' }, body: 'y' });
        const mk = await fetch(`${atD}/dav/free/newdir`, { method: 'MKCOL', headers: { authorization: 'Bearer vsmt_x' } });
        const cp = await fetch(`${atD}/dav/here.txt`, { method: 'COPY', headers: { authorization: 'Bearer vsmt_x', destination: `${atD}/dav/free/here.txt` } });
        const putT = await put.text();
        check('§17 (small 1) WebDAV: a PUT, a MKCOL and a COPY\'s destination into a machine\'s pull folder that is not mounted are refused (503, the row\'s words) — nothing lands', put.status === 503 && gateOf(/Laptop/.test(putT)) && mk.status === 503 && cp.status === 503 && !fs.existsSync(path.join(mpFree, 'up.txt')) && !fs.existsSync(path.join(mpFree, 'newdir')) && !fs.existsSync(path.join(mpFree, 'here.txt')), JSON.stringify({ put: put.status, putT: putT.slice(0, 120), mk: mk.status, cp: cp.status }));
        MMx.registerPullDoor(null);
        const putC = await fetch(`${atD}/dav/free/up.txt`, { method: 'PUT', headers: { authorization: 'Bearer vsmt_x' }, body: 'y' });
        const landed = fs.existsSync(path.join(mpFree, 'up.txt')); try { fs.rmSync(path.join(mpFree, 'up.txt'), { force: true }); } catch { }
        check('CONTROL §17 (small 1; no door, the release): the same PUT lands in the bare folder (red)', putC.status >= 200 && putC.status < 300 && verdictOf(landed), String(putC.status));
      } finally { MMx.registerPullDoor(null); await new Promise((res) => srvD.close(res)); }
      // the page's words for the codes: the client words each, a zh and a ja row each
      const SB = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src/lib/sidebar-mounts.js'), 'utf8');
      const ZH = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src/lib/i18n-zh.js'), 'utf8'), JA = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src/lib/i18n-ja.js'), 'utf8');
      // B-af94: the words live in ONE table (src/mount-error-words.js) the hub fills in English and the page words through t()
      const MWt = require('../src/mount-error-words.js');
      const keys = [MWt.WORDS.mount_not_empty, ...['who_machine', 'who_removed', 'same_held', 'inside_held', 'over_held'].map((k) => MWt.PARTS[k])];
      check('§17 (small 5) the pull row words its codes in the reader\'s language (not empty; a held row\'s in use, nested both ways, by a named or a removed machine) — a zh and a ja row each; the dot\'s title reads them', keys.length === 6 && gateOf(keys.every((k) => ZH.includes(JSON.stringify(k) + ':') && JA.includes(JSON.stringify(k) + ':'))) && gateOf(/m\.error \? escHtml\(pullErrorText\(m\)\)/.test(SB)) && verdictOf(SB.includes('export function pullErrorText(m) { return mountErrorText(m); }')), JSON.stringify(keys));
      // (4) + the guard over the REAL chain
      const rc = await releasedChain;
      check('§17 A (small 4) the REAL chain: released() is nothing before its teardown, then the lazy unmount\'s promise (ok, one fusermount); a chain told another record holds its folder ends its rclone and KEEPS the folder (kept, no fusermount)', !!(rc.own && rc.own.before === null && rc.own.result === 'ok' && rc.own.fuses === 1 && rc.own.rcloneGone && rc.kept && rc.kept.result === 'kept' && rc.kept.fuses === 0 && rc.kept.rcloneGone), JSON.stringify(rc));
    } finally { process.env.PATH = PATH1; DMX.releaseStale = realRel; DMX.deviceFolderMount = realMount; }
  }
} finally {
  process.env.PATH = PATH0;
  for (const c of kids) { if (c.exitCode === null && c.signalCode === null) { try { c.kill('SIGKILL'); } catch { } } }   // r1 #7: by the handle, only while it runs
  fs.promises.readdir = realReaddir;
  fs.rmSync(tmp, { recursive: true, force: true });
}
if (failed) { console.error(`\ntest-pull-refresh: ${passed} passed, ${failed} failed`); process.exit(1); }
console.log(`\ntest-pull-refresh: ALL PASS (${passed})`); import { verdictOf, gateOf } from './lib/check.mjs';


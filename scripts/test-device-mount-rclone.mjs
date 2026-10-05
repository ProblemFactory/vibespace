#!/usr/bin/env node
// device-folder-mount LAST MILE (2.150.0): a REAL rclone `webdav` mount over
// the device chain (serve-folder → tcp-forward → rclone mount), verifying the
// device's folder is READABLE at a local mountpoint. Requires rclone + /dev/fuse.
// NOTE: never run two copies concurrently — earlier debug runs stomped each
// other's daemons via overlapping pkill patterns and read as a phantom stall.
// Run: node scripts/test-device-mount-rclone.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { execFileSync, spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { endDaemonsAndWait } from './scratch.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(dir, '..');
const RCLONE = path.join(repo, 'data/bin/rclone');
if (!fs.existsSync(RCLONE) || !fs.existsSync('/dev/fuse')) { console.log('SKIP: rclone or /dev/fuse missing'); process.exit(0); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-dmr-'));
process.env.VIBESPACE_AGENTD_ROOT = path.join(tmp, 'agentd');
const dataDir = path.join(tmp, 'data'); fs.mkdirSync(dataDir, { recursive: true });

let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const share = path.join(tmp, 'share'); fs.mkdirSync(path.join(share, 'sub'), { recursive: true });
const CONTENT = 'DEVICE-MOUNT-RCLONE ' + 'Y'.repeat(5000);
fs.writeFileSync(path.join(share, 'hello.txt'), CONTENT);
fs.writeFileSync(path.join(share, '多字节.md'), '# 设备挂载 ✓\n');
fs.writeFileSync(path.join(share, 'sub', 'nested.txt'), 'nested-content-ok');
fs.writeFileSync(path.join(share, 'snap.bin'), 'A'.repeat(8192));
let hasSqlite = true;
try { execFileSync('python3', ['-c', `import sqlite3;c=sqlite3.connect(${JSON.stringify(path.join(share, 'chat.db'))});c.execute('create table m(id integer primary key, body text)');c.executemany('insert into m(body) values (?)',[('old-%04d'%i,) for i in range(200)]);c.commit()`]); } catch { hasSqlite = false; }

const version = require('../package.json').version;
fs.writeFileSync(path.join(repo, 'src/agentd/version.js'), `module.exports = { VERSION: ${JSON.stringify(version)} };\n`);
const bundle = path.join(tmp, 'agentd.js');
execFileSync('npx', ['esbuild', 'src/agentd/agentd.js', '--bundle', '--platform=node', '--external:node-pty', `--outfile=${bundle}`], { cwd: repo });

const { DeviceManager } = require('../src/agentd/client.js');
const { deviceFolderMount } = require('../src/device-mount.js');
const dm = new DeviceManager({ dataDir, bundlePath: bundle, version, log: () => {} });
dm.installLocal();
dm._ensureLocalToken();
const daemon = spawn(process.execPath, [path.join(process.env.VIBESPACE_AGENTD_ROOT, 'current', 'agentd.js')], { detached: true, stdio: 'ignore', env: { ...process.env } });
daemon.unref();
await sleep(700);
await dm.connect();

const mountpoint = path.join(tmp, 'mnt');
let handle = null;
try {
  console.log('— rclone webdav mount over the device chain —');
  handle = await deviceFolderMount({ device: dm, remotePath: share, mountpoint, rcloneBin: RCLONE, log: () => {} });
  check('mount came up', !!handle.mountpoint, JSON.stringify(handle));
  await sleep(800);

  console.log('— the device folder is readable at the mountpoint —');
  // ALL mount IO below runs in ASYNC child processes — the tunnel BRIDGE lives
  // in THIS process, so any sync fs/exec on the mountpoint blocks the event
  // loop, the bridge stops pumping, and the FUSE read never completes: the
  // test deadlocks ITSELF (readFileSync here hung the whole run; same class as
  // the 2.147.0 sync-exec-with-in-process-/dav deadlock). Production is safe —
  // the bridge lives in the server while reads come from other processes.
  const run = (cmd, args) => new Promise((resolve, reject) => {
    const c = spawn(cmd, args);
    const out = []; c.stdout.on('data', (d) => out.push(d));
    const t = setTimeout(() => { try { c.kill('SIGKILL'); } catch {} reject(new Error(cmd + ' timed out (10s) — mount read stalled')); }, 10000);
    c.on('exit', () => { clearTimeout(t); resolve(Buffer.concat(out)); });
    c.on('error', (e) => { clearTimeout(t); reject(e); });
  });
  const ls = (await run('ls', [mountpoint])).toString('utf8');
  check('root lists the device files', ls.includes('hello.txt') && ls.includes('sub'), JSON.stringify(ls));
  const t0 = Date.now();
  const cat = (await run('cat', [path.join(mountpoint, 'hello.txt')])).toString('utf8');
  const readMs = Date.now() - t0;
  check('file content byte-exact through the mount', cat === CONTENT, `len ${cat.length} vs ${CONTENT.length}`);
  check(`read is FAST (${readMs}ms) — the http-backend ~6s stall is gone`, readMs < 3000, `${readMs}ms`);
  const nested = (await run('cat', [path.join(mountpoint, 'sub', 'nested.txt')])).toString('utf8');
  check('nested subdirectory file readable', nested === 'nested-content-ok', JSON.stringify(nested));
  const mb = (await run('ls', [mountpoint])).toString('utf8');
  check('multibyte filename listed', mb.includes('多字节.md'), JSON.stringify(mb));
  // partial read (VFS seeks mid-file)
  const seek = (await run('dd', [`if=${path.join(mountpoint, 'hello.txt')}`, 'bs=1', 'skip=100', 'count=10', 'status=none'])).toString('utf8');
  check('mid-file seek read correct', seek === CONTENT.slice(100, 110), JSON.stringify(seek));

  // B-35e3 (2.369.202): a same-size in-place rewrite on the device must reach
  // a reader that keeps the file OPEN (a kept-open SQLite connection) and any
  // (size, mtime) reader — base: the held reader served cached pages forever
  // and the mount's mtime stayed pinned to the mount time (--no-modtime).
  console.log('— a same-size rewrite reaches held readers within the poll interval (B-35e3) —');
  const snap = path.join(mountpoint, 'snap.bin');
  const holder = (code) => {
    const c = spawn('python3', ['-u', '-c', code], { stdio: ['pipe', 'pipe', 'ignore'] });
    const ask = () => new Promise((r) => { c.stdout.once('data', (d) => r(d.toString().trim())); c.stdin.write('x\n'); });
    return { c, ask };
  };
  const heldFd = holder(`import sys,os\nf=os.open(${JSON.stringify(snap)},os.O_RDONLY)\nfor line in sys.stdin:\n  print(os.pread(f,4,0).decode(),flush=True)`);
  const heldDb = hasSqlite ? holder(`import sys,sqlite3\nc=sqlite3.connect('file:'+${JSON.stringify(path.join(mountpoint, 'chat.db'))}+'?mode=ro',uri=True)\nfor line in sys.stdin:\n  print(c.execute('select body from m where id=7').fetchone()[0],flush=True)`) : null;
  try {
    check('held fd reads the first version', (await heldFd.ask()) === 'AAAA');
    if (heldDb) check('kept-open sqlite connection reads the first version', (await heldDb.ask()) === 'old-0006');
    const mtime0 = (await run('stat', ['-c', '%Y', snap])).toString().trim();
    await sleep(8000); // the refresher has found the held files and settled
    // re-read through the held handles: the first version is cached again
    check('held fd still reads the first version', (await heldFd.ask()) === 'AAAA');
    if (heldDb) check('kept-open connection still reads the first version', (await heldDb.ask()) === 'old-0006');
    const w = fs.openSync(path.join(share, 'snap.bin'), 'r+'); fs.writeSync(w, Buffer.from('B'.repeat(8192)), 0, 8192, 0); fs.closeSync(w);
    if (heldDb) execFileSync('python3', ['-c', `import sqlite3;c=sqlite3.connect(${JSON.stringify(path.join(share, 'chat.db'))});c.execute("update m set body='new-0007' where id=7");c.commit()`]);
    check('the device rewrite kept both sizes', fs.statSync(path.join(share, 'snap.bin')).size === 8192);
    // poll ONLY through the held handles — no fresh open of either file (an
    // open drops the pages by itself and would hide the bug)
    const t0c = Date.now(); let seenFd = '', seenDb = heldDb ? '' : 'new-0007';
    while (Date.now() - t0c < 15000 && (seenFd !== 'BBBB' || seenDb !== 'new-0007')) {
      await sleep(500);
      if (seenFd !== 'BBBB') seenFd = await heldFd.ask();
      if (seenDb !== 'new-0007') seenDb = await heldDb.ask();
    }
    const tookMs = Date.now() - t0c;
    check(`held fd sees the rewrite (${tookMs}ms, tick 5s)`, seenFd === 'BBBB', `still ${JSON.stringify(seenFd)} after ${tookMs}ms`);
    if (heldDb) check('kept-open sqlite connection sees the updated row', seenDb === 'new-0007', `still ${JSON.stringify(seenDb)}`);
    // the listing (dir-cache 5s) + kernel attrs (1s) carry the device mtime
    const devS = String(Math.floor(fs.statSync(path.join(share, 'snap.bin')).mtimeMs / 1000));
    let mtime1 = mtime0; const t0m = Date.now();
    while (Date.now() - t0m < 10000 && mtime1 !== devS) { await sleep(500); mtime1 = (await run('stat', ['-c', '%Y', snap])).toString().trim(); }
    check('the mount reports the DEVICE mtime (not the mount time)', mtime1 === devS && mtime1 !== mtime0, `mount ${mtime0}→${mtime1}, device ${devS}`);
    check('a fresh read sees the rewrite', (await run('head', ['-c', '4', snap])).toString() === 'BBBB');
    // never "fixed" by --direct-io: that breaks MAP_SHARED mmap with ENODEV
    const mm = (await run('python3', ['-c', `import mmap,os\nf=os.open(${JSON.stringify(snap)},os.O_RDONLY)\nprint(mmap.mmap(f,0,access=mmap.ACCESS_READ)[:4].decode())`])).toString().trim();
    check('shared mmap of a mount file still works', mm === 'BBBB', mm);
  } finally {
    for (const hh of [heldFd, heldDb]) { try { hh && hh.c.kill(); } catch {} }
  }
} catch (e) {
  failed++; console.error('  ✗ device mount threw:', e.message);
} finally {
  if (handle) { try { await handle.teardown(); } catch {} await sleep(1000); }
  endDaemonsAndWait(process.env.VIBESPACE_AGENTD_ROOT);
  dm.stop();
  execFileSync('node', ['-e', `require('fs').writeFileSync('src/agentd/version.js', 'module.exports = { VERSION: ' + JSON.stringify(require('./package.json').version) + ' };\\n')`], { cwd: repo });
  try { execSync(`fusermount -uz ${JSON.stringify(mountpoint)} 2>/dev/null`); } catch {}
  fs.rmSync(tmp, { recursive: true, force: true });
}
if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\ndevice-folder-mount rclone last-mile passed — a device folder is readable via a real mount');
process.exit(0);

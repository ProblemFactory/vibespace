#!/usr/bin/env node
// device-folder-mount LAST MILE (2.150.0): a REAL rclone `http` mount over the
// device chain (serve-folder → tcp-forward → rclone mount), verifying the
// device's folder is READABLE at a local mountpoint. Requires rclone + /dev/fuse.
// Run: node scripts/test-device-mount-rclone.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { execFileSync, spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  console.log('— rclone http mount over the device chain —');
  handle = await deviceFolderMount({ device: dm, remotePath: share, mountpoint, rcloneBin: RCLONE, log: () => {} });
  check('mount came up', !!handle.mountpoint, JSON.stringify(handle));
  await sleep(800);

  console.log('— the device folder is readable at the mountpoint —');
  const ls = execSync(`ls ${JSON.stringify(mountpoint)}`, { encoding: 'utf8' });
  check('root lists the device files', ls.includes('hello.txt') && ls.includes('sub'), JSON.stringify(ls));
  const cat = fs.readFileSync(path.join(mountpoint, 'hello.txt'), 'utf8');
  check('file content byte-exact through the mount', cat === CONTENT, `len ${cat.length} vs ${CONTENT.length}`);
  const nested = fs.readFileSync(path.join(mountpoint, 'sub', 'nested.txt'), 'utf8');
  check('nested subdirectory file readable', nested === 'nested-content-ok', JSON.stringify(nested));
  const mb = execSync(`ls ${JSON.stringify(mountpoint)}`, { encoding: 'utf8' });
  check('multibyte filename listed', mb.includes('多字节.md'), JSON.stringify(mb));
  // partial read (VFS seeks mid-file)
  const fd = fs.openSync(path.join(mountpoint, 'hello.txt'), 'r');
  const buf = Buffer.alloc(10); fs.readSync(fd, buf, 0, 10, 100); fs.closeSync(fd);
  check('mid-file seek read correct', buf.toString() === CONTENT.slice(100, 110), JSON.stringify(buf.toString()));
} catch (e) {
  failed++; console.error('  ✗ device mount threw:', e.message);
} finally {
  if (handle) { try { await handle.teardown(); } catch {} await sleep(1000); }
  try { const dpid = Number(fs.readFileSync(path.join(process.env.VIBESPACE_AGENTD_ROOT, 'state', 'agentd.pid'), 'utf8')); process.kill(dpid, 'SIGTERM'); } catch {}
  dm.stop();
  execFileSync('node', ['-e', `require('fs').writeFileSync('src/agentd/version.js', 'module.exports = { VERSION: ' + JSON.stringify(require('./package.json').version) + ' };\\n')`], { cwd: repo });
  try { execSync(`fusermount -uz ${JSON.stringify(mountpoint)} 2>/dev/null`); } catch {}
  fs.rmSync(tmp, { recursive: true, force: true });
}
if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\ndevice-folder-mount rclone last-mile passed — a device folder is readable via a real mount');
process.exit(0);

#!/usr/bin/env node
// REVERSE MOUNT e2e (2.147.0, "互挂云盘" direction B): a real remote host
// (AIDev) mounts THIS VibeSpace's storage over the WebDAV bridge, OS-aware.
// Stands up a throwaway /dav server on a tailnet-reachable address, mints a
// scoped token, drives MachineMounts.mountPush against the real host over ssh,
// then verifies (independent ssh) that this instance's files APPEAR in the
// mountpoint on the remote and are readable — then unmounts + cleans up.
// Usage: node scripts/test-host-mounts.mjs <hostId> [publicHost]
//   publicHost = the address the remote uses to reach us (default: Tailscale
//   IP 100.87.42.107). Requires the remote to have /dev/fuse + curl + unzip.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import express from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileP = promisify(execFile);
const sshRun = async (args, timeout = 20000) => { try { const { stdout } = await execFileP('ssh', args, { encoding: 'utf-8', timeout }); return stdout; } catch (e) { return (e.stdout || '') + (e.stderr || e.message || ''); } };
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(dir, '..');
const hostId = process.argv[2];
const publicHost = process.argv[3] || '100.87.42.107';
if (!hostId) { console.error('usage: test-host-mounts.mjs <hostId> [publicHost]'); process.exit(2); }

let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { MountTokens, registerWebdav } = require('../src/webdav.js');
const { MachineMounts } = require('../src/machine-mounts.js');
const { HostManager } = require('../src/hosts.js');

// fixture: a folder with a known file that should appear on the remote
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-hm-'));
const shareDir = path.join(tmp, 'shared');
fs.mkdirSync(shareDir);
const MARK = 'VIBESPACE-REVERSE-MOUNT-' + Date.now();
fs.writeFileSync(path.join(shareDir, 'hello.txt'), MARK + '\n');
fs.writeFileSync(path.join(shareDir, '多字节.md'), '# 互挂云盘 ✓\n');

// throwaway /dav server on 0.0.0.0 (tailnet-reachable)
const tokens = new MountTokens({ dataDir: tmp });
const app = express();
registerWebdav(app, { tokens });
const srv = await new Promise((r) => { const s = app.listen(0, '0.0.0.0', () => r(s)); });
const PORT = srv.address().port;
console.log(`/dav test server on ${publicHost}:${PORT}, sharing ${shareDir}`);

const hosts = new HostManager({ dataDir: path.join(repo, 'data') });
hosts.dataPlaneOn = () => false; // use plain ssh for this test (data-plane path is covered by test-agentd-switchover)
const hm = new MachineMounts({
  dataDir: tmp, hosts, mountTokens: tokens,
  publicUrl: () => `http://${publicHost}:${PORT}`,
  broadcast: () => {},
});

let mountId = null;
try {
  console.log('— reverse mount this instance onto the remote host —');
  const r = await hm.mountPush(hostId, { folder: shareDir, mode: 'ro' });
  mountId = r.id;
  check('mount reported success', !!r.mountpoint, JSON.stringify(r));
  console.log(`    os=${r.os} method=${r.method} mp=${r.mountpoint}`);
  await sleep(2500); // rclone mount + first dir listing

  // independent ssh probe: our file must be visible + readable ON THE REMOTE
  const h = hosts.get(hostId);
  // verify over a FRESH ssh (no ControlMaster) — the in-test HostMounts uses
  // its own multiplex master; sharing the socket in one process contended.
  const sshBase = hosts.sshArgs(h, { multiplex: false });
  const ls = await sshRun([...sshBase, '--', `ls ${JSON.stringify(r.mountpoint)} 2>&1`]);
  check('this instance\'s files appear in the remote mountpoint', ls.includes('hello.txt'), JSON.stringify(ls.slice(0, 200)));
  const cat = await sshRun([...sshBase, '--', `cat ${JSON.stringify(r.mountpoint + '/hello.txt')} 2>&1`]);
  check('remote reads our file content through the mount', cat.includes(MARK), JSON.stringify(cat.slice(0, 120)));
  const cat2 = await sshRun([...sshBase, '--', `cat ${JSON.stringify(r.mountpoint + '/多字节.md')} 2>&1`]);
  check('multibyte filename + content readable', cat2.includes('互挂云盘'), JSON.stringify(cat2.slice(0, 120)));

  console.log('— unmount cleans up on the remote —');
  await hm.unmount(mountId);
  mountId = null;
  await sleep(1500);
  const gone = await sshRun([...sshBase, '--', `ls ${JSON.stringify(r.mountpoint)} 2>&1; echo "---"; mount 2>/dev/null | grep -c ${JSON.stringify(r.mountpoint)} || true`]);
  check('mount removed (mountpoint empty / not in mount table)', !gone.includes('hello.txt') || gone.trim().endsWith('0'), JSON.stringify(gone.slice(-80)));
} catch (e) {
  failed++;
  console.error('  ✗ reverse mount threw:', e.message);
} finally {
  if (mountId) { try { await hm.unmount(mountId); } catch { } }
  srv.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nall reverse-mount tests passed');
process.exit(0);

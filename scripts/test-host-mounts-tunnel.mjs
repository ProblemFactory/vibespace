#!/usr/bin/env node
// REVERSE MOUNT over the AGENTD TUNNEL — real host, NO public/Tailscale
// address (2.148.0, user directive "不应该通过tailscale"). The definitive
// proof: our /dav server binds 127.0.0.1 ONLY — no external address can reach
// it. The remote host still mounts our folder, because the bytes ride the
// agentd device link (ssh-stdio here) back to our loopback port. If this
// passes, reverse-mount is genuinely NAT-traversing, not address-dependent.
//
// Steps: install+connect agentd on the host (dataPlane ON) → stand up /dav on
// 127.0.0.1 → MachineMounts.mountPush (must pick via='tunnel') → independent
// ssh verifies our files appear + read through the mount → unmount + cleanup.
// Usage: node scripts/test-host-mounts-tunnel.mjs <hostId>
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import express from 'express';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
const execFileP = promisify(execFile);
const sshRun = async (args, timeout = 25000) => { try { const { stdout } = await execFileP('ssh', args, { encoding: 'utf-8', timeout }); return stdout; } catch (e) { return (e.stdout || '') + (e.stderr || e.message || ''); } };
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(dir, '..');
const hostId = process.argv[2];
if (!hostId) { console.error('usage: test-host-mounts-tunnel.mjs <hostId>'); process.exit(2); }

let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { MountTokens, registerWebdav } = require('../src/webdav.js');
const { MachineMounts } = require('../src/machine-mounts.js');
const { HostManager } = require('../src/hosts.js');

// ensure a fresh agentd bundle exists
const version = require('../package.json').version;
execFileSync('npm', ['run', 'build:agentd'], { cwd: repo, stdio: 'ignore' });

// wire the data-plane deps exactly as server.js does, FORCED ON
const hosts = new HostManager({ dataDir: path.join(repo, 'data') });
const tokDir = path.join(repo, 'data', 'agentd'); fs.mkdirSync(tokDir, { recursive: true });
function tokenFor(id) {
  const f = path.join(tokDir, 'host-' + id + '.token');
  try { return fs.readFileSync(f, 'utf-8').trim(); } catch { }
  const t = 'vsht_' + require('crypto').randomBytes(24).toString('hex');
  fs.writeFileSync(f, t, { mode: 0o600 });
  return t;
}
hosts.agentdDeps = {
  ensureAgentdOnHost: async (id) => hosts.installAgentd(id, path.join(repo, 'data/bin/vibespace-agentd.js'), version, tokenFor(id)),
  agentdHostToken: (id) => tokenFor(id),
  bundlePath: path.join(repo, 'data/bin/vibespace-agentd.js'),
  version,
};
hosts.dataPlaneOn = () => true;

// fixture
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-hmt-'));
const shareDir = path.join(tmp, 'shared'); fs.mkdirSync(shareDir);
const MARK = 'VIBESPACE-TUNNEL-MOUNT-' + Date.now();
fs.writeFileSync(path.join(shareDir, 'hello.txt'), MARK + '\n');
fs.writeFileSync(path.join(shareDir, '多字节.md'), '# 隧道挂载 ✓\n');

// /dav on 127.0.0.1 ONLY — NO external address can reach this.
const tokens = new MountTokens({ dataDir: tmp });
const app = express();
registerWebdav(app, { tokens });
const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const PORT = srv.address().port;
console.log(`/dav bound to 127.0.0.1:${PORT} ONLY (no external address) — sharing ${shareDir}`);

const hm = new MachineMounts({
  dataDir: tmp, hosts, mountTokens: tokens,
  publicUrl: () => null,       // NO public URL — tunnel is the only path
  localPort: () => PORT,       // the tunnel target = our loopback /dav
  broadcast: () => {},
});

let mountId = null;
try {
  console.log('— connect agentd on the host (dataPlane ON) —');
  const dm = await hosts.device(hostId);
  check('agentd connected on the host', !!dm.status().info, JSON.stringify(dm.status().info?.daemonVersion));

  console.log('— reverse mount THROUGH THE TUNNEL (no public address) —');
  const r = await hm.mountPush(hostId, { folder: shareDir, mode: 'ro' });
  mountId = r.id;
  check('mount succeeded', !!r.mountpoint, JSON.stringify(r));
  check('transport is the TUNNEL (not a public address)', r.via === 'tunnel', JSON.stringify(r.via));
  console.log(`    os=${r.os} method=${r.method} mp=${r.mountpoint} via=${r.via}`);
  await sleep(3000); // rclone mount + first listing

  const h = hosts.get(hostId);
  const sshBase = hosts.sshArgs(h, { multiplex: false });
  const ls = await sshRun([...sshBase, '--', `ls ${JSON.stringify(r.mountpoint)} 2>&1`]);
  check('our files appear on the remote (through 127.0.0.1-only /dav)', ls.includes('hello.txt'), JSON.stringify(ls.slice(0, 200)));
  const cat = await sshRun([...sshBase, '--', `cat ${JSON.stringify(r.mountpoint + '/hello.txt')} 2>&1`]);
  check('remote reads our content over the tunnel', cat.includes(MARK), JSON.stringify(cat.slice(0, 120)));
  const cat2 = await sshRun([...sshBase, '--', `cat ${JSON.stringify(r.mountpoint + '/多字节.md')} 2>&1`]);
  check('multibyte filename + content over the tunnel', cat2.includes('隧道挂载'), JSON.stringify(cat2.slice(0, 120)));

  console.log('— unmount cleans up + releases the device port —');
  await hm.unmount(mountId);
  mountId = null;
  await sleep(1500);
  const gone = await sshRun([...sshBase, '--', `ls ${JSON.stringify(r.mountpoint)} 2>&1; echo ---; mount 2>/dev/null | grep -c ${JSON.stringify(r.mountpoint)} || true`]);
  check('mount removed on the remote', !gone.includes('hello.txt') || gone.trim().endsWith('0'), JSON.stringify(gone.slice(-80)));

  dm.stop();
} catch (e) {
  failed++;
  console.error('  ✗ tunnel reverse mount threw:', e.message, e.stack?.split('\n')[1] || '');
} finally {
  if (mountId) { try { await hm.unmount(mountId); } catch { } }
  srv.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nall tunnel reverse-mount tests passed (127.0.0.1-only /dav reached the remote — NAT-proof, no Tailscale)');
process.exit(0);

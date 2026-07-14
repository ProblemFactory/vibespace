#!/usr/bin/env node
// DEBUG probe: stand up the agentd daemon + serve-folder and KEEP IT ALIVE,
// printing the device port (direct 127.0.0.1) and a bridged port, so the
// WebDAV subset can be exercised with curl / rclone without FUSE.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(dir, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-davdbg-'));
process.env.VIBESPACE_AGENTD_ROOT = path.join(tmp, 'agentd');
const dataDir = path.join(tmp, 'data'); fs.mkdirSync(dataDir, { recursive: true });

const share = path.join(tmp, 'share'); fs.mkdirSync(path.join(share, 'sub'), { recursive: true });
fs.writeFileSync(path.join(share, 'hello.txt'), 'DEVICE-MOUNT-RCLONE ' + 'Y'.repeat(5000));
fs.writeFileSync(path.join(share, 'sub', 'nested.txt'), 'nested-content-ok');

const version = require('../package.json').version;
const bundle = path.join(tmp, 'agentd.js');
execFileSync('npx', ['esbuild', 'src/agentd/agentd.js', '--bundle', '--platform=node', '--external:node-pty', `--outfile=${bundle}`], { cwd: repo, stdio: 'ignore' });

const { DeviceManager } = require('../src/agentd/client.js');
const dm = new DeviceManager({ dataDir, bundlePath: bundle, version, log: () => {} });
dm.installLocal();
dm._ensureLocalToken();
const daemon = spawn(process.execPath, [path.join(process.env.VIBESPACE_AGENTD_ROOT, 'current', 'agentd.js')], { detached: true, stdio: 'ignore', env: { ...process.env } });
daemon.unref();
await new Promise((r) => setTimeout(r, 700));
await dm.connect();

const sf = await dm.serveFolder(share);
console.log('DEVICE_PORT=' + sf.port);

// bridge (same code shape as device-mount.js)
const bridge = net.createServer({ allowHalfOpen: true }, async (sock) => {
  sock.on('error', () => {});
  sock.on('end', () => {});
  const early = [];
  const onEarly = (d) => early.push(d);
  sock.on('data', onEarly);
  let fwd;
  try { fwd = await dm.tcpForward(sf.port); } catch { try { sock.destroy(); } catch {} return; }
  fwd.onData = (b) => { try { sock.write(b); } catch {} };
  fwd.onClose = () => { try { sock.end(); } catch {} };
  sock.off('data', onEarly);
  for (const d of early) fwd.write(d);
  sock.on('data', (d) => fwd.write(d));
  sock.on('close', () => { try { fwd.close(); } catch {} });
});
const bridgePort = await new Promise((res) => bridge.listen(0, '127.0.0.1', () => res(bridge.address().port)));
console.log('BRIDGE_PORT=' + bridgePort);
console.log('TMP=' + tmp);
console.log('READY');
// stay alive until killed
setInterval(() => {}, 60000);

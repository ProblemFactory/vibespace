// deviceFolderMount (2.150.0) — mount a DEVICE's folder into VibeSpace over the
// agentd link. The device serves the folder over HTTP on its own loopback
// (serve-folder); we tcp-forward that port to OUR loopback via the mux, then
// rclone-`http`-mount it (read-only). NAT-proof: the bytes ride the device
// link (ssh-stdio or wss dial-out) — no inbound to the device, no public
// address. Used by MountManager's 'device' mount type and the acceptance test.
'use strict';

const net = require('net');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/**
 * @param {object} o
 *  device       a connected DeviceManager (hosts.device(id) or deviceForDial(id))
 *  remotePath   absolute folder ON THE DEVICE to serve
 *  mountpoint   local dir to mount at
 *  rcloneBin    path to the rclone binary
 *  vfsCacheDir  optional per-mount vfs cache dir
 *  log          logger
 * @returns {Promise<{ mountpoint, devicePort, bridgePort, teardown }>}
 */
async function deviceFolderMount({ device, remotePath, mountpoint, rcloneBin, vfsCacheDir, log = () => {} }) {
  // 1) ask the device to serve the folder over HTTP on its own loopback
  const sf = await device.serveFolder(remotePath);
  if (!sf || !sf.port) throw new Error('device serve-folder failed: ' + (sf && sf.error || 'no port'));
  const devicePort = sf.port;

  // 2) bridge a LOCAL loopback port → tcp-forward → the device's HTTP server.
  // One tcpForward per accepted connection (rclone http opens several).
  // allowHalfOpen:true is LOAD-BEARING: curl / rclone (Go http) half-close
  // their WRITE side (FIN) right after sending a GET. With the default
  // (false), Node auto-ends our writable side on that FIN — so the HTTP
  // response, which the folder server writes a tick later, has nowhere to go
  // and the client times out with 0 bytes. Node's own http client keeps the
  // socket fully open (keep-alive), which is why it worked and curl didn't.
  const bridge = net.createServer({ allowHalfOpen: true }, async (sock) => {
    sock.on('error', () => {});
    sock.on('end', () => {}); // peer half-closed; keep writing the response
    // CRITICAL: attach a data listener IMMEDIATELY (before the async
    // tcpForward round-trip) and buffer early bytes. A client that writes its
    // request the instant it connects (curl, rclone/Go, nc) would otherwise
    // lose those bytes during the await — a paused socket does NOT reliably
    // buffer a burst that arrives before any read mechanism, so the request
    // never reached the device and the response never came (real bug: Node
    // http.request worked because it sends a tick later; curl/rclone didn't).
    const early = [];
    const onEarly = (d) => early.push(d);
    sock.on('data', onEarly);
    let fwd;
    try { fwd = await device.tcpForward(devicePort); }
    catch { try { sock.destroy(); } catch {} return; }
    fwd.onData = (b) => { try { sock.write(b); } catch {} };
    fwd.onClose = () => { try { sock.end(); } catch {} };
    sock.off('data', onEarly);
    for (const d of early) fwd.write(d);
    sock.on('data', (d) => fwd.write(d));
    sock.on('close', () => { try { fwd.close(); } catch {} });
  });
  bridge.on('error', () => {});
  const bridgePort = await new Promise((resolve, reject) => {
    bridge.on('error', reject);
    bridge.listen(0, '127.0.0.1', () => resolve(bridge.address().port));
  });

  // 3) rclone http mount the bridge (read-only). http backend reads the
  // directory-listing HTML + ranged GETs the daemon serves.
  fs.mkdirSync(mountpoint, { recursive: true });
  const env = {
    ...process.env,
    RCLONE_CONFIG_VSDEV_TYPE: 'http',
    RCLONE_CONFIG_VSDEV_URL: `http://127.0.0.1:${bridgePort}`,
  };
  const args = ['mount', 'vsdev:', mountpoint, '--read-only', '--dir-cache-time', '5s',
    '--vfs-cache-mode', 'full', '--timeout', '30s', '--contimeout', '10s',
    '--no-modtime', '--attr-timeout', '1s',
    // rclone's default 128M read chunk asks for a range far past small files;
    // the clamped 206 response makes its http backend stall. A small starting
    // chunk keeps ranged reads tight; full cache mode then serves from disk.
    '--vfs-read-chunk-size', '128k', '--vfs-read-chunk-size-limit', '0'];
  if (vfsCacheDir) { args.push('--cache-dir', vfsCacheDir); }
  const rc = spawn(rcloneBin, args, { env, detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  rc.stderr.on('data', (d) => { stderr += d.toString().slice(0, 2000); });
  rc.unref();

  // wait for the mount to appear (rclone forks; poll the mountpoint)
  const ok = await waitMounted(mountpoint, 8000);
  if (!ok) {
    try { process.kill(-rc.pid, 'SIGKILL'); } catch {}
    try { bridge.close(); } catch {}
    try { await device.unserveFolder(devicePort); } catch {}
    throw new Error('rclone http mount did not come up: ' + (stderr.slice(-300) || 'timeout'));
  }
  log(`device folder ${remotePath} mounted at ${mountpoint} (device:${devicePort} ↔ bridge:${bridgePort})`);

  const teardown = async () => {
    try { spawn('fusermount', ['-uz', mountpoint]); } catch {}
    setTimeout(() => { try { process.kill(rc.pid, 'SIGTERM'); } catch {} }, 300);
    setTimeout(() => { try { bridge.close(); } catch {} }, 500);
    try { await device.unserveFolder(devicePort); } catch {}
  };
  return { mountpoint, devicePort, bridgePort, teardown };
}

function waitMounted(mp, timeoutMs) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      // a child `ls` (never node fs — a wedged fuse mount hangs the thread pool)
      const c = spawn('ls', [mp], { stdio: 'ignore' });
      c.on('exit', (code) => { if (code === 0) return resolve(true); retry(); });
      c.on('error', retry);
    };
    const retry = () => { if (Date.now() - t0 > timeoutMs) return resolve(false); setTimeout(tick, 250); };
    setTimeout(tick, 300);
  });
}

module.exports = { deviceFolderMount };

#!/usr/bin/env node
// device-folder-mount CHAIN acceptance (2.150.0): the daemon serves a folder
// over WEBDAV on 127.0.0.1 (serve-folder), the server reaches it through the
// mux via tcp-forward, and a DAV client does PROPFIND listings + ranged file
// GETs — the exact path an rclone `webdav` mount takes. Proves the
// device-side serve + the tunnel together (the rclone mount is the last mile).
// Run: node scripts/test-agentd-devicemount.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(dir, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-dm-'));
process.env.VIBESPACE_AGENTD_ROOT = path.join(tmp, 'agentd');
const dataDir = path.join(tmp, 'data'); fs.mkdirSync(dataDir, { recursive: true });

let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// fixture folder with a subdir + a file with known ranged content
const share = path.join(tmp, 'share'); fs.mkdirSync(path.join(share, 'sub'), { recursive: true });
const CONTENT = 'device-folder-mount 内容🎯 ' + 'X'.repeat(2000);
fs.writeFileSync(path.join(share, 'hello.txt'), CONTENT);
fs.writeFileSync(path.join(share, '多字节.md'), '# device mount ✓\n');
fs.writeFileSync(path.join(share, 'sub', 'nested.txt'), 'nested-ok');

const version = require('../package.json').version;
fs.writeFileSync(path.join(repo, 'src/agentd/version.js'), `module.exports = { VERSION: ${JSON.stringify(version)} };\n`);
const bundle = path.join(tmp, 'agentd.js');
execFileSync('npx', ['esbuild', 'src/agentd/agentd.js', '--bundle', '--platform=node', '--external:node-pty', `--outfile=${bundle}`], { cwd: repo });

const { DeviceManager } = require('../src/agentd/client.js');
const dm = new DeviceManager({ dataDir, bundlePath: bundle, version, log: () => {} });
dm.installLocal();
dm._ensureLocalToken();
const daemon = spawn(process.execPath, [path.join(process.env.VIBESPACE_AGENTD_ROOT, 'current', 'agentd.js')], { detached: true, stdio: 'ignore', env: { ...process.env } });
daemon.unref();
await sleep(700);
await dm.connect();

// helper: HTTP request through a tcp-forward bridge to the device's folder server
async function httpThroughTunnel(devicePort, reqPath, headers = {}, method = 'GET') {
  // local bridge: a net.Server that pipes each connection to a fresh tcpForward
  const bridge = net.createServer(async (sock) => {
    sock.on('error', () => { });
    let fwd;
    try { fwd = await dm.tcpForward(devicePort); }
    catch { try { sock.destroy(); } catch { } return; } // port gone (post-unserve)
    fwd.onData = (b) => { try { sock.write(b); } catch { } };
    fwd.onClose = () => { try { sock.end(); } catch { } };
    sock.on('data', (d) => fwd.write(d));
    sock.on('close', () => fwd.close());
  });
  await new Promise((r) => bridge.listen(0, '127.0.0.1', r));
  const lp = bridge.address().port;
  const out = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: lp, path: reqPath, method, headers }, (res) => {
      const chunks = []; res.on('data', (d) => chunks.push(d)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject); req.end();
  });
  bridge.close();
  return out;
}

console.log('— serve-folder binds a device-side HTTP server —');
const sf = await dm.serveFolder(share);
check('serve-folder returned a port', sf.port > 0, JSON.stringify(sf));

console.log('— PROPFIND listings through the tunnel (rclone webdav backend shape) —');
{
  const r = await httpThroughTunnel(sf.port, '/', { Depth: '1' }, 'PROPFIND');
  const xml = r.body.toString('utf8');
  check('root PROPFIND served (207 + entries)', r.status === 207
    && /<D:displayname>hello.txt<\/D:displayname>/.test(xml)
    && /<D:href>\/sub\/<\/D:href>/.test(xml) && /<D:collection\/>/.test(xml), JSON.stringify(xml.slice(0, 240)));
  const rs = await httpThroughTunnel(sf.port, '/sub/', { Depth: '1' }, 'PROPFIND');
  check('subdirectory PROPFIND served', rs.status === 207 && /<D:displayname>nested.txt<\/D:displayname>/.test(rs.body.toString()), JSON.stringify(rs.body.toString().slice(0, 160)));
  const opt = await httpThroughTunnel(sf.port, '/', {}, 'OPTIONS');
  check('OPTIONS advertises DAV', opt.status === 200 && String(opt.headers.dav || '').includes('1'), JSON.stringify(opt.headers.dav));
  const dirGet = await httpThroughTunnel(sf.port, '/sub/');
  check('GET on a directory refused (list via PROPFIND)', dirGet.status === 403, String(dirGet.status));
}

console.log('— full file GET byte-exact (incl multibyte) —');
{
  const r = await httpThroughTunnel(sf.port, '/hello.txt');
  check('full GET byte-exact', r.status === 200 && r.body.toString('utf8') === CONTENT, `len ${r.body.length} vs ${Buffer.byteLength(CONTENT)}`);
  check('Accept-Ranges advertised (rclone needs it)', r.headers['accept-ranges'] === 'bytes', JSON.stringify(r.headers['accept-ranges']));
}

console.log('— ranged GET (the VFS read pattern) —');
{
  const r = await httpThroughTunnel(sf.port, '/hello.txt', { Range: 'bytes=10-19' });
  const expect = Buffer.from(CONTENT).subarray(10, 20);
  check('206 partial content, exact 10 bytes', r.status === 206 && r.body.equals(expect), `got ${r.body.length}b status ${r.status}`);
  const cr = r.headers['content-range'];
  check('Content-Range header correct', cr === `bytes 10-19/${Buffer.byteLength(CONTENT)}`, JSON.stringify(cr));
}

console.log('— traversal blocked —');
{
  const r = await httpThroughTunnel(sf.port, '/../../etc/passwd');
  check('path traversal refused (403/404, no leak)', (r.status === 403 || r.status === 404) && !/root:/.test(r.body.toString()), String(r.status));
}

console.log('— unserve-folder frees the device port —');
{
  await dm.unserveFolder(sf.port);
  await sleep(300);
  let gone = false;
  try { const r = await httpThroughTunnel(sf.port, '/'); gone = !r.body.length || r.status >= 500; } catch { gone = true; }
  check('folder server torn down (port no longer serves)', gone, 'still served after unserve');
}

try { const dpid = Number(fs.readFileSync(path.join(process.env.VIBESPACE_AGENTD_ROOT, 'state', 'agentd.pid'), 'utf8')); process.kill(dpid, 'SIGTERM'); } catch { }
dm.stop();
execFileSync('node', ['-e', `require('fs').writeFileSync('src/agentd/version.js', 'module.exports = { VERSION: ' + JSON.stringify(require('./package.json').version) + ' };\\n')`], { cwd: repo });
fs.rmSync(tmp, { recursive: true, force: true });
if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nall device-folder-mount chain tests passed');
process.exit(0);

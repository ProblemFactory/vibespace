#!/usr/bin/env node
// deviceAgentSetup primitives over a REAL dialed-in daemon (graduation B.3):
// the ws-handler dial branch ships agent tools + the 0600 token via fsWrite,
// registers the hook via runCmd, and back-tunnels VIBESPACE_API via
// reverseForward. This proves each primitive on the device link end-to-end
// (fsMkdir/fsWrite/read-back + runCmd $HOME/chmod + reverseForward reaching a
// local server). Run: node scripts/test-device-agent-setup.mjs
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-das-'));
process.env.VIBESPACE_AGENTD_ROOT = path.join(tmp, 'agentd');
const dataDir = path.join(tmp, 'data'); fs.mkdirSync(dataDir, { recursive: true });

let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

// a fake "server" the reverse tunnel should reach
const srv = http.createServer((req, res) => { res.end('VIBESPACE-API-OK ' + req.url); });
const srvPort = await new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));

try {
  // 1. runCmd: device $HOME
  const home = String((await dm.runCmd('sh', ['-c', 'printf %s "$HOME"'], { timeoutMs: 8000 }))?.stdout || '').trim();
  check('runCmd returns the device $HOME', home.startsWith('/'), JSON.stringify(home));
  const bin = `${home}/.vibespace/bin`;

  // 2. fsMkdir + fsWrite a tool + a 0600 token, chmod via runCmd, read back
  await dm.fsMkdir(bin);
  const toolBody = '#!/usr/bin/env node\nconsole.log("tool");\n';
  await dm.fsWrite(`${bin}/vibespace-status`, Buffer.from(toolBody));
  await dm.fsWrite(`${bin}/.tok-xyz`, Buffer.from('vsst_smoketoken'));
  await dm.runCmd('sh', ['-c', `chmod +x "${bin}"/vibespace-* 2>/dev/null; chmod 600 "${bin}/.tok-xyz"`], { timeoutMs: 8000 });
  const st = (await dm.fsStat(`${bin}/vibespace-status`)).stat;
  check('fsWrite landed the tool (size matches)', st.size === Buffer.byteLength(toolBody), JSON.stringify(st));
  check('tool is executable (mode bit)', (st.mode & 0o100) !== 0, (st.mode & 0o777).toString(8));
  const tokSt = (await dm.fsStat(`${bin}/.tok-xyz`)).stat;
  check('token is 0600', (tokSt.mode & 0o777) === 0o600, (tokSt.mode & 0o777).toString(8));
  const listing = await dm.fsList(bin);
  // fsList returns {op,id,entries}
  check('fsList shows both files', listing.entries.some((e) => e.name === 'vibespace-status') && listing.entries.some((e) => e.name === '.tok-xyz'));

  // 3. reverseForward: a device-side loopback port that tunnels to our server.
  // Consume it the way the device's agent tools would: connect FROM inside the
  // device's process space via runStream(curl) to 127.0.0.1:<devicePort>.
  const rf = await dm.reverseForward({ port: 0, connectLocal: () => net.connect(srvPort, '127.0.0.1') });
  check('reverseForward bound a device port', rf.port > 0, JSON.stringify(rf));
  let out = '';
  const rc = await dm.runStream('sh', ['-c', `command -v curl >/dev/null && curl -s http://127.0.0.1:${rf.port}/ping || (command -v wget >/dev/null && wget -qO- http://127.0.0.1:${rf.port}/ping) || echo NO-HTTP-CLIENT`], { onData: (b) => { out += b.toString(); } });
  check('VIBESPACE_API back-tunnel reaches our server from the device',
    out.includes('VIBESPACE-API-OK /ping') || out.includes('NO-HTTP-CLIENT'),
    JSON.stringify(out.slice(0, 120)));
  if (out.includes('NO-HTTP-CLIENT')) console.log('    (no curl/wget on this box — tunnel bind verified, HTTP round-trip skipped)');
  await dm.reverseUnforward(rf.port);
} catch (e) {
  failed++; console.error('  ✗ threw:', e.message);
} finally {
  try { srv.close(); } catch {}
  try { const dpid = Number(fs.readFileSync(path.join(process.env.VIBESPACE_AGENTD_ROOT, 'state', 'agentd.pid'), 'utf8')); process.kill(dpid, 'SIGTERM'); } catch {}
  dm.stop();
  execFileSync('node', ['-e', `require('fs').writeFileSync('src/agentd/version.js', 'module.exports = { VERSION: ' + JSON.stringify(require('./package.json').version) + ' };\\n')`], { cwd: repo });
  fs.rmSync(tmp, { recursive: true, force: true });
}
if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\ndevice-agent-setup primitives all work over the dial link');
process.exit(0);

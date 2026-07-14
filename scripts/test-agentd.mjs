#!/usr/bin/env node
// M0 e2e for vibespace-agentd (docs/design-remote-cs.md "= the local config").
// Builds the daemon bundle into a temp install root, then via DeviceManager:
// mint token → install → spawn → handshake ok → status → self-upgrade on a
// version bump (bundle streamed, dir swapped, re-exec) → reconnect to the new
// version → multi-connection (a second concurrent server). Everything runs
// against a THROWAWAY VIBESPACE_AGENTD_ROOT — never the real ~/.vibespace.
// Run: node scripts/test-agentd.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(dir, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-agentd-'));
const AGENTD_ROOT = path.join(tmp, 'agentd');
const dataDir = path.join(tmp, 'data');
fs.mkdirSync(dataDir, { recursive: true });
process.env.VIBESPACE_AGENTD_ROOT = AGENTD_ROOT;

let failed = 0;
const check = (name, cond, extra) => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.error(`  ✗ ${name}${extra ? `\n    ${extra}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// build the daemon bundle at two "versions" (same code, different stamp)
function buildBundle(version, outfile) {
  fs.writeFileSync(path.join(repo, 'src/agentd/version.js'), `module.exports = { VERSION: ${JSON.stringify(version)} };\n`);
  execFileSync('npx', ['esbuild', 'src/agentd/agentd.js', '--bundle', '--platform=node', `--outfile=${outfile}`], { cwd: repo });
}

const bundleA = path.join(tmp, 'agentd-A.js');
const bundleB = path.join(tmp, 'agentd-B.js');
buildBundle('9.9.1', bundleA);
buildBundle('9.9.2', bundleB);

const { DeviceManager } = require('../src/agentd/client.js');

console.log('— agentd M0: mint token, install, spawn, handshake —');
const dmA = new DeviceManager({ dataDir, bundlePath: bundleA, version: '9.9.1', log: () => {} });
dmA.installLocal();
check('install landed current symlink', fs.existsSync(path.join(AGENTD_ROOT, 'current', 'agentd.js')), '');
const conn = await dmA.connect();
check('handshake produced a connection', !!conn && !!conn.info, '');
check('daemon reports its version + platform', conn.info.daemonVersion === '9.9.1' && !!conn.info.arch, JSON.stringify(conn.info));
check('token minted 0600 + sha stored server-side', (() => {
  const tokFile = path.join(AGENTD_ROOT, 'state', 'token');
  const st = fs.statSync(tokFile);
  const toks = JSON.parse(fs.readFileSync(path.join(dataDir, 'agentd-tokens.json'), 'utf8'));
  return (st.mode & 0o777) === 0o600 && !!toks.local && fs.readFileSync(tokFile, 'utf8').startsWith('vsht_');
})(), '');

console.log('— agentd M0: auth failure on a bad token —');
{
  // hand-forge a hello with the wrong token straight to the socket
  const net = await import('node:net');
  const { Mux, PROTO_VERSION } = require('../src/agentd/mux.js');
  const res = await new Promise((resolve) => {
    const s = net.connect(path.join(AGENTD_ROOT, 'state', 'agentd.sock'));
    const mux = new Mux(s, { heartbeat: false, onControl: (m) => resolve(m.op) });
    s.on('connect', () => mux.control({ op: 'hello', protoVersion: PROTO_VERSION, hostToken: 'vsht_WRONG' }));
    s.on('error', () => resolve('error'));
    setTimeout(() => resolve('timeout'), 3000);
  });
  check('bad token rejected with auth-fail', res === 'auth-fail', res);
}

console.log('— agentd M0: heartbeat keeps a connection alive —');
await sleep(1200);
check('connection still live after idle', !!dmA.status().connected, JSON.stringify(dmA.status()));

console.log('— agentd M0: server-initiated self-upgrade + re-exec —');
const pidBefore = Number(fs.readFileSync(path.join(AGENTD_ROOT, 'state', 'agentd.pid'), 'utf8').trim());
dmA.stop();
await sleep(300);
// a NEW server at version 9.9.2 connects → sees drift → streams bundle B → daemon re-execs
const dmB = new DeviceManager({ dataDir, bundlePath: bundleB, version: '9.9.2', log: () => {} });
const conn2 = await dmB.connect();
check('reconnected after upgrade', !!conn2 && !!conn2.info, '');
check('daemon now reports the upgraded version', conn2.info.daemonVersion === '9.9.2', JSON.stringify(conn2.info));
check('9.9.2 install dir exists', fs.existsSync(path.join(AGENTD_ROOT, '9.9.2', 'agentd.js')), '');
check('current symlink repointed to 9.9.2', fs.readlinkSync(path.join(AGENTD_ROOT, 'current')).includes('9.9.2'), '');
const pidAfter = Number(fs.readFileSync(path.join(AGENTD_ROOT, 'state', 'agentd.pid'), 'utf8').trim());
check('daemon re-exec produced a new pid', pidAfter !== pidBefore, `${pidBefore} → ${pidAfter}`);

console.log('— agentd M0: multiple concurrent servers on one daemon —');
const dmC = new DeviceManager({ dataDir, bundlePath: bundleB, version: '9.9.2', log: () => {} });
const conn3 = await dmC.connect();
check('a second concurrent server connects to the same daemon', !!conn3 && dmB.status().connected && dmC.status().connected, '');

console.log('— agentd M0: flock singleton (no double daemon) —');
{
  // spawn a second daemon directly — it must refuse (exit 3)
  const cur = path.join(AGENTD_ROOT, 'current', 'agentd.js');
  const r = spawnSync(process.execPath, [cur], { env: { ...process.env }, timeout: 5000 });
  check('second daemon instance refuses (singleton)', r.status === 3, `status=${r.status}`);
}

dmB.stop(); dmC.stop();
// kill the daemon we spawned
try { process.kill(pidAfter, 'SIGTERM'); } catch {}
// restore the real version stamp
execFileSync('node', ['-e', `require('fs').writeFileSync('src/agentd/version.js', 'module.exports = { VERSION: ' + JSON.stringify(require('./package.json').version) + ' };\\n')`], { cwd: repo });
fs.rmSync(tmp, { recursive: true, force: true });
if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nall agentd M0 tests passed');
process.exit(0);

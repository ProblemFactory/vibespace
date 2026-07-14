#!/usr/bin/env node
// M2 REAL-SSH e2e: install agentd on an actual host over ssh, then reach its
// STANDING daemon over a genuine `ssh host -- node agentd.js --stdio` bridge,
// run a persistent pipe session, DROP the ssh bridge, and reattach by offset.
// This is the real-machine proof of the M2 architecture (the AIDev test box).
// Usage: node scripts/test-agentd-real-ssh.mjs <hostId>
//   (hostId from data/hosts.json; needs key auth + node on the host)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(dir, '..');
const hostId = process.argv[2];
if (!hostId) { console.error('usage: test-agentd-real-ssh.mjs <hostId>'); process.exit(2); }

let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { HostManager } = require('../src/hosts.js');
const hosts = new HostManager({ dataDir: path.join(repo, 'data') });
const h = hosts.get(hostId);
console.log(`host: ${h.user}@${h.host}`);

// use a THROWAWAY remote root so we never touch a real ~/.vibespace/agentd
const REMOTE_ROOT = `/tmp/vs-agentd-realtest-${Date.now()}`;
const version = require('../package.json').version;
const token = 'vsht_realtest_' + crypto.randomBytes(8).toString('hex');
const bundle = path.join(repo, 'data/bin/vibespace-agentd.js');
if (!fs.existsSync(bundle)) { console.error('build the bundle first: npm run build:agentd'); process.exit(2); }

// ── install: ship bundle + token into the throwaway remote root ──
console.log('— installing agentd on the host (throwaway root) —');
const sshBase = hosts.sshArgs(h, { multiplex: true });
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-realstage-'));
fs.copyFileSync(bundle, path.join(stage, 'agentd.js'));
fs.writeFileSync(path.join(stage, 'token'), token, { mode: 0o600 });
const tar = execFileSync('tar', ['-c', '-C', stage, 'agentd.js', 'token'], { maxBuffer: 32 * 1024 * 1024 });
const remoteInstall = `umask 077; mkdir -p ${REMOTE_ROOT}/${version} ${REMOTE_ROOT}/state; tar -x -C ${REMOTE_ROOT}/state; mv -f ${REMOTE_ROOT}/state/agentd.js ${REMOTE_ROOT}/${version}/agentd.js; chmod 600 ${REMOTE_ROOT}/state/token; ln -sfn ${REMOTE_ROOT}/${version} ${REMOTE_ROOT}/current; echo INSTALLED`;
execFileSync('ssh', [...sshBase, '--', remoteInstall], { input: tar, timeout: 30000 });
fs.rmSync(stage, { recursive: true, force: true });
check('bundle + token installed on the host', true, '');

const { DeviceManager } = require('../src/agentd/client.js');
// the remote command sets the throwaway root + PATH/nvm so node resolves
const remoteCmd = `export PATH="$HOME/.local/bin:$PATH"; [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; VIBESPACE_AGENTD_ROOT=${REMOTE_ROOT} exec node ${REMOTE_ROOT}/current/agentd.js --stdio`;
const transport = { kind: 'ssh', hostToken: token, sshBin: 'ssh', sshArgs: sshBase, remoteCmd };
const dm = new DeviceManager({ dataDir: path.join(repo, 'data'), bundlePath: bundle, version, transport, log: () => {} });

console.log('— handshake over a REAL ssh stdio bridge —');
const conn = await dm.connect();
check('daemon reachable + authed over ssh', !!conn?.info && conn.info.daemonVersion === version, JSON.stringify(conn?.info?.daemonVersion));
check('daemon reports the host platform/arch', !!conn.info.arch && !!conn.info.platform, JSON.stringify({ p: conn.info.platform, a: conn.info.arch }));

console.log('— persistent pipe session on the host, survives an ssh drop —');
const STUB = 'process.stdin.setEncoding("utf8");let b="";process.stdin.on("data",d=>{b+=d;let i;while((i=b.indexOf("\\n"))!==-1){const l=b.slice(0,i);b=b.slice(i+1);if(l==="quit")process.exit(7);console.log("echo:"+l)}});setInterval(()=>{},1e3);';
let out = Buffer.alloc(0);
const sid = 'realsess-1';
const hs = await dm.openPipeSession({ sid, cmd: 'node', args: ['-e', STUB] });
hs.onData = (b) => { out = Buffer.concat([out, b]); };
const r1 = await hs.ready;
check('pipe session spawned on the host', r1.pid > 0, JSON.stringify(r1));
await sleep(600);
hs.write('one\n');
await sleep(900);
check('stdout relays back over real ssh', out.toString().includes('echo:one'), JSON.stringify(out.toString()));

const consumed = out.length;
console.log('— DROP the ssh bridge — daemon + session survive on the host —');
dm.stop();
await sleep(700);
// verify the child is still alive ON THE HOST (independent ssh probe)
const aliveProbe = execFileSync('ssh', [...sshBase, '--', `cat ${REMOTE_ROOT}/state/sessions/${sid}.json 2>/dev/null`], { encoding: 'utf-8', timeout: 15000 });
const meta = JSON.parse(aliveProbe);
const stillAlive = execFileSync('ssh', [...sshBase, '--', `kill -0 ${meta.childPid} 2>/dev/null && echo ALIVE || echo DEAD`], { encoding: 'utf-8', timeout: 15000 }).trim();
check('session child SURVIVES the ssh drop (host-side probe)', stillAlive === 'ALIVE', stillAlive);

console.log('— reconnect over a fresh ssh bridge, reattach by offset —');
const dm2 = new DeviceManager({ dataDir: path.join(repo, 'data'), bundlePath: bundle, version, transport, log: () => {} });
let out2 = Buffer.alloc(0);
const hs2 = await dm2.openPipeSession({ sid, offset: consumed });
hs2.onData = (b) => { out2 = Buffer.concat([out2, b]); };
await hs2.ready;
await sleep(500);
check('no replay at the offset', out2.length === 0, JSON.stringify(out2.toString().slice(0, 80)));
hs2.write('two\n');
await sleep(900);
check('post-reconnect input flows to the surviving session', out2.toString().includes('echo:two'), JSON.stringify(out2.toString()));
hs2.write('quit\n');
await sleep(1000);
check('exit sentinel arrives', out2.toString().includes('"_remote_exit"') && out2.toString().includes('"code":7'), JSON.stringify(out2.toString().slice(-100)));

dm2.stop();
// cleanup: kill the daemon + remove the throwaway root on the host
console.log('— cleanup on host —');
try {
  const dpid = execFileSync('ssh', [...sshBase, '--', `cat ${REMOTE_ROOT}/state/agentd.pid 2>/dev/null`], { encoding: 'utf-8', timeout: 15000 }).trim();
  execFileSync('ssh', [...sshBase, '--', `kill ${dpid} 2>/dev/null; rm -rf ${REMOTE_ROOT}`], { timeout: 15000 });
  check('daemon killed + throwaway root removed', true, '');
} catch (e) { console.warn('  · cleanup warning:', e.message); }

if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nall agentd M2 REAL-SSH tests passed');
process.exit(0);

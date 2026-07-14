#!/usr/bin/env node
// M2 e2e: the agentd protocol over the SSH STDIO BRIDGE + persistent
// pipe-sessions (docs/design-remote-cs.md M2). The "remote" is localhost over
// a real `ssh` process when key auth to self works, else a `sh -c` stdio
// bridge stand-in (same code path in agentd — the bridge doesn't care what
// carries its stdio). Proves: bridge reaches/spawns the standing daemon,
// handshake+auth over stdio, a pipe session created through the bridge
// SURVIVES the bridge dying (ssh drop), byte-offset reattach replays exactly
// the missed bytes, and the exit sentinel arrives. Throwaway roots only.
// Run: node scripts/test-agentd-remote.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(dir, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-agentd-m2-'));
const AGENTD_ROOT = path.join(tmp, 'agentd');
const dataDir = path.join(tmp, 'data');
fs.mkdirSync(dataDir, { recursive: true });

let failed = 0;
const check = (name, cond, extra) => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.error(`  ✗ ${name}${extra ? `\n    ${extra}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// build the bundle + land it in the "remote" install root (as remote install would)
const version = require('../package.json').version;
fs.writeFileSync(path.join(repo, 'src/agentd/version.js'), `module.exports = { VERSION: ${JSON.stringify(version)} };\n`);
const bundle = path.join(tmp, 'agentd.js');
execFileSync('npx', ['esbuild', 'src/agentd/agentd.js', '--bundle', '--platform=node', '--external:node-pty', `--outfile=${bundle}`], { cwd: repo });
const instDir = path.join(AGENTD_ROOT, version);
fs.mkdirSync(instDir, { recursive: true });
fs.copyFileSync(bundle, path.join(instDir, 'agentd.js'));
fs.symlinkSync(instDir, path.join(AGENTD_ROOT, 'current'));
// pre-provision the host token (what remote install does over ssh)
const stateDir = path.join(AGENTD_ROOT, 'state');
fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
const TOKEN = 'vsht_m2test' + Math.floor(performance.now());
fs.writeFileSync(path.join(stateDir, 'token'), TOKEN, { mode: 0o600 });

const { DeviceManager } = require('../src/agentd/client.js');

// the "ssh" transport: a local sh bridge with the remote env injected — the
// same stdio path agentd's --stdio mode serves for a real ssh
const transport = {
  kind: 'ssh',
  hostToken: TOKEN,
  sshBin: 'sh',
  sshArgs: ['-c'],
  remoteCmd: `VIBESPACE_AGENTD_ROOT=${JSON.stringify(AGENTD_ROOT)} exec node ${JSON.stringify(path.join(AGENTD_ROOT, 'current', 'agentd.js'))} --stdio`,
};
// sh -c takes the command as the NEXT arg; our client appends ['--', remoteCmd]
// which sh reads as $0 — adapt: use bash -c with -- ignored via a wrapper
transport.sshArgs = [];
transport.sshBin = path.join(tmp, 'fake-ssh');
fs.writeFileSync(transport.sshBin, `#!/bin/sh\n# fake ssh: ignore leading --, exec the command string\nwhile [ "$1" = "--" ]; do shift; done\nexec sh -c "$1"\n`, { mode: 0o755 });

console.log('— M2: stdio bridge reaches + spawns the standing daemon —');
const dm = new DeviceManager({ dataDir, bundlePath: bundle, version, transport, log: () => {} });
const conn = await dm.connect();
check('handshake over the ssh-stdio bridge', !!conn?.info, '');
check('daemon version + auth via provisioned host token', conn.info.daemonVersion === version, JSON.stringify(conn.info?.daemonVersion));
const daemonPid = Number(fs.readFileSync(path.join(stateDir, 'agentd.pid'), 'utf8'));
check('daemon is setsid-detached on the "remote"', daemonPid > 0, String(daemonPid));

console.log('— M2: persistent pipe session through the bridge —');
const STUB = 'process.stdin.setEncoding("utf8");let b="";process.stdin.on("data",d=>{b+=d;let i;while((i=b.indexOf("\\n"))!==-1){const l=b.slice(0,i);b=b.slice(i+1);if(l==="quit")process.exit(7);console.log("echo:"+l)}});setInterval(()=>{},1e3);';
let out = Buffer.alloc(0);
const h = await dm.openPipeSession({ sid: 'm2sess-1', cmd: process.execPath, args: ['-e', STUB] });
h.onData = (buf) => { out = Buffer.concat([out, buf]); };
const r1 = await h.ready;
check('pipe session spawned (daemon-owned)', r1.pid > 0 && !r1.existing, JSON.stringify(r1));
await sleep(400);
h.write('one\n');
await sleep(700);
check('stdout flows: bridge → mux → buffer tail', out.toString().includes('echo:one'), JSON.stringify(out.toString()));

console.log('— M2: the bridge dies (ssh drop) — session survives, offset reattach —');
const consumed = out.length; // wrapper-style byte accounting
dm.stop(); // kills the fake-ssh bridge = the ssh drop
await sleep(500);
const meta1 = JSON.parse(fs.readFileSync(path.join(stateDir, 'sessions', 'm2sess-1.json'), 'utf8'));
let stubAlive = true; try { process.kill(meta1.childPid, 0); } catch { stubAlive = false; }
check('child SURVIVES the bridge death (daemon-owned, detached)', stubAlive, '');
const dm2 = new DeviceManager({ dataDir, bundlePath: bundle, version, transport, log: () => {} });
let out2 = Buffer.alloc(0);
const h2 = await dm2.openPipeSession({ sid: 'm2sess-1', offset: consumed }); // attach-only
h2.onData = (buf) => { out2 = Buffer.concat([out2, buf]); };
const r2 = await h2.ready;
check('attach-only reattach reports existing', r2.existing === true, JSON.stringify(r2));
await sleep(400);
check('no replay at the exact offset', out2.length === 0, JSON.stringify(out2.toString().slice(0, 80)));
h2.write('two\n');
await sleep(700);
check('post-reattach input still flows', out2.toString().includes('echo:two'), JSON.stringify(out2.toString()));

console.log('— M2: exit sentinel through the byte stream —');
h2.write('quit\n');
await sleep(900);
check('sentinel _remote_exit code 7 in the stream', out2.toString().includes('"_remote_exit"') && out2.toString().includes('"code":7'), JSON.stringify(out2.toString().slice(-120)));
const meta2 = JSON.parse(fs.readFileSync(path.join(stateDir, 'sessions', 'm2sess-1.json'), 'utf8'));
check('meta records exited', meta2.exited === 7, JSON.stringify(meta2));

console.log('— M2: reopen after exit is drain-only (never respawns — B-0343 law) —');
const dm3 = new DeviceManager({ dataDir, bundlePath: bundle, version, transport, log: () => {} });
let out3 = Buffer.alloc(0);
const h3 = await dm3.openPipeSession({ sid: 'm2sess-1', cmd: process.execPath, args: ['-e', STUB] });
h3.onData = (buf) => { out3 = Buffer.concat([out3, buf]); };
await h3.ready;
await sleep(500);
const meta3 = JSON.parse(fs.readFileSync(path.join(stateDir, 'sessions', 'm2sess-1.json'), 'utf8'));
check('exited session NOT respawned (same pid recorded, exited kept)', meta3.childPid === meta1.childPid && meta3.exited === 7, JSON.stringify(meta3));
check('drain includes the sentinel', out3.toString().includes('"_remote_exit"'), '');

dm2.stop(); dm3.stop();
try { process.kill(daemonPid, 'SIGTERM'); } catch {}
execFileSync('node', ['-e', `require('fs').writeFileSync('src/agentd/version.js', 'module.exports = { VERSION: ' + JSON.stringify(require('./package.json').version) + ' };\\n')`], { cwd: repo });
fs.rmSync(tmp, { recursive: true, force: true });
if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nall agentd M2 remote tests passed');
process.exit(0);
